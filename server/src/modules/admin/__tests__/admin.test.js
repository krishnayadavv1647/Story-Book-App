import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { User } from '../../../models/index.js';

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_admin_test' });
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

async function signUp(email = 'krishna@example.com', { admin = false } = {}) {
  const res = await request(app)
    .post(`${API_PREFIX}/auth/register`)
    .send({ name: 'Krishna Yadav', email, password: 'a-long-enough-passphrase' });

  const userId = res.body.data.user.id;
  if (admin) await User.updateOne({ _id: userId }, { $set: { role: 'admin' } });

  // The role is read from the database per request, so the existing token is
  // enough — no need to sign in again.
  return { token: res.body.data.accessToken, userId };
}

const asUser = (req, token) => req.set('Authorization', `Bearer ${token}`);

describe('admin access', () => {
  it('refuses an ordinary account', async () => {
    const { token } = await signUp();

    for (const path of ['/admin/overview', '/admin/users', '/admin/audit']) {
      const res = await asUser(request(app).get(`${API_PREFIX}${path}`), token);
      expect(res.status).toBe(403);
    }
  });

  it('refuses an anonymous caller', async () => {
    const res = await request(app).get(`${API_PREFIX}/admin/overview`);
    expect(res.status).toBe(401);
  });
});

describe('GET /admin/overview', () => {
  it('reports counts and provider configuration, never the keys', async () => {
    const { token } = await signUp('admin@example.com', { admin: true });

    const res = await asUser(request(app).get(`${API_PREFIX}/admin/overview`), token);

    expect(res.status).toBe(200);
    expect(res.body.data.users).toBe(1);
    expect(res.body.data.providers.gemini).toMatchObject({ configured: expect.any(Boolean) });

    // Configuration is reported as a boolean; the secret never leaves the server.
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/test-gemini-key|test-kie-key/);
    expect(body).not.toMatch(/apiKey|API_KEY/);
  });
});

describe('GET /admin/users', () => {
  it('lists accounts without password hashes', async () => {
    const { token } = await signUp('admin@example.com', { admin: true });
    await signUp('someone@example.com');

    const res = await asUser(request(app).get(`${API_PREFIX}/admin/users`), token);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(JSON.stringify(res.body.data)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it('treats a search term as text, not a pattern', async () => {
    const { token } = await signUp('admin@example.com', { admin: true });
    await signUp('someone@example.com');

    // If this were interpolated into a regex it would match everything.
    const res = await asUser(
      request(app).get(`${API_PREFIX}/admin/users?search=${encodeURIComponent('.*')}`),
      token,
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('finds an account by part of its email', async () => {
    const { token } = await signUp('admin@example.com', { admin: true });
    await signUp('someone@example.com');

    const res = await asUser(request(app).get(`${API_PREFIX}/admin/users?search=someone`), token);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe('someone@example.com');
  });
});

