import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import {
  Book,
  BookPage,
  Character,
  GenerationJob,
  MediaAsset,
} from '../../../models/index.js';
import { memoryDriver } from '../../../providers/storage/memory.driver.js';
import { pollOnce } from '../image.service.js';

let mongod;
let app;

const gen = (path) => `${API_PREFIX}/generation${path}`;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_autopilot_test' });
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

afterEach(async () => {
  // A run starts its stages in the background. Letting one still in flight write
  // after the collections are wiped bleeds it into the next test.
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const pending = await GenerationJob.countDocuments({ status: 'queued' });
    if (pending === 0) break;
    await new Promise((r) => setTimeout(r, 40));
  }

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

/** A freshly planned book: a draft cast and pages nobody has illustrated yet. */
async function seedPlannedBook(userId, { pageCount = 2, cast = ['Mira'] } = {}) {
  const characters = await Character.create(
    cast.map((name, index) => ({
      ownerId: userId,
      name,
      role: index === 0 ? 'main' : 'supporting',
      appearance: `${name} is a child in a yellow raincoat.`,
      artStyle: '3D Storybook',
      status: 'draft',
      identity: { consistencyPrompt: `${name}: dark curly hair, yellow raincoat.` },
    })),
  );

  const book = await Book.create({
    ownerId: userId,
    title: 'Mira and the Little Rain Cloud',
    subtitle: 'A gentle story about friendship',
    genre: 'Friendship',
    artStyle: '3D Storybook',
    pageCount,
    status: 'plan_ready',
    characterIds: characters.map((c) => c._id),
  });

  await BookPage.create(
    Array.from({ length: pageCount }, (_, index) => ({
      bookId: book._id,
      ownerId: userId,
      order: index + 1,
      title: `Page ${index + 1}`,
      narration: `Narration ${index + 1}`,
      illustrationPrompt: `Illustration prompt ${index + 1}`,
      characterIds: [characters[0]._id],
      status: 'pending',
    })),
  );

  return { book, characters };
}

let taskCounter = 0;

function stubKie({ failFor = [] } = {}) {
  const calls = { create: [] };
  const taskState = new Map();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const path = String(url);

      if (path.includes('/jobs/createTask')) {
        const body = JSON.parse(init.body);
        calls.create.push(body);
        const id = `auto-task-${++taskCounter}`;
        taskState.set(id, failFor.some((f) => body.input.prompt.includes(f)) ? 'fail' : 'success');
        return { ok: true, status: 200, json: async () => ({ code: 200, data: { taskId: id } }) };
      }

      if (path.includes('/jobs/recordInfo')) {
        const id = new URL(path, 'http://x').searchParams.get('taskId');
        const state = taskState.get(id) ?? 'success';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            data: {
              taskId: id,
              state,
              resultJson:
                state === 'success' ? JSON.stringify({ resultUrls: [`https://cdn/${id}.png`] }) : '',
              failMsg: state === 'fail' ? 'provider said no' : null,
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
 * A stage is started in the background, so its jobs appear a moment after the
 * one before them settles. Waiting for the documents alone is not enough — a job
 * is written as `queued` before the provider hands back a task id, and polling
 * one with no task id yet does nothing.
 */
async function waitForJobs(type, count, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const jobs = await GenerationJob.find({ type });
    const ready = jobs.filter(
      (job) => job.externalTaskId || ['succeeded', 'failed'].includes(job.status),
    );
    if (ready.length >= count) return ready;
    await new Promise((r) => setTimeout(r, 40));
  }

  return GenerationJob.find({ type });
}

/** Settles every job of a type that has not settled yet. */
async function settleAll(type) {
  const jobs = await GenerationJob.find({ type, status: { $in: ['queued', 'processing'] } });
  for (const job of jobs) await pollOnce(job._id);
}

describe('autopilot', () => {
  it('draws the cast, then the pages, then the cover — with nobody pressing anything', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedPlannedBook(userId, { pageCount: 2 });
    stubKie();

    const res = await asUser(request(app).post(gen(`/books/${book._id}/autopilot`)), token).send({
      characterImages: 'generate',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ started: true, stage: 'characters', characters: 1, pages: 2 });
    // 1 character × 3 + 2 pages × 2 + 1 cover × 2

    // Stage 1 — the cast.
    await waitForJobs('character_image', 1);
    await settleAll('character_image');
    expect((await Book.findById(book._id)).autopilot.stage).toBe('pages');

    // Stage 2 — the pages, started by the last character landing.
    await waitForJobs('page_image', 2);
    await settleAll('page_image');
    expect((await Book.findById(book._id)).autopilot.stage).toBe('cover');

    // Stage 3 — the cover, started by the last page landing.
    await waitForJobs('book_cover', 1);
    await settleAll('book_cover');

    const finished = await Book.findById(book._id);
    expect(finished.autopilot.stage).toBe('done');
    expect(finished.autopilot.completedAt).toBeTruthy();
    expect(finished.coverSource).toBe('generated');
    expect(finished.status).toBe('ready');

    expect(await BookPage.countDocuments({ bookId: book._id, status: 'ready' })).toBe(2);
  });

  it('anchors uploaded photographs to the lead, so the hero is who the author meant', async () => {
    const { token, userId } = await signUp();
    const { book, characters } = await seedPlannedBook(userId, { cast: ['Mira', 'Dadi'] });
    const calls = stubKie();

    const asset = await MediaAsset.create({
      ownerId: userId,
      kind: 'reference',
      status: 'stored',
      storage: {
        driver: 'memory',
        key: `reference/${userId}/photo.png`,
        contentType: 'image/png',
        sizeBytes: 68,
      },
    });

    await asUser(request(app).post(gen(`/books/${book._id}/autopilot`)), token).send({
      characterImages: 'upload',
      referenceAssetIds: [String(asset._id)],
    });

    await waitForJobs('character_image', 2);

    const lead = await Character.findById(characters[0]._id);
    const supporting = await Character.findById(characters[1]._id);

    expect(lead.role).toBe('main');
    expect(lead.identity.referenceAssetIds.map(String)).toContain(String(asset._id));
    expect(supporting.identity.referenceAssetIds).toHaveLength(0);

    // And the photograph actually reached the provider as a visual anchor.
    const leadCall = calls.create.find((c) => c.input.prompt.includes('Mira'));
    expect(leadCall.input.image_input?.length ?? 0).toBeGreaterThan(0);
  });

  it('keeps going when a character cannot be drawn', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedPlannedBook(userId, { pageCount: 2 });
    stubKie({ failFor: ['Mira: dark curly hair'] });

    await asUser(request(app).post(gen(`/books/${book._id}/autopilot`)), token).send({});

    await waitForJobs('character_image', 1);
    await settleAll('character_image');

    // A book with one vaguer character still beats no book.
    expect((await Book.findById(book._id)).autopilot.stage).toBe('pages');
    expect(await waitForJobs('page_image', 2)).toHaveLength(2);
  });

  it('reports the stage it is on, so the screen never looks stuck', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedPlannedBook(userId, { pageCount: 2 });
    stubKie();

    await asUser(request(app).post(gen(`/books/${book._id}/autopilot`)), token).send({});
    await waitForJobs('character_image', 1);

    const res = await asUser(request(app).get(gen(`/books/${book._id}/progress`)), token);

    // No page has been touched yet, so the page counters are all zero. Without
    // the stage the screen would show "0 of 2" and look frozen.
    expect(res.body.data.autopilot).toMatchObject({
      enabled: true,
      stage: 'characters',
      isRunning: true,
    });
    expect(res.body.data.characters).toHaveLength(1);
    expect(res.body.data.characters[0]).toMatchObject({ name: 'Mira', role: 'main' });
  });

  it('does not start a second run over a first', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedPlannedBook(userId, { pageCount: 2 });
    stubKie();

    await asUser(request(app).post(gen(`/books/${book._id}/autopilot`)), token).send({});
    await waitForJobs('character_image', 1);

    const again = await asUser(request(app).post(gen(`/books/${book._id}/autopilot`)), token).send({});

    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ started: false, alreadyRunning: true });
  });

  it('refuses another account’s book', async () => {
    const mine = await signUp('mine@example.com');
    const theirs = await signUp('theirs@example.com');
    const { book } = await seedPlannedBook(theirs.userId);
    stubKie();

    const res = await asUser(request(app).post(gen(`/books/${book._id}/autopilot`)), mine.token).send(
      {},
    );
    expect(res.status).toBe(404);
  });
});
