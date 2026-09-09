import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { AuditLog, RefreshToken, User } from '../../../models/index.js';

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
  const created = await request(app)
    .post(`${API_PREFIX}/auth/register`)
    .send({ name: 'Krishna Yadav', email, password: 'a-long-enough-passphrase' });

  // Registering no longer signs anyone in — the emailed code does.
  const res = await request(app)
    .post(`${API_PREFIX}/auth/otp/verify`)
    .send({ email, code: created.body.data.devCode });

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

describe('managing an account', () => {
  const patch = (token, userId, body) =>
    asUser(request(app).patch(`${API_PREFIX}/admin/users/${userId}`), token).send(body);

  it('suspends an account, ends its sessions and stops it signing in', async () => {
    const { token: adminToken } = await signUp('admin@example.com', { admin: true });
    const { userId, token } = await signUp('reader@example.com');

    const res = await patch(adminToken, userId, { status: 'suspended' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.status).toBe('suspended');
    expect(res.body.data.sessionsRevoked).toBeGreaterThan(0);
    expect(await RefreshToken.countDocuments({ userId, status: 'active' })).toBe(0);

    // The token it already held stops working too — status is read per request.
    const withOldToken = await asUser(request(app).get(`${API_PREFIX}/users/me`), token);
    expect(withOldToken.status).toBe(401);

    const signIn = await request(app)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'reader@example.com', password: 'a-long-enough-passphrase' });
    expect(signIn.status).toBe(403);
  });

  it('reactivates a suspended account', async () => {
    const { token: adminToken } = await signUp('admin@example.com', { admin: true });
    const { userId } = await signUp('reader@example.com');

    await patch(adminToken, userId, { status: 'suspended' });
    await patch(adminToken, userId, { status: 'active' });

    const signIn = await request(app)
      .post(`${API_PREFIX}/auth/login`)
      .send({ email: 'reader@example.com', password: 'a-long-enough-passphrase' });
    expect(signIn.status).toBe(200);
  });

  it('promotes an account, which opens the admin screen to it', async () => {
    const { token: adminToken } = await signUp('admin@example.com', { admin: true });
    const { userId, token } = await signUp('reader@example.com');

    expect((await asUser(request(app).get(`${API_PREFIX}/admin/overview`), token)).status).toBe(403);

    await patch(adminToken, userId, { role: 'admin' });

    expect((await asUser(request(app).get(`${API_PREFIX}/admin/overview`), token)).status).toBe(200);
  });

  it('refuses to let an admin change their own role or status', async () => {
    // Otherwise the last admin can demote or suspend themselves and lock the
    // panel for good — nothing inside the app could undo it.
    const { token, userId } = await signUp('admin@example.com', { admin: true });

    const res = await patch(token, userId, { role: 'user' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_EDIT_SELF');
    expect((await User.findById(userId)).role).toBe('admin');
  });

  it('writes every change to the audit trail', async () => {
    const { token: adminToken, userId: adminId } = await signUp('admin@example.com', {
      admin: true,
    });
    const { userId } = await signUp('reader@example.com');

    await patch(adminToken, userId, { status: 'suspended' });

    const entry = await AuditLog.findOne({ action: 'user.suspended' });
    expect(String(entry.actorId)).toBe(adminId);
    expect(String(entry.onBehalfOfUserId)).toBe(userId);
    expect(entry.changes[0]).toMatchObject({ field: 'status', before: 'active', after: 'suspended' });

    const trail = await asUser(request(app).get(`${API_PREFIX}/admin/audit`), adminToken);
    expect(trail.body.data.map((row) => row.action)).toContain('user.suspended');
  });
});

describe('GET /admin/users/:userId', () => {
  it('answers what an operator asks about one account', async () => {
    const { token: adminToken } = await signUp('admin@example.com', { admin: true });
    const { userId } = await signUp('reader@example.com');

    const res = await asUser(request(app).get(`${API_PREFIX}/admin/users/${userId}`), adminToken);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: 'reader@example.com', status: 'active' });
    expect(res.body.data.books).toBe(0);
    expect(res.body.data.subscription).toBeNull();
    // The opening grant is already on the ledger, so history is never empty.
    expect(res.body.data.ledger[0]).toMatchObject({ type: 'signup_grant' });
  });

  it('is closed to an ordinary account', async () => {
    const { token } = await signUp();
    const { userId } = await signUp('reader@example.com');

    const res = await asUser(request(app).get(`${API_PREFIX}/admin/users/${userId}`), token);
    expect(res.status).toBe(403);
  });
});
