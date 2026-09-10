import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { AuditLog, CreditLedger, Plan, Subscription, User } from '../../../models/index.js';
import { env } from '../../../config/env.js';

let mongod;
let app;

const url = (path) => `${API_PREFIX}${path}`;
const asUser = (req, token) => req.set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_plans_test' });
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
    .post(url('/auth/register'))
    .send({ name: 'Krishna Yadav', email, password: 'a-long-enough-passphrase' });

  // Registering no longer signs anyone in — the emailed code does.
  const res = await request(app)
    .post(url('/auth/otp/verify'))
    .send({ email, code: created.body.data.devCode });

  const userId = res.body.data.user.id;
  if (admin) await User.updateOne({ _id: userId }, { $set: { role: 'admin' } });
  return { token: res.body.data.accessToken, userId };
}

const STARTER = {
  key: 'starter',
  name: 'Starter',
  description: 'A few books a month.',
  priceCents: 900,
  interval: 'month',
  creditsGranted: 400,
  visibleToUsers: true,
};

const createPlan = (token, patch = {}) =>
  asUser(request(app).post(url('/admin/plans')), token).send({ ...STARTER, ...patch });

describe('creating plans', () => {
  it('creates one, and refuses a duplicate key', async () => {
    const { token } = await signUp('admin@example.com', { admin: true });

    const first = await createPlan(token);
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ key: 'starter', creditsGranted: 400 });

    const again = await createPlan(token, { name: 'Starter Again' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PLAN_KEY_TAKEN');
    expect(await Plan.countDocuments()).toBe(1);
  });

  it('is closed to everyone else', async () => {
    const { token } = await signUp();
    expect((await createPlan(token)).status).toBe(403);
    expect(await Plan.countDocuments()).toBe(0);
  });

  it('records who created it', async () => {
    const { token, userId } = await signUp('admin@example.com', { admin: true });
    await createPlan(token);

    const entry = await AuditLog.findOne({ action: 'plan.created' });
    expect(String(entry.actorId)).toBe(userId);
    expect(entry.subjectType).toBe('Plan');
  });
});

describe('what a reader sees', () => {
  it('lists only the plans an admin chose to show', async () => {
    const { token: adminToken } = await signUp('admin@example.com', { admin: true });
    await createPlan(adminToken);
    await createPlan(adminToken, { key: 'draft', name: 'Draft', visibleToUsers: false });
    await createPlan(adminToken, { key: 'gone', name: 'Withdrawn', isActive: false });

    const { token } = await signUp();
    const res = await asUser(request(app).get(url('/plans')), token);

    expect(res.status).toBe(200);
    expect(res.body.data.plans.map((plan) => plan.key)).toEqual(['starter']);
    expect(res.body.data.current).toBeNull();
  });

  it('never exposes a plan the admin is still drafting', async () => {
    const { token: adminToken } = await signUp('admin@example.com', { admin: true });
    await createPlan(adminToken, { key: 'secret', name: 'Secret', visibleToUsers: false });

    const { token } = await signUp();
    const res = await asUser(request(app).get(url('/plans')), token);

    expect(res.body.data.plans).toEqual([]);
    // The admin's own listing still shows it, which is the point of the flag.
    const adminView = await asUser(request(app).get(url('/admin/plans')), adminToken);
    expect(adminView.body.data.map((plan) => plan.key)).toContain('secret');
  });
});

describe('assigning a plan', () => {
  it('hands over the credits and records the subscription', async () => {
    const { token: adminToken } = await signUp('admin@example.com', { admin: true });
    const plan = (await createPlan(adminToken)).body.data;
    const { userId, token } = await signUp('reader@example.com');

    const res = await asUser(
      request(app).post(url(`/admin/users/${userId}/plan`)),
      adminToken,
    ).send({ planId: plan._id });

    expect(res.status).toBe(200);
    expect(res.body.data.creditsGranted).toBe(400);
    expect(res.body.data.balance).toBe(env.CREDITS_SIGNUP_GRANT + 400);
    expect((await User.findById(userId)).credits).toBe(env.CREDITS_SIGNUP_GRANT + 400);

    // The grant is a ledger movement like any other, with its own kind.
    const row = await CreditLedger.findOne({ userId, type: 'plan_grant' });
    expect(row).toMatchObject({ amount: 400, reason: 'Plan: Starter' });

    // And the reader can see what they are on.
    const mine = await asUser(request(app).get(url('/plans')), token);
    expect(mine.body.data.current.plan.key).toBe('starter');
  });

  it('closes the previous plan rather than stacking a second one', async () => {
    const { token: adminToken } = await signUp('admin@example.com', { admin: true });
    const starter = (await createPlan(adminToken)).body.data;
    const pro = (await createPlan(adminToken, { key: 'pro', name: 'Pro', creditsGranted: 1000 }))
      .body.data;
    const { userId } = await signUp('reader@example.com');

    const assign = (planId) =>
      asUser(request(app).post(url(`/admin/users/${userId}/plan`)), adminToken).send({ planId });

    await assign(starter._id);
    await assign(pro._id);

    const live = await Subscription.find({ userId, status: 'active' });
    expect(live).toHaveLength(1);
    expect(String(live[0].planId)).toBe(pro._id);
    // Both grants landed: re-assigning is how a plan is renewed for now.
    expect((await User.findById(userId)).credits).toBe(env.CREDITS_SIGNUP_GRANT + 400 + 1000);
  });

  it('can put an account on a plan without granting its credits again', async () => {
    // For accounts that opened on the flat signup grant before the signup plan
    // was switched on: they already hold what the plan gives.
    const { token: adminToken } = await signUp('admin@example.com', { admin: true });
    const plan = (await createPlan(adminToken)).body.data;
    const { userId } = await signUp('reader@example.com');
    const before = (await User.findById(userId)).credits;

    const { assignPlan } = await import('../plans.service.js');
    const result = await assignPlan({ userId, planId: plan._id, actor: null, grantCredits: false });

    expect(result.creditsGranted).toBe(0);
    expect((await User.findById(userId)).credits).toBe(before);
    expect(await Subscription.countDocuments({ userId, status: 'active' })).toBe(1);
    expect(await CreditLedger.countDocuments({ userId, type: 'plan_grant' })).toBe(0);
  });

  it('refuses a withdrawn plan', async () => {
    const { token: adminToken } = await signUp('admin@example.com', { admin: true });
    const plan = (await createPlan(adminToken, { isActive: false })).body.data;
    const { userId } = await signUp('reader@example.com');

    const res = await asUser(
      request(app).post(url(`/admin/users/${userId}/plan`)),
      adminToken,
    ).send({ planId: plan._id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PLAN_INACTIVE');
    expect((await User.findById(userId)).credits).toBe(env.CREDITS_SIGNUP_GRANT);
  });

  it('cancels a plan without taking back what it gave', async () => {
    const { token: adminToken } = await signUp('admin@example.com', { admin: true });
    const plan = (await createPlan(adminToken)).body.data;
    const { userId } = await signUp('reader@example.com');

    await asUser(request(app).post(url(`/admin/users/${userId}/plan`)), adminToken).send({
      planId: plan._id,
    });
    const res = await asUser(
      request(app).delete(url(`/admin/users/${userId}/plan`)),
      adminToken,
    ).send();

    expect(res.status).toBe(200);
    expect(await Subscription.countDocuments({ userId, status: 'active' })).toBe(0);
    // Credits already handed over stay handed over.
    expect((await User.findById(userId)).credits).toBe(env.CREDITS_SIGNUP_GRANT + 400);
  });
});

describe('withdrawing a plan', () => {
  it('deletes one nobody is on', async () => {
    const { token } = await signUp('admin@example.com', { admin: true });
    const plan = (await createPlan(token)).body.data;

    const res = await asUser(request(app).delete(url(`/admin/plans/${plan._id}`)), token).send();

    expect(res.body.data).toMatchObject({ deleted: true, deactivated: false });
    expect(await Plan.countDocuments()).toBe(0);
  });

  it('only deactivates one an account is on, so the subscription still resolves', async () => {
    const { token: adminToken } = await signUp('admin@example.com', { admin: true });
    const plan = (await createPlan(adminToken)).body.data;
    const { userId } = await signUp('reader@example.com');
    await asUser(request(app).post(url(`/admin/users/${userId}/plan`)), adminToken).send({
      planId: plan._id,
    });

    const res = await asUser(
      request(app).delete(url(`/admin/plans/${plan._id}`)),
      adminToken,
    ).send();

    expect(res.body.data).toMatchObject({ deleted: false, deactivated: true, subscriptions: 1 });
    const kept = await Plan.findById(plan._id);
    expect(kept).toMatchObject({ isActive: false, visibleToUsers: false });
  });
});
