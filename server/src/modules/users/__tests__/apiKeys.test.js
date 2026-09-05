import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';

let mongod;
let app;

const REAL_KEY = 'AIza-a-real-looking-provider-key-000';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_apikeys_test' });
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

async function signUp() {
  const res = await request(app)
    .post(`${API_PREFIX}/auth/register`)
    .send({ name: 'Krishna Yadav', email: 'krishna@example.com', password: 'a-long-enough-passphrase' });
  return res.body.data.accessToken;
}

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

describe('BYOK API keys', () => {
  it('starts with no keys set', async () => {
    const token = await signUp();
    const res = await auth(request(app).get(`${API_PREFIX}/users/me`), token);

    expect(res.body.data.apiKeys).toEqual({ gemini: false, kie: false });
  });

  it('sets a key, reports it as set, and never returns the value', async () => {
    const token = await signUp();

    const set = await auth(request(app).put(`${API_PREFIX}/users/me/api-keys`), token).send({
      gemini: REAL_KEY,
    });

    expect(set.status).toBe(200);
    expect(set.body.data.apiKeys).toEqual({ gemini: true, kie: false });
    // The raw key must never appear in any response body.
    expect(JSON.stringify(set.body)).not.toContain(REAL_KEY);

    const me = await auth(request(app).get(`${API_PREFIX}/users/me`), token);
    expect(me.body.data.apiKeys.gemini).toBe(true);
    expect(JSON.stringify(me.body)).not.toContain(REAL_KEY);
  });

  it('clears a key with an empty string, leaving the other untouched', async () => {
    const token = await signUp();
    await auth(request(app).put(`${API_PREFIX}/users/me/api-keys`), token).send({
      gemini: REAL_KEY,
      kie: `${REAL_KEY}-kie`,
    });

    const cleared = await auth(request(app).put(`${API_PREFIX}/users/me/api-keys`), token).send({
      gemini: '',
    });

    expect(cleared.body.data.apiKeys).toEqual({ gemini: false, kie: true });
  });

  it('rejects an implausibly short key', async () => {
    const token = await signUp();
    const res = await auth(request(app).put(`${API_PREFIX}/users/me/api-keys`), token).send({
      gemini: 'short',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires authentication', async () => {
    const res = await request(app).put(`${API_PREFIX}/users/me/api-keys`).send({ gemini: REAL_KEY });
    expect(res.status).toBe(401);
  });
});
