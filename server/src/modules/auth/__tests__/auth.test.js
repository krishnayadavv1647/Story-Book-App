import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { RefreshToken, User } from '../../../models/index.js';

let mongod;
let app;

const CREDENTIALS = {
  name: 'Krishna Yadav',
  email: 'krishna@example.com',
  password: 'a-long-enough-passphrase',
};

const auth = (path) => `${API_PREFIX}/auth${path}`;

/** Pulls the refresh cookie value out of a Set-Cookie header. */
function refreshCookie(res) {
  const header = res.headers['set-cookie'] ?? [];
  const cookie = header.find((c) => c.startsWith('sb_refresh='));
  return cookie ? cookie.split(';')[0].slice('sb_refresh='.length) : null;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_auth_test' });
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

async function registerUser(overrides = {}) {
  return request(app)
    .post(auth('/register'))
    .send({ ...CREDENTIALS, ...overrides });
}

describe('POST /auth/register', () => {
  it('creates the account and signs it in', async () => {
    const res = await registerUser();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({
      name: 'Krishna Yadav',
      email: 'krishna@example.com',
      role: 'user',
    });

    // The account is really there, not just echoed back in the response.
    const user = await User.findOne({ email: 'krishna@example.com' });
    expect(user).toBeTruthy();
    expect(String(user._id)).toBe(res.body.data.user.id);
  });

  it('issues the refresh token as an httpOnly cookie scoped to the auth routes', async () => {
    const res = await registerUser();
    const cookie = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sb_refresh='));

    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('SameSite=Lax');
    // The refresh token must never appear in a body the page can read.
    expect(JSON.stringify(res.body)).not.toContain(refreshCookie(res));
  });

  it('never returns the password hash', async () => {
    const res = await registerUser();
    const serialised = JSON.stringify(res.body);

    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain('$2');
    expect(serialised).not.toContain(CREDENTIALS.password);
  });

  it('rejects a duplicate email', async () => {
    await registerUser();
    const res = await registerUser();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(await User.countDocuments()).toBe(1);
  });

  it('rejects a password that is too short', async () => {
    const res = await registerUser({ password: 'short' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.path)).toContain('body.password');
    expect(await User.countDocuments()).toBe(0);
  });

  it('normalises the email address', async () => {
    await registerUser({ email: '  Krishna@Example.COM  ' });

    expect(await User.findOne({ email: 'krishna@example.com' })).not.toBeNull();
  });
});

describe('POST /auth/login', () => {
  it('signs in with correct credentials and records the login', async () => {
    await registerUser();
    const res = await request(app)
      .post(auth('/login'))
      .send({ email: CREDENTIALS.email, password: CREDENTIALS.password });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect((await User.findOne({ email: CREDENTIALS.email })).lastLoginAt).not.toBeNull();
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    await registerUser();

    const wrongPassword = await request(app)
      .post(auth('/login'))
      .send({ email: CREDENTIALS.email, password: 'not-the-right-passphrase' });
    const unknownUser = await request(app)
      .post(auth('/login'))
      .send({ email: 'nobody@example.com', password: 'not-the-right-passphrase' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    // Identical, so the response cannot be used to enumerate accounts.
    expect(wrongPassword.body.message).toBe(unknownUser.body.message);
    expect(wrongPassword.body.error.code).toBe(unknownUser.body.error.code);
  });

  it('refuses a suspended account', async () => {
    await registerUser();
    await User.updateOne({ email: CREDENTIALS.email }, { $set: { status: 'suspended' } });

    const res = await request(app)
      .post(auth('/login'))
      .send({ email: CREDENTIALS.email, password: CREDENTIALS.password });

    expect(res.status).toBe(403);
  });
});

describe('GET /auth/session', () => {
  it('returns the signed-in account', async () => {
    const { body } = await registerUser();

    const res = await request(app)
      .get(auth('/session'))
      .set('Authorization', `Bearer ${body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(CREDENTIALS.email);
  });

  it('rejects a missing, malformed or forged token', async () => {
    const missing = await request(app).get(auth('/session'));
    const malformed = await request(app).get(auth('/session')).set('Authorization', 'Bearer nope');
    const wrongScheme = await request(app).get(auth('/session')).set('Authorization', 'Basic abc');

    for (const res of [missing, malformed, wrongScheme]) {
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    }
  });

  it('stops honouring a token once the account is suspended', async () => {
    const { body } = await registerUser();
    await User.updateOne({ email: CREDENTIALS.email }, { $set: { status: 'suspended' } });

    const res = await request(app)
      .get(auth('/session'))
      .set('Authorization', `Bearer ${body.data.accessToken}`);

    // The user is re-read per request, so suspension takes effect immediately
    // rather than waiting for the access token to expire.
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/refresh', () => {
  it('rotates the refresh token and returns a fresh access token', async () => {
    const registered = await registerUser();
    const first = refreshCookie(registered);

    const res = await request(app).post(auth('/refresh')).set('Cookie', `sb_refresh=${first}`);
    const second = refreshCookie(res);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(second).not.toBe(first);

    const tokens = await RefreshToken.find().sort({ createdAt: 1 });
    expect(tokens).toHaveLength(2);
    expect(tokens[0].status).toBe('rotated');
    expect(tokens[0].replacedBy).toEqual(tokens[1]._id);
    // Rotation stays inside one family so reuse can be traced.
    expect(String(tokens[0].family)).toBe(String(tokens[1].family));
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const registered = await registerUser();
    const stolen = refreshCookie(registered);

    const legit = await request(app).post(auth('/refresh')).set('Cookie', `sb_refresh=${stolen}`);
    const current = refreshCookie(legit);

    // The attacker replays the token the real user already burned.
    const replay = await request(app).post(auth('/refresh')).set('Cookie', `sb_refresh=${stolen}`);
    expect(replay.status).toBe(401);

    // And the legitimate session is cut off too — that is the intended trade.
    const afterReuse = await request(app)
      .post(auth('/refresh'))
      .set('Cookie', `sb_refresh=${current}`);
    expect(afterReuse.status).toBe(401);

    const tokens = await RefreshToken.find();
    expect(tokens.every((t) => t.status === 'revoked')).toBe(true);
    expect(tokens.every((t) => t.revokedReason === 'token_reuse')).toBe(true);
  });

  it('rejects a request with no refresh cookie', async () => {
    const res = await request(app).post(auth('/refresh'));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects an expired refresh token', async () => {
    const registered = await registerUser();
    const token = refreshCookie(registered);
    await RefreshToken.updateOne({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).post(auth('/refresh')).set('Cookie', `sb_refresh=${token}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('revokes the presented session and clears the cookie', async () => {
    const registered = await registerUser();
    const token = refreshCookie(registered);

    const res = await request(app).post(auth('/logout')).set('Cookie', `sb_refresh=${token}`);
    expect(res.status).toBe(200);

    expect((await RefreshToken.findOne()).status).toBe('revoked');

    const reuse = await request(app).post(auth('/refresh')).set('Cookie', `sb_refresh=${token}`);
    expect(reuse.status).toBe(401);
  });

  it('succeeds even with no session, so signing out is never an error', async () => {
    const res = await request(app).post(auth('/logout'));
    expect(res.status).toBe(200);
  });
});

describe('password reset', () => {
  it('answers identically for a registered and an unregistered address', async () => {
    await registerUser();

    const known = await request(app).post(auth('/forgot-password')).send({ email: CREDENTIALS.email });
    const unknown = await request(app)
      .post(auth('/forgot-password'))
      .send({ email: 'nobody@example.com' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
  });

  it('resets the password, invalidates the link and ends every session', async () => {
    const registered = await registerUser();
    const oldRefresh = refreshCookie(registered);

    const forgot = await request(app)
      .post(auth('/forgot-password'))
      .send({ email: CREDENTIALS.email });
    const token = forgot.body.data.devToken;
    expect(token).toEqual(expect.any(String));

    const reset = await request(app)
      .post(auth('/reset-password'))
      .send({ token, password: 'a-brand-new-passphrase' });
    expect(reset.status).toBe(200);

    // Old password no longer works, new one does.
    const oldLogin = await request(app)
      .post(auth('/login'))
      .send({ email: CREDENTIALS.email, password: CREDENTIALS.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post(auth('/login'))
      .send({ email: CREDENTIALS.email, password: 'a-brand-new-passphrase' });
    expect(newLogin.status).toBe(200);

    // Sessions issued before the reset are gone.
    const staleRefresh = await request(app)
      .post(auth('/refresh'))
      .set('Cookie', `sb_refresh=${oldRefresh}`);
    expect(staleRefresh.status).toBe(401);

    // The link is single-use.
    const replay = await request(app)
      .post(auth('/reset-password'))
      .send({ token, password: 'yet-another-passphrase' });
    expect(replay.status).toBe(400);
  });

  it('rejects an expired reset link', async () => {
    await registerUser();
    const forgot = await request(app)
      .post(auth('/forgot-password'))
      .send({ email: CREDENTIALS.email });

    await User.updateOne({}, { $set: { 'passwordReset.expiresAt': new Date(Date.now() - 1000) } });

    const res = await request(app)
      .post(auth('/reset-password'))
      .send({ token: forgot.body.data.devToken, password: 'a-brand-new-passphrase' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
  });
});
