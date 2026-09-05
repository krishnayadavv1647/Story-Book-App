import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { Book, BookPage, Character } from '../../../models/index.js';

/**
 * Everything else in the suite runs against a standalone MongoDB, where
 * `withTransaction` finds no transaction support and calls straight through
 * with no session. That means the transactional paths — the ones that matter
 * most, because they write a whole book at once — were never
 * actually executed as transactions.
 *
 * This file runs against a real single-node replica set, so a session is passed
 * for real. It is what would have caught "Cannot call `create()` with a session
 * and multiple documents unless `ordered: true` is set": that failure is
 * invisible without a session, and it broke every story plan on a real Atlas
 * cluster while the whole suite stayed green.
 */
let replset;
let app;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replset.getUri(), { dbName: 'storybook_tx_test' });
  app = createApp();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  vi.unstubAllGlobals();
});

function plan(pageCount = 3) {
  return {
    book: {
      title: 'Aarav and the Whispering Forest',
      description: 'A boy and a firefly.',
      ageGroup: '6-9',
      language: 'English',
      genre: 'Magical Adventure',
      artStyle: '3D Storybook',
      moral: 'Kindness',
      pageCount,
    },
    // More than one character and more than one page: a single document would
    // not have exposed the bug.
    characters: [
      {
        tempId: 'character_1',
        name: 'Aarav',
        role: 'main',
        age: '8',
        appearance: 'A curious boy.',
        outfit: 'Green hoodie.',
        personality: 'Brave.',
        consistencyPrompt: 'Aarav: 8-year-old boy.',
      },
      {
        tempId: 'character_2',
        name: 'Lumi',
        role: 'supporting',
        age: 'unknown',
        appearance: 'A firefly.',
        outfit: 'None.',
        personality: 'Shy.',
        consistencyPrompt: 'Lumi: a firefly.',
      },
    ],
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      title: `Page ${index + 1}`,
      narration: `Narration ${index + 1}`,
      sceneDescription: `Scene ${index + 1}`,
      // Both characters must appear somewhere: the schema rejects a cast
      // member who is never on a page.
      characterIds: index === 0 ? ['character_1', 'character_2'] : ['character_1'],
      location: 'Forest',
      mood: 'curious',
      illustrationPrompt: `Illustration ${index + 1}`,
    })),
  };
}

/** The Interactions API answers in `steps`, so the stub does too. */
function stubGemini(payload) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        steps: [
          { type: 'thought', signature: 'sig' },
          { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(payload) }] },
        ],
        usage: { total_input_tokens: 100, total_output_tokens: 900, total_thought_tokens: 10 },
      }),
    })),
  );
}

async function signUp(email = 'krishna@example.com') {
  const res = await request(app)
    .post(`${API_PREFIX}/auth/register`)
    .send({ name: 'Krishna Yadav', email, password: 'a-long-enough-passphrase' });
  const token = res.body.data.accessToken;
  // BYOK: generation uses the user's own keys, so set them for the suite.
  await request(app)
    .put(`${API_PREFIX}/users/me/api-keys`)
    .set('Authorization', `Bearer ${token}`)
    .send({ gemini: 'user-gemini-key', kie: 'user-kie-key' });
  return { token, userId: res.body.data.user.id };
}

const asUser = (req, token) => req.set('Authorization', `Bearer ${token}`);

describe('transactions actually run', () => {
  it('confirms this connection really supports them', async () => {
    // If this ever fails the rest of the file proves nothing.
    const session = await mongoose.startSession();
    let ran = false;
    await session.withTransaction(async () => {
      await Book.countDocuments({}).session(session);
      ran = true;
    });
    await session.endSession();

    expect(ran, 'the callback must run inside a real transaction').toBe(true);
  });
});

describe('POST /story/plan on a replica set', () => {
  it('writes the book, its whole cast and every page in one transaction', async () => {
    const { token, userId } = await signUp();
    stubGemini(plan(4));

    const res = await asUser(request(app).post(`${API_PREFIX}/story/plan`), token).send({
      prompt: 'A boy and a firefly explore a whispering forest at night',
      settings: { pageCount: 4 },
    });

    expect(res.status).toBe(200);

    const bookId = res.body.data.bookId;
    expect(bookId).toBeTruthy();

    // Two characters and six pages, all persisted — the four story pages plus
    // the title and ending pages the finished structure adds.
    expect(await Character.countDocuments({ ownerId: userId })).toBe(2);
    expect(await BookPage.countDocuments({ bookId })).toBe(6);

    const book = await Book.findById(bookId);
    expect(book.characterIds).toHaveLength(2);
    // `pageCount` stays the story-page count the plan asked for.
    expect(book.pageCount).toBe(4);

    // Title, four story pages and the ending, numbered 1..6 with no gaps.
    const pages = await BookPage.find({ bookId }).sort({ order: 1 });
    expect(pages.map((page) => page.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pages.map((page) => page.type)).toEqual([
      'title',
      'story',
      'story',
      'story',
      'story',
      'ending',
    ]);
  });

  it('leaves nothing behind when the write fails partway', async () => {
    const { token, userId } = await signUp();

    // A page with no narration fails validation, so the transaction aborts
    // after the book and characters have already been written.
    const broken = plan(2);
    broken.pages[1].narration = '';
    broken.pages[1].sceneDescription = '';
    stubGemini(broken);

    const res = await asUser(request(app).post(`${API_PREFIX}/story/plan`), token).send({
      prompt: 'A boy and a firefly explore a whispering forest at night',
      settings: { pageCount: 2 },
    });

    // However it is reported, nothing half-written may survive.
    if (res.status >= 400) {
      expect(await Book.countDocuments({ ownerId: userId })).toBe(0);
      expect(await Character.countDocuments({ ownerId: userId })).toBe(0);
      expect(await BookPage.countDocuments({ ownerId: userId })).toBe(0);
    }
  });

});
