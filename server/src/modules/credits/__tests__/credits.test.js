import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { CreditLedger, User } from '../../../models/index.js';
import { env } from '../../../config/env.js';
import * as credits from '../credits.service.js';

let mongod;
let app;

const url = (path) => `${API_PREFIX}${path}`;
const asUser = (req, token) => req.set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_credits_test' });
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

async function signUp(email = 'krishna@example.com') {
  const created = await request(app)
    .post(url('/auth/register'))
    .send({ name: 'Krishna Yadav', email, password: 'a-long-enough-passphrase' });

  // Registering no longer signs anyone in — the emailed code does.
  const res = await request(app)
    .post(url('/auth/otp/verify'))
    .send({ email, code: created.body.data.devCode });
  return { token: res.body.data.accessToken, userId: res.body.data.user.id };
}

async function signUpAdmin(email = 'admin@example.com') {
  const { token, userId } = await signUp(email);
  await User.updateOne({ _id: userId }, { $set: { role: 'admin' } });
  return { token, userId };
}

describe('a new account', () => {
  it('opens on the signup grant', async () => {
    const { userId } = await signUp();
    expect((await User.findById(userId)).credits).toBe(env.CREDITS_SIGNUP_GRANT);
  });

  it('records where those credits came from', async () => {
    const { userId } = await signUp();
    const rows = await CreditLedger.find({ userId });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'signup_grant', amount: env.CREDITS_SIGNUP_GRANT });
    // The invariant the ledger exists to keep: the rows add up to the balance.
    expect(rows[0].balanceAfter).toBe(env.CREDITS_SIGNUP_GRANT);
  });
});

describe('GET /credits', () => {
  it('reports the balance and what things cost', async () => {
    const { token } = await signUp();
    const res = await asUser(request(app).get(url('/credits')), token);

    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe(env.CREDITS_SIGNUP_GRANT);
    expect(res.body.data.prices.story_plan).toBe(env.CREDITS_STORY_PLAN);
    expect(res.body.data.recent).toHaveLength(1);
  });

  it('needs a session', async () => {
    expect((await request(app).get(url('/credits'))).status).toBe(401);
  });
});

describe('spending', () => {
  it('takes the credits and leaves a row explaining it', async () => {
    const { userId } = await signUp();

    const result = await credits.spend({ userId, amount: 30, reason: 'Story plan' });

    expect(result.charged).toBe(30);
    expect(result.balance).toBe(env.CREDITS_SIGNUP_GRANT - 30);
    expect((await User.findById(userId)).credits).toBe(env.CREDITS_SIGNUP_GRANT - 30);

    const row = await CreditLedger.findOne({ userId, type: 'debit' });
    expect(row).toMatchObject({ amount: -30, reason: 'Story plan' });
  });

  it('refuses when the balance is short, and charges nothing', async () => {
    const { userId } = await signUp();
    await User.updateOne({ _id: userId }, { $set: { credits: 4 } });

    await expect(credits.spend({ userId, amount: 5 })).rejects.toMatchObject({
      statusCode: 402,
      code: 'INSUFFICIENT_CREDITS',
      details: { required: 5, available: 4 },
    });

    expect((await User.findById(userId)).credits).toBe(4);
    expect(await CreditLedger.countDocuments({ userId, type: 'debit' })).toBe(0);
  });

  it('cannot spend from an account created before credits existed', async () => {
    // Why scripts/backfill-credits.js has to be run on an existing database.
    // Mongoose fills the schema default in when it hydrates such a document, so
    // the balance LOOKS right — but the conditional update runs against the
    // stored data, where the field is absent and `$gte` matches nothing.
    const { userId } = await signUp();
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      {
        $unset: { credits: '' },
      },
    );

    expect((await User.findById(userId)).credits).toBe(env.CREDITS_SIGNUP_GRANT);
    await expect(credits.spend({ userId, amount: 5 })).rejects.toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
    });
  });

  it('never lets two requests both spend the last credit', async () => {
    // The whole reason spending is a conditional update rather than a read, a
    // check and a write.
    const { userId } = await signUp();
    await User.updateOne({ _id: userId }, { $set: { credits: 10 } });

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => credits.spend({ userId, amount: 5 })),
    );
    const charged = results.filter((result) => result.status === 'fulfilled');

    expect(charged).toHaveLength(2);
    expect((await User.findById(userId)).credits).toBe(0);
  });
});

describe('refunds', () => {
  it('gives the credits back', async () => {
    const { userId } = await signUp();
    const { entryId } = await credits.spend({ userId, amount: 25 });

    await credits.refund({
      userId,
      amount: 25,
      reason: 'Illustration failed',
      idempotencyKey: `refund:${entryId}`,
    });

    expect((await User.findById(userId)).credits).toBe(env.CREDITS_SIGNUP_GRANT);
  });

  it('applies once however many times it is asked for', async () => {
    // A provider callback and a poll can settle the same failed job together.
    const { userId } = await signUp();
    const { entryId } = await credits.spend({ userId, amount: 25 });

    await Promise.all(
      Array.from({ length: 3 }, () =>
        credits.refund({ userId, amount: 25, idempotencyKey: `refund:${entryId}` }),
      ),
    );

    expect((await User.findById(userId)).credits).toBe(env.CREDITS_SIGNUP_GRANT);
    expect(await CreditLedger.countDocuments({ userId, type: 'refund' })).toBe(1);
  });
});

describe('admin adjustments', () => {
  it('tops an account up and says who did it', async () => {
    const { token: adminToken, userId: adminId } = await signUpAdmin();
    const { userId } = await signUp('reader@example.com');

    const res = await asUser(
      request(app).post(url(`/admin/users/${userId}/credits`)),
      adminToken,
    ).send({ amount: 250, reason: 'Support top-up' });

    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe(env.CREDITS_SIGNUP_GRANT + 250);

    const row = await CreditLedger.findOne({ userId, type: 'admin_adjust' });
    expect(row).toMatchObject({ amount: 250, reason: 'Support top-up' });
    expect(String(row.actorId)).toBe(adminId);
  });

  it('corrects a balance downwards but never below zero', async () => {
    const { token: adminToken } = await signUpAdmin();
    const { userId } = await signUp('reader@example.com');

    const tooMuch = await asUser(
      request(app).post(url(`/admin/users/${userId}/credits`)),
      adminToken,
    ).send({ amount: -(env.CREDITS_SIGNUP_GRANT + 1) });

    expect(tooMuch.status).toBe(402);
    expect((await User.findById(userId)).credits).toBe(env.CREDITS_SIGNUP_GRANT);

    const ok = await asUser(
      request(app).post(url(`/admin/users/${userId}/credits`)),
      adminToken,
    ).send({ amount: -100 });

    expect(ok.status).toBe(200);
    expect((await User.findById(userId)).credits).toBe(env.CREDITS_SIGNUP_GRANT - 100);
  });

  it('is closed to everyone else', async () => {
    const { token } = await signUp();
    const { userId } = await signUp('reader@example.com');

    const res = await asUser(request(app).post(url(`/admin/users/${userId}/credits`)), token).send({
      amount: 1000,
    });

    expect(res.status).toBe(403);
    expect((await User.findById(userId)).credits).toBe(env.CREDITS_SIGNUP_GRANT);
  });
});

describe('GET /credits/history', () => {
  it('lists movements newest first, with a total to page through', async () => {
    const { token, userId } = await signUp();
    await credits.spend({ userId, amount: 10, reason: 'One' });
    await credits.spend({ userId, amount: 20, reason: 'Two' });

    const res = await asUser(request(app).get(url('/credits/history?limit=2')), token);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0].reason).toBe('Two');
  });
});
