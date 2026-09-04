import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { pagePrompt } from '../prompts.js';
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
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_pageimg_test' });
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

afterEach(async () => {
  // The book fan-out is fire-and-forget by design. Without waiting for it to
  // quieten, a run still in flight keeps writing after the collections are
  // wiped and bleeds into the next test.
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

/** A book with a cast whose main character already has a generated front pose. */
async function seedBook(userId, pageCount = 3) {
  const asset = await MediaAsset.create({
    ownerId: userId,
    kind: 'character_image',
    status: 'stored',
    storage: { driver: 'memory', key: `character_image/${userId}/front.png`, contentType: 'image/png', sizeBytes: 68 },
  });

  const aarav = await Character.create({
    ownerId: userId,
    name: 'Aarav',
    role: 'main',
    appearance: 'A curious Indian boy.',
    artStyle: '3D Storybook',
    status: 'ready',
    primaryMediaId: asset._id,
    identity: { consistencyPrompt: 'Aarav: 8-year-old Indian boy, dark tousled hair.', fingerprint: 'fp-1' },
  });

  const book = await Book.create({
    ownerId: userId,
    title: 'Aarav and the Whispering Forest',
    artStyle: '3D Storybook',
    pageCount,
    status: 'plan_ready',
    characterIds: [aarav._id],
  });

  const pages = await BookPage.create(
    Array.from({ length: pageCount }, (_, index) => ({
      bookId: book._id,
      ownerId: userId,
      order: index + 1,
      title: `Page ${index + 1}`,
      narration: `Narration ${index + 1}`,
      sceneDescription: `A forest path, scene ${index + 1}.`,
      illustrationPrompt: `Illustration prompt ${index + 1}`,
      location: 'Whispering Forest',
      mood: 'curious',
      characterIds: [aarav._id],
      status: 'pending',
    })),
  );

  return { book, pages, aarav, asset };
}

// Task ids must be unique for the whole run — a provider never reissues one,
// and the (provider, externalTaskId) index is unique.
let taskCounter = 0;

function stubKie({ failFor = [], state = 'success' } = {}) {
  const calls = { create: [], download: [] };
  const taskState = new Map();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const path = String(url);

      if (path.includes('/jobs/createTask')) {
        const body = JSON.parse(init.body);
        calls.create.push(body);
        const id = `task-${++taskCounter}`;
        // A page whose prompt mentions a failing marker fails upstream.
        taskState.set(id, failFor.some((f) => body.input.prompt.includes(f)) ? 'fail' : state);
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
              resultJson: s === 'success' ? JSON.stringify({ resultUrls: [`https://cdn/${id}.png`] }) : '',
              failMsg: s === 'fail' ? 'provider said no' : null,
            },
          }),
        };
      }

      calls.download.push(path);
      return {
        ok: true,
        status: 200,
        headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'image/png' : String(PNG.length)) },
        arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength),
      };
    }),
  );

  return calls;
}

/**
 * The fan-out starts jobs in the background. Waiting for the documents to exist
 * is not enough — a job is written as `queued` before `createTask` returns, and
 * polling one with no provider task id yet is a no-op.
 */
async function waitForJobs(count, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const jobs = await GenerationJob.find({ type: 'page_image' });
    const ready = jobs.filter(
      (job) => job.externalTaskId || ['succeeded', 'failed', 'cancelled'].includes(job.status),
    );
    if (ready.length >= count) return jobs;
    await new Promise((r) => setTimeout(r, 40));
  }

  return GenerationJob.find({ type: 'page_image' });
}

describe('page illustration', () => {
  it('carries every character’s identity and reference image into the prompt', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 1);
    const calls = stubKie();

    const res = await asUser(
      request(app).post(gen(`/books/${book._id}/pages/${pages[0]._id}/image`)),
      token,
    );

    expect(res.status).toBe(200);

    const body = calls.create[0];
    // The image model has no memory of any other page, so the identity text
    // must travel with every request.
    expect(body.input.prompt).toContain('Aarav');
    expect(body.input.prompt).toContain('8-year-old Indian boy');
    expect(body.input.prompt).toContain('Whispering Forest');
    expect(body.input.prompt).toContain('3D Storybook');
    // And the generated front pose goes along as a visual anchor.
    expect(body.input.image_input).toHaveLength(1);
    expect(body.input.image_input[0]).toContain('/api/v1/media/');
    expect(body.input.aspect_ratio).toBe('4:3');
  });

  it('stores the image on the page and keeps the previous version recoverable', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 1);
    stubKie();

    const res = await asUser(
      request(app).post(gen(`/books/${book._id}/pages/${pages[0]._id}/image`)),
      token,
    );
    await pollOnce(res.body.data.jobId);

    const page = await BookPage.findById(pages[0]._id);
    expect(page.status).toBe('ready');
    expect(page.mediaAssetId).not.toBeNull();
    // A revision, not an overwrite — the page model's whole point.
    expect(page.revisions).toHaveLength(1);
    expect(page.activeRevisionId.toString()).toBe(page.revisions[0]._id.toString());
    expect(page.revisions[0].source).toBe('kie');
  });

  it('does not touch sibling pages', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 3);
    stubKie();

    const res = await asUser(
      request(app).post(gen(`/books/${book._id}/pages/${pages[1]._id}/image`)),
      token,
    );
    await pollOnce(res.body.data.jobId);

    const after = await BookPage.find({ bookId: book._id }).sort({ order: 1 });
    expect(after[1].status).toBe('ready');
    expect(after[0].status).toBe('pending');
    expect(after[2].status).toBe('pending');
    expect(after[0].revisions).toHaveLength(0);
  });

  it('re-runs when the character’s look has changed since the last illustration', async () => {
    const { token, userId } = await signUp();
    const { book, pages, aarav } = await seedBook(userId, 1);
    const calls = stubKie();

    const first = await asUser(
      request(app).post(gen(`/books/${book._id}/pages/${pages[0]._id}/image`)),
      token,
    );
    await pollOnce(first.body.data.jobId);

    // Same page, different character fingerprint — genuinely a new request.
    await Character.updateOne({ _id: aarav._id }, { $set: { 'identity.fingerprint': 'fp-2' } });

    const second = await asUser(
      request(app).post(gen(`/books/${book._id}/pages/${pages[0]._id}/image`)),
      token,
    );

    expect(second.body.data.reused).toBe(false);
    expect(second.body.data.jobId).not.toBe(first.body.data.jobId);
    expect(calls.create).toHaveLength(2);
  });
});

describe('illustrating a whole book', () => {
  it('starts a job per page and reports progress', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 3);
    stubKie();

    const res = await asUser(request(app).post(gen(`/books/${book._id}/images`)), token);

    expect(res.status).toBe(200);
    expect(res.body.data.started).toBe(3);

    const jobs = await waitForJobs(3);
    expect(jobs).toHaveLength(3);

    for (const job of jobs) await pollOnce(job._id);

    const progress = await asUser(request(app).get(gen(`/books/${book._id}/progress`)), token);
    expect(progress.body.data).toMatchObject({ total: 3, ready: 3, failed: 0, percent: 100 });
    expect(progress.body.data.pages.every((p) => p.imageUrl)).toBe(true);

    expect((await Book.findById(book._id)).status).toBe('ready');
  });

  it('lets one page fail without taking the rest down', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 3);
    stubKie({ failFor: ['Illustration prompt 2'] });

    await asUser(request(app).post(gen(`/books/${book._id}/images`)), token);
    const jobs = await waitForJobs(3);
    for (const job of jobs) await pollOnce(job._id);

    const progress = await asUser(request(app).get(gen(`/books/${book._id}/progress`)), token);
    expect(progress.body.data).toMatchObject({ total: 3, ready: 2, failed: 1 });

    const failed = progress.body.data.pages.find((p) => p.status === 'failed');
    expect(failed.order).toBe(2);
    expect(failed.error).toBeTruthy();
    expect((await Book.findById(book._id)).status).toBe('failed');
  });

  it('retries just the failed page', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 2);
    stubKie({ failFor: ['Illustration prompt 2'] });

    await asUser(request(app).post(gen(`/books/${book._id}/images`)), token);
    const jobs = await waitForJobs(2);
    for (const job of jobs) await pollOnce(job._id);

    const failedPage = await BookPage.findOne({ bookId: book._id, status: 'failed' });
    expect(failedPage.order).toBe(2);

    // Now the provider behaves.
    stubKie();
    const retry = await asUser(
      request(app).post(gen(`/books/${book._id}/pages/${failedPage._id}/image`)),
      token,
    );
    await pollOnce(retry.body.data.jobId);

    const progress = await asUser(request(app).get(gen(`/books/${book._id}/progress`)), token);
    expect(progress.body.data).toMatchObject({ total: 2, ready: 2, failed: 0 });
    expect((await Book.findById(book._id)).status).toBe('ready');
  });

  it('says so when there is nothing left to illustrate', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 1);
    await BookPage.updateMany({ bookId: book._id }, { $set: { status: 'ready' } });
    stubKie();

    const res = await asUser(request(app).post(gen(`/books/${book._id}/images`)), token);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOTHING_TO_GENERATE');
  });

  it('refuses another account’s book', async () => {
    const mine = await signUp('mine@example.com');
    const theirs = await signUp('theirs@example.com');
    const { book } = await seedBook(theirs.userId, 1);
    stubKie();

    const res = await asUser(request(app).post(gen(`/books/${book._id}/images`)), mine.token);
    expect(res.status).toBe(404);
  });
});

describe('character sheet', () => {
  it('generates all four poses, one job each', async () => {
    const { token, userId } = await signUp();
    const { aarav } = await seedBook(userId, 1);
    stubKie();

    const res = await asUser(request(app).post(gen(`/characters/${aarav._id}/sheet`)), token);

    expect(res.status).toBe(200);
    expect(res.body.data.jobs.map((j) => j.pose)).toEqual([
      'front',
      'side',
      'three_quarter',
      'full_body',
    ]);

    for (const { jobId } of res.body.data.jobs) await pollOnce(jobId);

    const character = await Character.findById(aarav._id);
    expect(character.previews.map((p) => p.pose).sort()).toEqual([
      'front',
      'full_body',
      'side',
      'three_quarter',
    ]);
    // Exactly one preview per pose, even after a regenerate.
    expect(new Set(character.previews.map((p) => p.pose)).size).toBe(4);
  });

  it('replaces a pose rather than stacking a second copy', async () => {
    const { token, userId } = await signUp();
    const { aarav } = await seedBook(userId, 1);
    stubKie();

    const first = await asUser(
      request(app).post(gen(`/characters/${aarav._id}/image`)),
      token,
    ).send({ pose: 'side' });
    await pollOnce(first.body.data.jobId);

    // Force a genuinely new request for the same pose.
    await Character.updateOne({ _id: aarav._id }, { $set: { outfit: 'A blue raincoat.' } });

    const second = await asUser(
      request(app).post(gen(`/characters/${aarav._id}/image`)),
      token,
    ).send({ pose: 'side' });
    await pollOnce(second.body.data.jobId);

    const character = await Character.findById(aarav._id);
    expect(character.previews.filter((p) => p.pose === 'side')).toHaveLength(1);
  });

});

describe('character consistency switch', () => {
  it('drops the cast’s locked look from the prompt when the page opts out', () => {
    const cast = [
      { name: 'Aarav', identity: { consistencyPrompt: 'green hoodie, dark tousled hair' } },
    ];
    const page = { illustrationPrompt: 'A boy reads a glowing map.', location: 'Bedroom' };
    const book = { artStyle: '3D Storybook' };

    const on = pagePrompt({ page: { ...page, characterConsistency: true }, cast, book });
    const off = pagePrompt({ page: { ...page, characterConsistency: false }, cast, book });

    expect(on).toContain('green hoodie');
    expect(off).not.toContain('green hoodie');
    // The scene itself is untouched either way.
    expect(off).toContain('A boy reads a glowing map.');
    expect(off).toContain('3D Storybook');
  });
});

describe('starting a whole book reports itself immediately', () => {
  it('marks every page queued before the request returns', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 3);
    stubKie();

    const started = await asUser(
      request(app).post(`${API_PREFIX}/generation/books/${book._id}/images`),
      token,
    ).send({});

    expect(started.status).toBe(200);
    expect(started.body.data.started).toBe(3);

    // Read progress the way the screen does, straight after starting. A page
    // still reading "pending" here made the client conclude nothing was running
    // and stop polling, so the book never appeared to finish.
    const progress = await asUser(
      request(app).get(`${API_PREFIX}/generation/books/${book._id}/progress`),
      token,
    );

    expect(progress.body.data.pending).toBe(0);
    expect(progress.body.data.inFlight).toBe(3);
  });
});

describe('the book’s thumbnail', () => {
  it('is set from a page’s illustration, so the library has a cover', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 3);
    stubKie();

    expect((await Book.findById(book._id)).coverMediaId).toBeNull();

    // Illustrate page 2 first: with no cover yet, the first page to finish
    // fills the slot rather than leaving the library showing a placeholder.
    const pages = await BookPage.find({ bookId: book._id }).sort({ order: 1 });
    const second = await asUser(
      request(app).post(`${API_PREFIX}/generation/books/${book._id}/pages/${pages[1]._id}/image`),
      token,
    ).send({});
    await pollOnce(second.body.data.jobId);

    const afterSecond = await Book.findById(book._id);
    expect(afterSecond.coverMediaId).not.toBeNull();

    // Page 1 then takes it over — the cover of a book is its first page.
    const first = await asUser(
      request(app).post(`${API_PREFIX}/generation/books/${book._id}/pages/${pages[0]._id}/image`),
      token,
    ).send({});
    await pollOnce(first.body.data.jobId);

    const afterFirst = await Book.findById(book._id);
    expect(String(afterFirst.coverMediaId)).not.toBe(String(afterSecond.coverMediaId));
    expect(String(afterFirst.coverMediaId)).toBe(
      String((await BookPage.findById(pages[0]._id)).mediaAssetId),
    );
  });

  it('is served to the library as a loadable URL', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 1);
    stubKie();

    const pages = await BookPage.find({ bookId: book._id });
    const job = await asUser(
      request(app).post(`${API_PREFIX}/generation/books/${book._id}/pages/${pages[0]._id}/image`),
      token,
    ).send({});
    await pollOnce(job.body.data.jobId);

    const res = await asUser(request(app).get(`${API_PREFIX}/books`), token);

    // The library reads `coverUrl`; sending only `coverMediaId` left every card
    // showing a placeholder.
    expect(res.status).toBe(200);
    expect(res.body.data[0].coverUrl).toBeTruthy();
    expect(res.body.data[0].coverUrl).toMatch(/\/media\//);
  });
});

describe('the page prompt fits what the model accepts', () => {
  const longLook = (name) =>
    `${name} is a child with ` + 'a very carefully described appearance, '.repeat(12);

  const book = { artStyle: '3D Storybook' };
  const page = {
    illustrationPrompt: 'A cozy bedroom with bookshelves and a glowing map on a wooden table.',
    location: 'Bedroom',
    mood: 'curious',
    characterConsistency: true,
  };

  it('keeps a long cast within the limit', () => {
    const cast = ['Aarav', 'Lumi', 'Ravi'].map((name) => ({
      name,
      identity: { consistencyPrompt: longLook(name) },
    }));

    const prompt = pagePrompt({ page, cast, book, maxChars: 1000 });

    // The provider refuses anything longer, so this is a hard ceiling.
    expect(prompt.length).toBeLessThanOrEqual(1000);
  });

  it('never drops the scene, the art style or the no-text rule', () => {
    const cast = ['Aarav', 'Lumi', 'Ravi', 'Meera'].map((name) => ({
      name,
      identity: { consistencyPrompt: longLook(name) },
    }));

    const prompt = pagePrompt({ page, cast, book, maxChars: 1000 });

    expect(prompt).toContain('A cozy bedroom with bookshelves');
    expect(prompt).toContain('3D Storybook');
    expect(prompt).toContain('No text, letters or words in the image.');
    expect(prompt).toContain('Bedroom');
  });

  it('leaves a short prompt completely alone', () => {
    const cast = [{ name: 'Aarav', identity: { consistencyPrompt: 'green hoodie, dark hair' } }];
    const prompt = pagePrompt({ page, cast, book, maxChars: 1000 });

    expect(prompt).toContain('green hoodie, dark hair');
    expect(prompt.length).toBeLessThan(1000);
  });

  it('does not cut a word in half', () => {
    const cast = [{ name: 'Aarav', identity: { consistencyPrompt: longLook('Aarav') } }];
    const prompt = pagePrompt({ page, cast, book, maxChars: 300 });

    expect(prompt.length).toBeLessThanOrEqual(300);
    expect(prompt).not.toMatch(/\s$/);
  });
});
