import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { Notification, RefreshToken, User } from '../../../models/index.js';
import { notify } from '../notifications.service.js';

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_account_test' });
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

const PASSWORD = 'a-long-enough-passphrase';

async function signUp(email = 'krishna@example.com') {
  const res = await request(app)
    .post(`${API_PREFIX}/auth/register`)
    .send({ name: 'Krishna Yadav', email, password: PASSWORD });
  return { token: res.body.data.accessToken, userId: res.body.data.user.id };
}

const asUser = (req, token) => req.set('Authorization', `Bearer ${token}`);

describe('notifications', () => {
  it('lists newest first with an unread count, and marks one read', async () => {
    const { token, userId } = await signUp();

    await notify({ userId, type: 'book_ready', title: 'First' });
    const second = await notify({ userId, type: 'export_ready', title: 'Second' });

    const listed = await asUser(request(app).get(`${API_PREFIX}/notifications`), token);
    expect(listed.body.data[0].title).toBe('Second');
    expect(listed.body.meta.unread).toBe(2);

    const read = await asUser(
      request(app).post(`${API_PREFIX}/notifications/${second._id}/read`),
      token,
    );
    expect(read.status).toBe(200);
    expect(read.body.data.readAt).toBeTruthy();

    const after = await asUser(request(app).get(`${API_PREFIX}/notifications`), token);
    expect(after.body.meta.unread).toBe(1);
  });

  it('filters to unread only', async () => {
    const { token, userId } = await signUp();
    const one = await notify({ userId, type: 'book_ready', title: 'Read me' });
    await notify({ userId, type: 'book_ready', title: 'Still unread' });

    await asUser(request(app).post(`${API_PREFIX}/notifications/${one._id}/read`), token);

    const res = await asUser(
      request(app).get(`${API_PREFIX}/notifications?unreadOnly=true`),
      token,
    );

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Still unread');
  });

  it('marks everything read at once', async () => {
    const { token, userId } = await signUp();
    await notify({ userId, type: 'book_ready', title: 'A' });
    await notify({ userId, type: 'book_ready', title: 'B' });

    const res = await asUser(request(app).post(`${API_PREFIX}/notifications/read-all`), token);

    expect(res.body.data.updated).toBe(2);
    expect(await Notification.countDocuments({ userId, readAt: null })).toBe(0);
  });

  it('will not read somebody else’s notification', async () => {
    const owner = await signUp();
    const theirs = await notify({ userId: owner.userId, type: 'book_ready', title: 'Private' });
    const stranger = await signUp('stranger@example.com');

    const res = await asUser(
      request(app).post(`${API_PREFIX}/notifications/${theirs._id}/read`),
      stranger.token,
    );

    expect(res.status).toBe(404);
    expect((await Notification.findById(theirs._id)).readAt).toBeNull();
  });
});

describe('account settings', () => {
  it('returns the profile without anything secret in it', async () => {
    const { token } = await signUp();

    const res = await asUser(request(app).get(`${API_PREFIX}/users/me`), token);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('krishna@example.com');
    expect(JSON.stringify(res.body.data)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it('updates the name and preferences without touching the rest', async () => {
    const { token, userId } = await signUp();

    const res = await asUser(request(app).patch(`${API_PREFIX}/users/me`), token).send({
      name: 'Krishna Y',
      preferences: { theme: 'dark' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Krishna Y');
    expect(res.body.data.preferences.theme).toBe('dark');
    // The preference it did not mention keeps its value.
    expect(res.body.data.preferences.emailNotifications).toBe(true);
    expect((await User.findById(userId)).email).toBe('krishna@example.com');
  });

  it('refuses to change a password without the current one', async () => {
    const { token } = await signUp();

    const res = await asUser(request(app).post(`${API_PREFIX}/users/me/password`), token).send({
      currentPassword: 'not-the-right-password',
      newPassword: 'a-brand-new-passphrase',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WRONG_PASSWORD');
  });

  it('changes the password and signs every other session out', async () => {
    const { token, userId } = await signUp();
    // A second session, as if from another browser.
    await request(app).post(`${API_PREFIX}/auth/login`).send({
      email: 'krishna@example.com',
      password: PASSWORD,
    });

    expect(await RefreshToken.countDocuments({ userId, revokedAt: null })).toBe(2);

    const res = await asUser(request(app).post(`${API_PREFIX}/users/me/password`), token).send({
      currentPassword: PASSWORD,
      newPassword: 'a-brand-new-passphrase',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.sessionsRevoked).toBe(2);
    expect(await RefreshToken.countDocuments({ userId, revokedAt: null })).toBe(0);

    // The new password works and the old one does not.
    const withNew = await request(app).post(`${API_PREFIX}/auth/login`).send({
      email: 'krishna@example.com',
      password: 'a-brand-new-passphrase',
    });
    expect(withNew.status).toBe(200);

    const withOld = await request(app).post(`${API_PREFIX}/auth/login`).send({
      email: 'krishna@example.com',
      password: PASSWORD,
    });
    expect(withOld.status).toBe(401);
  });

  it('refuses a new password that is the same as the old one', async () => {
    const { token } = await signUp();

    const res = await asUser(request(app).post(`${API_PREFIX}/users/me/password`), token).send({
      currentPassword: PASSWORD,
      newPassword: PASSWORD,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SAME_PASSWORD');
  });

  it('refuses a new password that is too short', async () => {
    const { token } = await signUp();

    const res = await asUser(request(app).post(`${API_PREFIX}/users/me/password`), token).send({
      currentPassword: PASSWORD,
      newPassword: 'short',
    });

    expect(res.status).toBe(422);
  });
});
