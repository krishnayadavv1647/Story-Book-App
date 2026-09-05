import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { Character, GenerationJob, MediaAsset } from '../../../models/index.js';
import { kieImageProvider } from '../../../providers/kie/KieImageProvider.js';
import { memoryDriver } from '../../../providers/storage/memory.driver.js';
import { pollOnce } from '../image.service.js';

let mongod;
let app;

const gen = (path) => `${API_PREFIX}/generation${path}`;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_image_test' });
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
  const token = res.body.data.accessToken;
  // BYOK: generation uses the user's own keys, so set them for the suite.
  await request(app)
    .put(`${API_PREFIX}/users/me/api-keys`)
    .set('Authorization', `Bearer ${token}`)
    .send({ gemini: 'user-gemini-key', kie: 'user-kie-key' });
  return { token, userId: res.body.data.user.id };
}

const asUser = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function seedCharacter(userId, overrides = {}) {
  return Character.create({
    ownerId: userId,
    name: 'Aarav',
    role: 'main',
    appearance: 'A curious Indian boy with warm brown skin.',
    outfit: 'Forest-green hoodie.',
    artStyle: '3D Storybook',
    identity: { consistencyPrompt: 'Aarav: 8-year-old Indian boy, dark tousled hair.' },
    ...overrides,
  });
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Emulates the three network surfaces: createTask, recordInfo, and the CDN the
 * finished image is downloaded from.
 */
function stubKie({ state = 'success', resultUrls = ['https://cdn.kie.example/img.png'], createStatus = 200, failMsg = null } = {}) {
  const calls = { create: [], record: [], download: [] };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const path = String(url);

      if (path.includes('/jobs/createTask')) {
        calls.create.push(JSON.parse(init.body));
        if (createStatus !== 200) {
          return { ok: false, status: createStatus, json: async () => ({ code: createStatus, msg: 'nope' }) };
        }
        return { ok: true, status: 200, json: async () => ({ code: 200, msg: 'ok', data: { taskId: 'task-1' } }) };
      }

      if (path.includes('/jobs/recordInfo')) {
        calls.record.push(path);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            msg: 'ok',
            data: {
              taskId: 'task-1',
              model: 'nano-banana-pro',
              state,
              resultJson: state === 'success' ? JSON.stringify({ resultUrls }) : '',
              failMsg,
              failCode: failMsg ? '501' : null,
              costTime: 4200,
              creditsConsumed: 4,
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

const startJob = (token, characterId, body = {}) =>
  asUser(request(app).post(gen(`/characters/${characterId}/image`)), token).send(body);

describe('the Kie adapter', () => {
  it('sends the documented createTask body', async () => {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);
    const calls = stubKie();

    await startJob(token, character._id);

    expect(calls.create).toHaveLength(1);
    const body = calls.create[0];
    expect(body.model).toBe('nano-banana-pro');
    expect(body.input.prompt).toContain('Aarav');
    expect(body.input.aspect_ratio).toBe('3:4');
    expect(body.input.resolution).toBe('1K');
    expect(body.input.output_format).toBe('png');
    expect(body.callBackUrl).toContain('/api/v1/generation/kie/callback/');

    // This model documents no negative prompt or seed, so the adapter sends none.
    expect(body.input).not.toHaveProperty('negative_prompt');
    expect(body.input).not.toHaveProperty('seed');
  });

  it('normalises the provider states onto our own vocabulary', () => {
    const map = {
      waiting: 'queued',
      queuing: 'queued',
      generating: 'processing',
      success: 'succeeded',
      fail: 'failed',
    };

    for (const [state, expected] of Object.entries(map)) {
      const result = kieImageProvider.normalizeResult({
        taskId: 't',
        state,
        resultJson: state === 'success' ? '{"resultUrls":["https://x/y.png"]}' : '',
      });
      expect(result.status).toBe(expected);
    }
  });

  it('parses resultJson, which arrives as a JSON string', () => {
    const result = kieImageProvider.normalizeResult({
      taskId: 't',
      state: 'success',
      resultJson: '{"resultUrls":["https://cdn/a.png","https://cdn/b.png"]}',
    });

    expect(result.imageUrls).toEqual(['https://cdn/a.png', 'https://cdn/b.png']);
    expect(result.isTerminal).toBe(true);
  });

  it('treats an unreadable resultJson as a failure rather than zero images', () => {
    const result = kieImageProvider.normalizeResult({ taskId: 't', state: 'success', resultJson: '{oops' });

    expect(result.status).toBe('failed');
    expect(result.imageUrls).toEqual([]);
  });
});

describe('a successful illustration', () => {
  it('stores the image in our own bucket and marks the character ready', async () => {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);
    const calls = stubKie();

    const started = await startJob(token, character._id);
    expect(started.status).toBe(200);

    await pollOnce(started.body.data.jobId);

    const job = await GenerationJob.findById(started.body.data.jobId);
    expect(job.status).toBe('succeeded');
    expect(job.outputs).toHaveLength(1);

    // The provider URL is downloaded, not merely linked — a provider link expires.
    expect(calls.download).toContain('https://cdn.kie.example/img.png');
    const asset = await MediaAsset.findById(job.outputs[0].mediaAssetId);
    expect(asset.status).toBe('stored');
    expect(asset.storage.contentType).toBe('image/png');
    expect(asset.checksumSha256).toHaveLength(64);
    expect(memoryDriver.size).toBe(1);

    const updated = await Character.findById(character._id);
    expect(updated.status).toBe('ready');
    expect(updated.previews).toHaveLength(1);
    expect(updated.previews[0].pose).toBe('front');
  });

  it('reports the image through a signed URL', async () => {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);
    stubKie();

    const started = await startJob(token, character._id);
    await pollOnce(started.body.data.jobId);

    const status = await asUser(request(app).get(gen(`/jobs/${started.body.data.jobId}`)), token);
    expect(status.body.data.status).toBe('succeeded');
    expect(status.body.data.imageUrl).toContain('/api/v1/media/');
    expect(status.body.data.imageUrl).toContain('sig=');
    // Provider identifiers never reach the client.
    expect(JSON.stringify(status.body)).not.toContain('task-1');
  });
});

describe('failure', () => {
  it('fails the job when the provider reports a failed task', async () => {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);
    stubKie({ state: 'fail', failMsg: 'content policy' });

    const started = await startJob(token, character._id);
    await pollOnce(started.body.data.jobId);

    const job = await GenerationJob.findById(started.body.data.jobId);
    expect(job.status).toBe('failed');
    expect((await Character.findById(character._id)).status).toBe('failed');
  });

  it('fails the job when the task creation itself is rejected', async () => {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);
    stubKie({ createStatus: 500 });

    const res = await startJob(token, character._id);

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('KIE_UNAVAILABLE');
  });

  it('fails rather than succeeding with no image', async () => {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);
    stubKie({ resultUrls: [] });

    const started = await startJob(token, character._id);
    await pollOnce(started.body.data.jobId);

    const job = await GenerationJob.findById(started.body.data.jobId);
    expect(job.status).toBe('failed');
    expect(job.error.code).toBe('KIE_NO_IMAGES');
  });

  it('refuses a character with nothing to draw', async () => {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId, {
      appearance: '',
      identity: { consistencyPrompt: '' },
    });
    const calls = stubKie();

    const res = await startJob(token, character._id);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_APPEARANCE');
    expect(calls.create).toHaveLength(0);
  });
});

describe('callbacks', () => {
  async function startAndGetToken() {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);
    const calls = stubKie();
    const started = await startJob(token, character._id);
    const jobId = started.body.data.jobId;

    return { token, userId, character, jobId, calls, callbackToken: kieImageProvider.callbackToken(jobId) };
  }

  const callbackBody = (state = 'success') => ({
    code: 200,
    msg: 'done',
    data: { taskId: 'task-1', state, resultJson: '{"resultUrls":["https://cdn.kie.example/img.png"]}' },
  });

  it('settles the job when a genuine callback arrives', async () => {
    const { jobId, callbackToken } = await startAndGetToken();

    const res = await request(app)
      .post(gen(`/kie/callback/${callbackToken}`))
      .send(callbackBody());

    expect(res.status).toBe(200);
    expect(res.body.data.accepted).toBe(true);

    const job = await GenerationJob.findById(jobId);
    expect(job.status).toBe('succeeded');
    expect(job.callback.receivedCount).toBe(1);
    expect(job.callback.verified).toBe(true);
  });

  it('settles exactly once when the same callback is delivered twice', async () => {
    const { jobId, callbackToken } = await startAndGetToken();

    await request(app).post(gen(`/kie/callback/${callbackToken}`)).send(callbackBody());
    await request(app).post(gen(`/kie/callback/${callbackToken}`)).send(callbackBody());

    const job = await GenerationJob.findById(jobId);
    expect(job.callback.receivedCount).toBe(2);
    // One settlement: one asset, one output.
    expect(job.outputs).toHaveLength(1);
    expect(await MediaAsset.countDocuments()).toBe(1);
  });

  it('settles once when a callback and a poll race', async () => {
    const { jobId } = await startAndGetToken();
    const callbackToken = kieImageProvider.callbackToken(jobId);

    await Promise.all([
      request(app).post(gen(`/kie/callback/${callbackToken}`)).send(callbackBody()),
      pollOnce(jobId),
    ]);

    expect(await MediaAsset.countDocuments()).toBe(1);
    expect((await GenerationJob.findById(jobId)).outputs).toHaveLength(1);
  });

  it('rejects a callback bearing the wrong token', async () => {
    const { jobId } = await startAndGetToken();

    const res = await request(app)
      .post(gen('/kie/callback/not-the-right-token'))
      .send(callbackBody());

    expect(res.body.data.accepted).toBe(false);
    expect(res.body.data.reason).toBe('bad_token');
    expect((await GenerationJob.findById(jobId)).status).toBe('processing');
  });

  it('ignores a callback for a task we do not know', async () => {
    const { callbackToken } = await startAndGetToken();

    const res = await request(app)
      .post(gen(`/kie/callback/${callbackToken}`))
      .send({ code: 200, data: { taskId: 'someone-elses-task', state: 'success' } });

    expect(res.body.data.accepted).toBe(false);
    expect(res.body.data.reason).toBe('unknown_task');
  });

  it('does not trust the callback body — it re-reads the task', async () => {
    const { jobId, calls } = await startAndGetToken();
    const callbackToken = kieImageProvider.callbackToken(jobId);
    const recordCallsBefore = calls.record.length;

    // The body claims success; the provider is still the authority.
    await request(app).post(gen(`/kie/callback/${callbackToken}`)).send(callbackBody('success'));

    expect(calls.record.length).toBeGreaterThan(recordCallsBefore);
  });
});

describe('idempotency and cancellation', () => {
  it('reuses the job when the same illustration is requested twice', async () => {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);
    const calls = stubKie();

    const first = await startJob(token, character._id);
    const second = await startJob(token, character._id);

    expect(second.body.data.reused).toBe(true);
    expect(second.body.data.jobId).toBe(first.body.data.jobId);
    expect(calls.create).toHaveLength(1);
  });

  it('cancels a running job', async () => {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);
    stubKie();

    const started = await startJob(token, character._id);
    const res = await asUser(
      request(app).post(gen(`/jobs/${started.body.data.jobId}/cancel`)),
      token,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    // Kie documents no cancel endpoint, and we say so rather than implying one.
    expect(res.body.data.upstreamCancelled).toBe(false);
  });

  it('refuses to touch another account’s job', async () => {
    const mine = await signUp('mine@example.com');
    const theirs = await signUp('theirs@example.com');
    const character = await seedCharacter(theirs.userId);
    stubKie();

    const started = await startJob(theirs.token, character._id);
    const res = await asUser(request(app).get(gen(`/jobs/${started.body.data.jobId}`)), mine.token);

    expect(res.status).toBe(404);
  });
});

describe('media delivery', () => {
  async function storedAssetUrl() {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);
    stubKie();
    const started = await startJob(token, character._id);
    await pollOnce(started.body.data.jobId);

    const status = await asUser(request(app).get(gen(`/jobs/${started.body.data.jobId}`)), token);
    return status.body.data.imageUrl;
  }

  // The signed URL is relative on purpose, so an <img> loads it same-origin.
  const parse = (relative) => new URL(relative, 'http://localhost');

  it('is a relative path, so the browser loads it same-origin', async () => {
    const url = await storedAssetUrl();
    expect(url.startsWith('/api/v1/media/')).toBe(true);
  });

  it('serves a correctly signed link, loadable from another origin', async () => {
    const url = parse(await storedAssetUrl());
    const res = await request(app).get(`${url.pathname}${url.search}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    // Otherwise Helmet's default `same-site` policy blocks the <img> silently.
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('refuses a tampered signature', async () => {
    const url = parse(await storedAssetUrl());
    url.searchParams.set('sig', 'tampered');

    const res = await request(app).get(`${url.pathname}${url.search}`);
    expect(res.status).toBe(403);
  });

  it('refuses an expired link', async () => {
    const url = parse(await storedAssetUrl());
    url.searchParams.set('exp', String(Math.floor(Date.now() / 1000) - 60));

    const res = await request(app).get(`${url.pathname}${url.search}`);
    expect(res.status).toBe(403);
  });
});
