import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { BonusLink, Plan, Subscription, User } from '../../../models/index.js';
import { env } from '../../../config/env.js';
import { settleSignupBonus } from '../bonusLinks.service.js';

let mongod;
let app;

const url = (path) => `${API_PREFIX}${path}`;
const asUser = (req, token) => req.set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_bonus_links_test' });
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

/** A finished, verified account — used for the admin running the campaign. */
async function adminAccount() {
  const email = 'admin@example.com';
  const created = await request(app)
    .post(url('/auth/register'))
    .send({ name: 'Admin', email, password: 'a-long-enough-passphrase' });
  const res = await request(app)
    .post(url('/auth/otp/verify'))
    .send({ email, code: created.body.data.devCode });
  await User.updateOne({ email }, { $set: { role: 'admin' } });
  return res.body.data.accessToken;
}

async function bonusPlan() {
  return Plan.create({ key: 'bonus', name: 'Welcome Bonus', priceCents: 0, creditsGranted: 500 });
}

async function makeLink(token, planId, label = 'Cinema Studio buyers') {
  const res = await asUser(request(app).post(url('/admin/bonus-links')), token).send({
    label,
    planId: String(planId),
  });
  return res.body.data;
}

const signUp = (email, bonusCode) =>
  request(app)
    .post(url('/auth/register'))
    .send({
      name: 'Reader',
      email,
      password: 'a-long-enough-passphrase',
      ...(bonusCode ? { bonusCode } : {}),
    });

const verify = (email, code) => request(app).post(url('/auth/otp/verify')).send({ email, code });

describe('managing links', () => {
  it('creates a link with a code nobody could guess', async () => {
    const token = await adminAccount();
    const plan = await bonusPlan();

    const link = await makeLink(token, plan._id);

    expect(link.code.length).toBeGreaterThanOrEqual(16);
    expect(link.planId).toMatchObject({ name: 'Welcome Bonus', creditsGranted: 500 });
    expect(link).toMatchObject({ isActive: true, uses: 0 });
  });

  it('is closed to everyone but an admin', async () => {
    const plan = await bonusPlan();
    const created = await signUp('reader@example.com');
    const { accessToken } = (await verify('reader@example.com', created.body.data.devCode)).body
      .data;

    const res = await asUser(request(app).post(url('/admin/bonus-links')), accessToken).send({
      label: 'Mine',
      planId: String(plan._id),
    });

    expect(res.status).toBe(403);
    expect(await BonusLink.countDocuments()).toBe(0);
  });
});

describe('what the sign-up page is told', () => {
  it('names the plan and its credits, and nothing about the campaign', async () => {
    const token = await adminAccount();
    const link = await makeLink(token, (await bonusPlan())._id);

    const res = await request(app).get(url(`/auth/bonus/${link.code}`));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ valid: true, planName: 'Welcome Bonus', credits: 500 });
    expect(JSON.stringify(res.body)).not.toMatch(/Cinema Studio buyers|uses/);
  });

  it('calls an unknown or switched-off link invalid, and the same way', async () => {
    const token = await adminAccount();
    const link = await makeLink(token, (await bonusPlan())._id);
    await BonusLink.updateOne({ _id: link._id }, { $set: { isActive: false } });

    const off = await request(app).get(url(`/auth/bonus/${link.code}`));
    const unknown = await request(app).get(url('/auth/bonus/no-such-code'));

    expect(off.body.data).toEqual({ valid: false });
    expect(unknown.body.data).toEqual({ valid: false });
  });
});

describe('signing up through a link', () => {
  it('opens empty, and lands on the plan when the address is proved', async () => {
    const token = await adminAccount();
    const link = await makeLink(token, (await bonusPlan())._id);

    const created = await signUp('reader@example.com', link.code);
    const before = await User.findOne({ email: 'reader@example.com' });

    // Nothing yet: the bonus is not the ordinary grant plus a plan on top.
    expect(before.credits).toBe(0);
    expect(await Subscription.countDocuments({ userId: before._id })).toBe(0);

    const res = await verify('reader@example.com', created.body.data.devCode);

    expect(res.status).toBe(200);
    // The session already shows the balance the reader actually has.
    expect(res.body.data.user.credits).toBe(500);

    const after = await User.findById(before._id);
    expect(after.credits).toBe(500);
    expect(after.pendingBonusLinkId).toBeNull();
    expect(await Subscription.countDocuments({ userId: before._id, status: 'active' })).toBe(1);
    expect((await BonusLink.findById(link._id)).uses).toBe(1);
  });

  it('gives an ordinary sign-up the ordinary credits and no plan', async () => {
    await bonusPlan();

    const created = await signUp('reader@example.com');
    await verify('reader@example.com', created.body.data.devCode);

    const user = await User.findOne({ email: 'reader@example.com' });
    expect(user.credits).toBe(env.CREDITS_SIGNUP_GRANT);
    expect(await Subscription.countDocuments({ userId: user._id })).toBe(0);
  });

  it('treats a dead link as an ordinary sign-up rather than failing it', async () => {
    const token = await adminAccount();
    const link = await makeLink(token, (await bonusPlan())._id);
    await BonusLink.updateOne({ _id: link._id }, { $set: { isActive: false } });

    const created = await signUp('reader@example.com', link.code);
    expect(created.status).toBe(201);
    await verify('reader@example.com', created.body.data.devCode);

    const user = await User.findOne({ email: 'reader@example.com' });
    expect(user.credits).toBe(env.CREDITS_SIGNUP_GRANT);
    expect((await BonusLink.findById(link._id)).uses).toBe(0);
  });

  it('falls back to the ordinary credits if the link is switched off before verifying', async () => {
    // Switching a link off takes effect at once — but never leaves somebody
    // who signed up in good faith holding nothing.
    const token = await adminAccount();
    const link = await makeLink(token, (await bonusPlan())._id);

    const created = await signUp('reader@example.com', link.code);
    await asUser(request(app).patch(url(`/admin/bonus-links/${link._id}`)), token).send({
      isActive: false,
    });
    await verify('reader@example.com', created.body.data.devCode);

    const user = await User.findOne({ email: 'reader@example.com' });
    expect(user.credits).toBe(env.CREDITS_SIGNUP_GRANT);
    expect(await Subscription.countDocuments({ userId: user._id })).toBe(0);
    expect((await BonusLink.findById(link._id)).uses).toBe(0);
  });

  it('works through the emailed-code sign-up as well', async () => {
    const token = await adminAccount();
    const link = await makeLink(token, (await bonusPlan())._id);

    const asked = await request(app)
      .post(url('/auth/otp/request'))
      .send({ email: 'partner@example.com', bonusCode: link.code });
    await verify('partner@example.com', asked.body.data.devCode);

    expect((await User.findOne({ email: 'partner@example.com' })).credits).toBe(500);
  });

  it('settles exactly once, however often it is asked to', async () => {
    const token = await adminAccount();
    const link = await makeLink(token, (await bonusPlan())._id);
    await signUp('reader@example.com', link.code);
    const user = await User.findOne({ email: 'reader@example.com' });

    await Promise.all([settleSignupBonus(user), settleSignupBonus(await User.findById(user._id))]);

    expect((await User.findById(user._id)).credits).toBe(500);
    expect((await BonusLink.findById(link._id)).uses).toBe(1);
  });
});
