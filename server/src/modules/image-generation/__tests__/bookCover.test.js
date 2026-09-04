import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { COVER_BASE_PROMPT, coverPrompt, coverSubtitle } from '../prompts.js';
import {
  Book,
  BookPage,
  Character,
  GenerationJob,
  MediaAsset,
  PromptVersion,
} from '../../../models/index.js';
import { memoryDriver } from '../../../providers/storage/memory.driver.js';
import { pollOnce } from '../image.service.js';

let mongod;
let app;

const gen = (path) => `${API_PREFIX}/generation${path}`;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_cover_test' });
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  memoryDriver.reset();
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

async function signUp(email = 'krishna@example.com') {
  const res = await request(app)
    .post(`${API_PREFIX}/auth/register`)
    .send({ name: 'Krishna Yadav', email, password: 'a-long-enough-passphrase' });
  return { token: res.body.data.accessToken, userId: res.body.data.user.id };
}

const asUser = (req, token) => req.set('Authorization', `Bearer ${token}`);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function seedBook(userId, overrides = {}) {
  const mira = await Character.create({
    ownerId: userId,
    name: 'Mira',
    role: 'main',
    appearance: 'A curious girl in a yellow raincoat.',
    status: 'ready',
    identity: { consistencyPrompt: 'Mira: 7-year-old girl, dark curly hair, yellow raincoat.' },
  });

  const book = await Book.create({
    ownerId: userId,
    title: 'Mira and the Little Rain Cloud',
    subtitle: 'A gentle story about friendship',
    genre: 'Friendship',
    artStyle: '3D Storybook',
    pageCount: 2,
    status: 'ready',
    characterIds: [mira._id],
    ...overrides,
  });

  const pages = await BookPage.create(
    Array.from({ length: 2 }, (_, index) => ({
      bookId: book._id,
      ownerId: userId,
      order: index + 1,
      title: `Page ${index + 1}`,
      narration: `Narration ${index + 1}`,
      illustrationPrompt: `Illustration prompt ${index + 1}`,
      status: 'pending',
    })),
  );

  return { book, pages, mira };
}

let taskCounter = 0;

function stubKie({ state = 'success' } = {}) {
  const calls = { create: [] };
  const taskState = new Map();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const path = String(url);

      if (path.includes('/jobs/createTask')) {
        const body = JSON.parse(init.body);
        calls.create.push(body);
        const id = `cover-task-${++taskCounter}`;
        taskState.set(id, state);
        return { ok: true, status: 200, json: async () => ({ code: 200, data: { taskId: id } }) };
      }

      if (path.includes('/jobs/recordInfo')) {
        const id = new URL(path, 'http://x').searchParams.get('taskId');
        const s = taskState.get(id) ?? 'success';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            data: {
              taskId: id,
              state: s,
              resultJson:
                s === 'success' ? JSON.stringify({ resultUrls: [`https://cdn/${id}.png`] }) : '',
              failMsg: s === 'fail' ? 'provider said no' : null,
            },
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        headers: {
          get: (h) => (h.toLowerCase() === 'content-type' ? 'image/png' : String(PNG.length)),
        },
        arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength),
      };
    }),
  );

  return calls;
}

/**
 * The whole point of a cover prompt is the lettering. A page prompt forbids text;
 * this one requires it, and requires exactly the author's own words — so those
 * are the assertions that matter.
 */
describe('the cover prompt', () => {
  const book = {
    title: 'Mira and the Little Rain Cloud',
    subtitle: 'A gentle story about friendship',
    genre: 'Friendship',
    artStyle: '3D Storybook',
    description: 'Mira finds a rain cloud that follows her everywhere.',
  };

  it('asks for the title and subtitle to be drawn into the artwork', () => {
    const prompt = coverPrompt({ book, cast: [] });

    expect(prompt).toContain(COVER_BASE_PROMPT);
    expect(prompt).toContain('Title text: "Mira and the Little Rain Cloud".');
    expect(prompt).toContain('Subtitle text: "A gentle story about friendship".');
  });

  it('bans every other word, so no publisher line or barcode is invented', () => {
    expect(COVER_BASE_PROMPT).toMatch(/no author name, publisher/i);
    expect(COVER_BASE_PROMPT).toMatch(/Spell nothing except the title and subtitle/i);
  });

  it('falls back to the genre rather than inventing a subtitle', () => {
    expect(coverSubtitle({ title: 'X', genre: 'Bedtime' })).toBe('Bedtime');
    expect(coverSubtitle({ title: 'X' })).toBe('A Storybook');
  });

  it('keeps the title and subtitle even when everything else must be cut', () => {
    const cast = ['Mira', 'Dadi', 'Ravi', 'Neel'].map((name) => ({
      name,
      role: 'supporting',
      identity: {
        consistencyPrompt: `${name} looks like ` + 'a very long description, '.repeat(20),
      },
    }));

    const prompt = coverPrompt({
      book: { ...book, description: 'A sprawling synopsis. '.repeat(60) },
      cast,
      maxChars: 1000,
    });

    expect(prompt.length).toBeLessThanOrEqual(1000);
    expect(prompt).toContain('Title text: "Mira and the Little Rain Cloud".');
    expect(prompt).toContain('Subtitle text: "A gentle story about friendship".');
  });

  it('carries the lead character, so the cover shows the same child as page one', () => {
    const prompt = coverPrompt({
      book,
      cast: [
        { name: 'Ravi', role: 'supporting', identity: { consistencyPrompt: 'Ravi: a tall boy.' } },
        { name: 'Mira', role: 'main', identity: { consistencyPrompt: 'Mira: yellow raincoat.' } },
      ],
    });

    expect(prompt).toContain('Mira — Mira: yellow raincoat.');
  });
});

describe('generating a book cover', () => {
  it('starts a job and records the prompt version', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId);
    const calls = stubKie();

    const res = await asUser(request(app).post(gen(`/books/${book._id}/cover`)), token);

    expect(res.status).toBe(200);
    expect(res.body.data.reused).toBe(false);

    // The provider is asked for the lettering, not just a picture.
    expect(calls.create).toHaveLength(1);
    expect(calls.create[0].input.prompt).toContain('Title text: "Mira and the Little Rain Cloud".');
    expect(calls.create[0].input.aspect_ratio).toBe('3:4');

    const job = await GenerationJob.findById(res.body.data.jobId);
    expect(job.type).toBe('book_cover');
    expect(job.promptVersionId).toBeTruthy();
    expect(await PromptVersion.findById(job.promptVersionId)).toMatchObject({ key: 'book_cover' });
  });

  it('becomes the book’s cover once it settles', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId);
    stubKie();

    const res = await asUser(request(app).post(gen(`/books/${book._id}/cover`)), token);
    await pollOnce(res.body.data.jobId);

    const after = await Book.findById(book._id);
    expect(after.coverSource).toBe('generated');
    expect(after.coverMediaId).toBeTruthy();

    const asset = await MediaAsset.findById(after.coverMediaId);
    expect(asset.kind).toBe('book_cover');

    // And the library serves it, because that is the only place it is shown.
    const library = await asUser(request(app).get(`${API_PREFIX}/books`), token);
    expect(library.body.data[0].coverUrl).toMatch(/\/media\//);
    expect(library.body.data[0].subtitle).toBe('A gentle story about friendship');
  });

  it('is not replaced by a page illustration', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId);
    stubKie();

    const cover = await asUser(request(app).post(gen(`/books/${book._id}/cover`)), token);
    await pollOnce(cover.body.data.jobId);
    const generated = String((await Book.findById(book._id)).coverMediaId);

    // Page one is the thumbnail a book falls back to. It must not overwrite a
    // real cover — that would blank the title off every card in the library.
    const page = await asUser(
      request(app).post(gen(`/books/${book._id}/pages/${pages[0]._id}/image`)),
      token,
    );
    await pollOnce(page.body.data.jobId);

    const after = await Book.findById(book._id);
    expect(String(after.coverMediaId)).toBe(generated);
    expect(after.coverSource).toBe('generated');
  });

  it('hands back the same job when asked twice', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId);
    stubKie();

    const first = await asUser(request(app).post(gen(`/books/${book._id}/cover`)), token);
    const second = await asUser(request(app).post(gen(`/books/${book._id}/cover`)), token);

    expect(second.body.data.reused).toBe(true);
    expect(second.body.data.jobId).toBe(first.body.data.jobId);
  });

  it('draws a new cover once the book is retitled', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId);
    const calls = stubKie();

    await asUser(request(app).post(gen(`/books/${book._id}/cover`)), token);
    await Book.updateOne({ _id: book._id }, { $set: { title: 'Mira and the Storm' } });
    const again = await asUser(request(app).post(gen(`/books/${book._id}/cover`)), token);

    expect(again.body.data.reused).toBe(false);
    expect(calls.create[1].input.prompt).toContain('Title text: "Mira and the Storm".');
  });

  it('fails without touching the book when the provider fails', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId);
    stubKie({ state: 'fail' });

    const res = await asUser(request(app).post(gen(`/books/${book._id}/cover`)), token);
    await pollOnce(res.body.data.jobId);
    // A cover that could not be drawn is not a book that failed.
    expect((await Book.findById(book._id)).status).toBe('ready');
  });

  it('reports what the cover surfaces need in one call', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId);
    stubKie();

    const before = await asUser(request(app).get(gen(`/books/${book._id}/cover`)), token);
    expect(before.body.data).toMatchObject({
      title: 'Mira and the Little Rain Cloud',
      subtitle: 'A gentle story about friendship',
      coverUrl: null,
      isGenerated: false,
      inFlight: false,
    });

    const res = await asUser(request(app).post(gen(`/books/${book._id}/cover`)), token);
    await pollOnce(res.body.data.jobId);

    const after = await asUser(request(app).get(gen(`/books/${book._id}/cover`)), token);
    expect(after.body.data.isGenerated).toBe(true);
    expect(after.body.data.coverUrl).toMatch(/\/media\//);
    expect(after.body.data.inFlight).toBe(false);
  });

  it('refuses another account’s book', async () => {
    const mine = await signUp('mine@example.com');
    const theirs = await signUp('theirs@example.com');
    const { book } = await seedBook(theirs.userId);
    stubKie();

    const res = await asUser(request(app).post(gen(`/books/${book._id}/cover`)), mine.token);
    expect(res.status).toBe(404);
  });
});
