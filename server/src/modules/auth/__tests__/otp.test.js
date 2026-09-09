import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { Plan, Subscription, User } from '../../../models/index.js';
import { env } from '../../../config/env.js';
import { sendMail } from '../../../providers/email/mailer.js';

/**
 * These endpoints are public — another app's browser calls them directly — so
 * most of what is worth testing here is what they refuse to do: reveal who has
 * an account, accept a stale or guessed code, or let one address be used to
 * flood somebody's inbox.
 */
vi.mock('../../../providers/email/mailer.js', () => ({
  isMailConfigured: () => true,
  sendMail: vi.fn(async () => ({ id: 'test-mail-id' })),
}));

let mongod;
let app;

const url = (path) => `${API_PREFIX}${path}`;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_otp_test' });
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

afterEach(async () => {
  sendMail.mockClear();
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

const requestCode = (body) => request(app).post(url('/auth/otp/request')).send(body);
const verifyCode = (body) => request(app).post(url('/auth/otp/verify')).send(body);

/** Asks for a code and reads it back out of the dev-only field. */
async function codeFor(email, name) {
  const res = await requestCode({ email, ...(name ? { name } : {}) });
  return res.body.data.devCode;
}

describe('asking for a code', () => {
  it('creates the account when the address is new, and mails the code', async () => {
    const res = await requestCode({ email: 'new@example.com', name: 'Krishna Yadav' });

    expect(res.status).toBe(200);
    const user = await User.findOne({ email: 'new@example.com' });
    expect(user).toBeTruthy();
    expect(user.name).toBe('Krishna Yadav');
    // No password was ever set, and none is needed.
    expect(user.passwordHash ?? null).toBeNull();

    const message = sendMail.mock.calls.at(-1)[0];
    expect(message.to).toBe('new@example.com');
    expect(message.subject).toMatch(/sign-in code/i);
    expect(message.text).toContain(res.body.data.devCode);
  });

  it('names an account after its address when the caller gives no name', async () => {
    await requestCode({ email: 'krishna.yadav@example.com' });
    expect((await User.findOne({ email: 'krishna.yadav@example.com' })).name).toBe('Krishna yadav');
  });

  it('answers identically for a known and an unknown address', async () => {
    await requestCode({ email: 'known@example.com' });
    sendMail.mockClear();

    const known = await requestCode({ email: 'known@example.com' });
    const unknown = await requestCode({ email: 'nobody@example.com' });

    expect(known.status).toBe(unknown.status);
    expect(known.body.message).toBe(unknown.body.message);
  });

  it('will not re-send inside the cooldown, so one address cannot be flooded', async () => {
    await requestCode({ email: 'reader@example.com' });
    expect(sendMail).toHaveBeenCalledTimes(1);

    const again = await requestCode({ email: 'reader@example.com' });

    expect(again.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('sends nothing to a suspended account', async () => {
    await requestCode({ email: 'reader@example.com' });
    await User.updateOne({ email: 'reader@example.com' }, { $set: { status: 'suspended' } });
    sendMail.mockClear();

    const res = await requestCode({ email: 'reader@example.com' });

    expect(res.status).toBe(200);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('never stores the code itself', async () => {
    const code = await codeFor('reader@example.com');

    const user = await User.findOne({ email: 'reader@example.com' }).select('+loginCode.codeHash');
    expect(user.loginCode.codeHash).toEqual(expect.any(String));
    expect(user.loginCode.codeHash).not.toBe(code);
  });
});

describe('signing in with a code', () => {
  it('hands back a session, and marks the address verified', async () => {
    const code = await codeFor('reader@example.com');

    const res = await verifyCode({ email: 'reader@example.com', code });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe('reader@example.com');
    expect(res.headers['set-cookie'].join()).toContain('sb_refresh=');

    // Typing a code that only arrived by email proves the address works.
    expect((await User.findOne({ email: 'reader@example.com' })).emailVerifiedAt).toBeTruthy();
  });

  it('accepts a code pasted with spaces in it', async () => {
    const code = await codeFor('reader@example.com');
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;

    expect((await verifyCode({ email: 'reader@example.com', code: spaced })).status).toBe(200);
  });

  it('works only once', async () => {
    const code = await codeFor('reader@example.com');
    await verifyCode({ email: 'reader@example.com', code });

    const replay = await verifyCode({ email: 'reader@example.com', code });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('INVALID_LOGIN_CODE');
  });

  it('refuses an expired code', async () => {
    const code = await codeFor('reader@example.com');
    await User.updateOne(
      { email: 'reader@example.com' },
      { $set: { 'loginCode.expiresAt': new Date(Date.now() - 1000) } },
    );

    expect((await verifyCode({ email: 'reader@example.com', code })).status).toBe(401);
  });

  it('burns the code after too many wrong guesses', async () => {
    // Six digits is a million combinations; without this cap it is walkable
    // inside the code's lifetime.
    const code = await codeFor('reader@example.com');

    for (let attempt = 0; attempt < env.OTP_MAX_ATTEMPTS; attempt += 1) {
      await verifyCode({ email: 'reader@example.com', code: '000000' });
    }

    // Even the RIGHT code is now refused.
    const res = await verifyCode({ email: 'reader@example.com', code });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_LOGIN_CODE');
  });

  it('answers the same way for an address that has never asked for a code', async () => {
    const res = await verifyCode({ email: 'nobody@example.com', code: '123456' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_LOGIN_CODE');
  });

  it('refuses a suspended account even with the right code', async () => {
    const code = await codeFor('reader@example.com');
    await User.updateOne({ email: 'reader@example.com' }, { $set: { status: 'suspended' } });

    expect((await verifyCode({ email: 'reader@example.com', code })).status).toBe(403);
  });
});

describe('an unverified account signing in with its password', () => {
  it('is sent a code instead of a session', async () => {
    const created = await request(app)
      .post(url('/auth/register'))
      .send({ name: 'Krishna', email: 'pw@example.com', password: 'a-long-enough-passphrase' });
    sendMail.mockClear();

    const res = await request(app)
      .post(url('/auth/login'))
      .send({ email: 'pw@example.com', password: 'a-long-enough-passphrase' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    // Inside the cooldown, so the code from signing up is still the live one —
    // a login attempt must not quietly invalidate the code already sent.
    expect(sendMail).not.toHaveBeenCalled();
    const finish = await verifyCode({
      email: 'pw@example.com',
      code: created.body.data.devCode,
    });
    expect(finish.status).toBe(200);
  });
});

describe('the bonus plan', () => {
  async function bonusPlan(patch = {}) {
    return Plan.create({
      key: env.SIGNUP_PLAN_KEY || 'bonus',
      name: 'Bonus',
      priceCents: 0,
      creditsGranted: 750,
      ...patch,
    });
  }

  it('is given to a brand-new account, once', async () => {
    // The env key is blank by default, so the service is called directly with
    // the key rather than going through the endpoint's configuration.
    const plan = await bonusPlan();
    const { assignPlanByKey } = await import('../../plans/plans.service.js');

    await requestCode({ email: 'buyer@example.com' });
    const user = await User.findOne({ email: 'buyer@example.com' });
    await assignPlanByKey({ userId: user._id, key: plan.key });

    expect((await User.findById(user._id)).credits).toBe(env.CREDITS_SIGNUP_GRANT + 750);
    expect(await Subscription.countDocuments({ userId: user._id, status: 'active' })).toBe(1);
  });

  it('does nothing when the configured plan does not exist', async () => {
    const { assignPlanByKey } = await import('../../plans/plans.service.js');
    await requestCode({ email: 'buyer@example.com' });
    const user = await User.findOne({ email: 'buyer@example.com' });

    const result = await assignPlanByKey({ userId: user._id, key: 'no-such-plan' });

    expect(result).toBeNull();
    expect((await User.findById(user._id)).credits).toBe(env.CREDITS_SIGNUP_GRANT);
  });
});

describe('password sign-in is untouched', () => {
  it('still works, and still refuses an account that has no password', async () => {
    const created = await request(app)
      .post(url('/auth/register'))
      .send({ name: 'Krishna', email: 'pw@example.com', password: 'a-long-enough-passphrase' });
    // Signing up leaves the address unproved, so the password alone is not yet
    // enough — the code is what finishes it.
    const beforeVerifying = await request(app)
      .post(url('/auth/login'))
      .send({ email: 'pw@example.com', password: 'a-long-enough-passphrase' });
    expect(beforeVerifying.status).toBe(403);
    expect(beforeVerifying.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    await verifyCode({ email: 'pw@example.com', code: created.body.data.devCode });

    const withPassword = await request(app)
      .post(url('/auth/login'))
      .send({ email: 'pw@example.com', password: 'a-long-enough-passphrase' });
    expect(withPassword.status).toBe(200);

    // An account created by code has no hash, so the password door stays shut.
    await requestCode({ email: 'codeonly@example.com' });
    const noPassword = await request(app)
      .post(url('/auth/login'))
      .send({ email: 'codeonly@example.com', password: 'anything-at-all-here' });
    expect(noPassword.status).toBe(401);
  });
});
