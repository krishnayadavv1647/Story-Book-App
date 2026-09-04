import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * The limiter reads its ceiling from the frozen env at import time, so this file
 * sets the ceiling BEFORE importing the app. Vitest gives each test file its own
 * module graph, which is what makes that safe — the rest of the suite keeps the
 * relaxed limit configured in vitest.config.js.
 */
process.env.RATE_LIMIT_AUTH_MAX = '3';

let app;
let API_PREFIX;
let mongod;

beforeAll(async () => {
  // The login handler reads the database. Without a connection Mongoose buffers
  // for ten seconds and the route answers 500, which would hide what is
  // actually being tested here.
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_ratelimit_test' });

  const appModule = await import('../../app.js');
  app = appModule.createApp();
  API_PREFIX = appModule.API_PREFIX;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

describe('auth rate limiting', () => {
  it('refuses further attempts once the ceiling is reached', async () => {
    const attempt = () =>
      request(app)
        .post(`${API_PREFIX}/auth/login`)
        .send({ email: 'nobody@example.com', password: 'wrong-but-long-enough' });

    const allowed = [];
    for (let i = 0; i < 3; i += 1) {
      allowed.push((await attempt()).status);
    }
    const blocked = await attempt();

    // The first three are rejected on credentials, not on rate.
    expect(allowed.every((status) => status === 401)).toBe(true);

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.meta.requestId).toEqual(expect.any(String));
  });

  it('leaves unthrottled routes alone', async () => {
    const res = await request(app).get(`${API_PREFIX}/health`);
    expect(res.status).toBe(200);
  });
});
