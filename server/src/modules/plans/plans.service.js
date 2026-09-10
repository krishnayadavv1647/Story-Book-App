import { Plan, Subscription, User } from '../../models/index.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import * as credits from '../credits/credits.service.js';
import { recordAudit } from '../admin/audit.service.js';

/**
 * Plans, and putting an account on one.
 *
 * A plan is a named bundle: a price to show, credits to hand over, and limits
 * to describe. There is no billing provider, so nobody buys one — an admin puts
 * an account on a plan, and what the account actually gets is the credits.
 * `priceCents` is a label until a payment provider is wired up.
 */

/** Milliseconds is the wrong unit for months, so the period end is built by calendar. */
function periodEnd(from, interval) {
  const end = new Date(from);
  if (interval === 'month') end.setMonth(end.getMonth() + 1);
  else if (interval === 'year') end.setFullYear(end.getFullYear() + 1);
  // `lifetime` still needs a date — the field is required and every query that
  // looks for a live subscription compares against it.
  else end.setFullYear(end.getFullYear() + 100);
  return end;
}

/** What a reader is allowed to know about a plan. Never the internal flags. */
export function publicPlan(plan) {
  return {
    id: String(plan._id),
    key: plan.key,
    name: plan.name,
    description: plan.description,
    priceCents: plan.priceCents,
    currency: plan.currency,
    interval: plan.interval,
    creditsGranted: plan.creditsGranted,
    limits: plan.limits,
    features: plan.features,
    sortOrder: plan.sortOrder,
  };
}

/**
 * The plans on offer.
 *
 * `includeHidden` is the admin's view: everything ever created, in the order it
 * is displayed. A reader sees only what is both active and deliberately shown.
 */
export async function listPlans({ includeHidden = false } = {}) {
  const filter = includeHidden ? {} : { isActive: true, visibleToUsers: true };
  const plans = await Plan.find(filter).sort({ sortOrder: 1, priceCents: 1 }).lean();

  return includeHidden ? plans : plans.map(publicPlan);
}

export async function createPlan(patch, actor) {
  const existing = await Plan.findOne({ key: patch.key });
  if (existing) {
    throw ApiError.conflict('A plan with that key already exists', { code: 'PLAN_KEY_TAKEN' });
  }

  const plan = await Plan.create(patch);
  logger.info({ planId: String(plan._id), key: plan.key }, 'Plan created');

  await recordAudit({
    actor,
    action: 'plan.created',
    subjectType: 'Plan',
    subjectId: plan._id,
    changes: [{ field: 'key', before: null, after: plan.key }],
  });

  return plan;
}

export async function updatePlan(planId, patch, actor) {
  if (patch.key) {
    const clash = await Plan.findOne({ key: patch.key, _id: { $ne: planId } });
    if (clash) {
      throw ApiError.conflict('A plan with that key already exists', { code: 'PLAN_KEY_TAKEN' });
    }
  }

  const before = await Plan.findById(planId).lean();
  if (!before) throw ApiError.notFound('Plan not found');

  const plan = await Plan.findByIdAndUpdate(planId, { $set: patch }, { new: true });

  await recordAudit({
    actor,
    action: 'plan.updated',
    subjectType: 'Plan',
    subjectId: plan._id,
    // Only the fields that actually moved, so the trail reads as a change
    // rather than a snapshot of everything the form happened to submit.
    changes: Object.keys(patch)
      .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(plan[field]))
      .map((field) => ({ field, before: before[field] ?? null, after: plan[field] ?? null })),
  });

  return plan;
}

/**
 * Withdraws a plan.
 *
 * A plan somebody is on is deactivated rather than deleted: subscriptions point
 * at it, and deleting the row would leave those accounts holding a reference to
 * nothing. Only a plan nobody has ever been put on is actually removed.
 */
export async function removePlan(planId, actor) {
  const held = await Subscription.countDocuments({ planId });

  if (held > 0) {
    const plan = await Plan.findByIdAndUpdate(
      planId,
      { $set: { isActive: false, visibleToUsers: false } },
      { new: true },
    );
    if (!plan) throw ApiError.notFound('Plan not found');

    await recordAudit({
      actor,
      action: 'plan.deactivated',
      subjectType: 'Plan',
      subjectId: plan._id,
      reason: `${held} account(s) are on it`,
    });

    return { deleted: false, deactivated: true, subscriptions: held };
  }

  const plan = await Plan.findByIdAndDelete(planId);
  if (!plan) throw ApiError.notFound('Plan not found');

  await recordAudit({
    actor,
    action: 'plan.deleted',
    subjectType: 'Plan',
    subjectId: plan._id,
    changes: [{ field: 'key', before: plan.key, after: null }],
  });

  return { deleted: true, deactivated: false, subscriptions: 0 };
}

/** The plan an account is on right now, or null. */
export async function currentSubscription(userId) {
  const subscription = await Subscription.findOne({
    userId,
    status: { $in: ['trialing', 'active', 'past_due'] },
  })
    .populate('planId')
    .lean();

  if (!subscription?.planId) return null;

  return {
    id: String(subscription._id),
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    plan: publicPlan(subscription.planId),
  };
}

/**
 * Puts an account on a plan and hands over the credits that come with it.
 *
 * Ordering matters: the old subscription is closed before the new one opens,
 * because at most one may be live at a time (a partial unique index enforces
 * that, so doing it the other way round fails the write rather than
 * double-subscribing). The credits are granted last — if that step fails the
 * account is on the plan without them, which an admin can top up by hand;
 * granting first and failing to record the subscription would be a gift nobody
 * can explain.
 *
 * Re-assigning the same plan is allowed and grants again: that is how a monthly
 * plan is renewed while there is no billing provider to do it.
 *
 * `grantCredits: false` puts the account on the plan and hands over nothing —
 * for an account that already received the same credits another way (a flat
 * signup grant, before the signup plan was switched on), where granting again
 * would double what everyone else got.
 */
export async function assignPlan({ userId, planId, actor, grantCredits = true }) {
  const [user, plan] = await Promise.all([
    User.findById(userId).select('_id name email').lean(),
    Plan.findById(planId),
  ]);

  if (!user) throw ApiError.notFound('Account not found');
  if (!plan) throw ApiError.notFound('Plan not found');
  if (!plan.isActive) {
    throw ApiError.badRequest('That plan is withdrawn and cannot be assigned.', {
      code: 'PLAN_INACTIVE',
    });
  }

  await Subscription.updateMany(
    { userId, status: { $in: ['trialing', 'active', 'past_due'] } },
    { $set: { status: 'cancelled', cancelledAt: new Date() } },
  );

  const start = new Date();
  const subscription = await Subscription.create({
    userId,
    planId: plan._id,
    status: 'active',
    currentPeriodStart: start,
    currentPeriodEnd: periodEnd(start, plan.interval),
  });

  let balance = await credits.getBalance(userId);
  const granting = grantCredits && plan.creditsGranted > 0;
  if (granting) {
    const granted = await credits.grant({
      userId,
      amount: plan.creditsGranted,
      type: 'plan_grant',
      reason: `Plan: ${plan.name}`,
      actorId: actor?._id ?? null,
    });
    balance = granted?.balanceAfter ?? balance;
  }

  logger.info(
    { userId: String(userId), planKey: plan.key, credits: plan.creditsGranted },
    'Plan assigned',
  );

  await recordAudit({
    actor,
    action: 'plan.assigned',
    subjectType: 'User',
    subjectId: user._id,
    onBehalfOfUserId: user._id,
    changes: [{ field: 'plan', before: null, after: plan.key }],
    reason: granting
      ? `Granted ${plan.creditsGranted} credits`
      : plan.creditsGranted > 0
        ? 'Assigned without its credits'
        : null,
  });

  return {
    subscription: {
      id: String(subscription._id),
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      plan: publicPlan(plan),
    },
    creditsGranted: granting ? plan.creditsGranted : 0,
    balance,
  };
}

/**
 * Puts an account on the plan with this key, if such a plan exists.
 *
 * How a bonus is delivered: a signup route names a plan in configuration rather
 * than an id, so the plan can be rebuilt or repriced without touching the
 * environment. A key that matches nothing is a misconfiguration and says so in
 * the log — silently granting nothing is how a broken bonus goes unnoticed.
 */
export async function assignPlanByKey({ userId, key, actor = null }) {
  if (!key) return null;

  const plan = await Plan.findOne({ key, isActive: true }).select('_id').lean();
  if (!plan) {
    logger.warn({ key }, 'No active plan with that key — nothing was assigned');
    return null;
  }

  return assignPlan({ userId, planId: plan._id, actor });
}

/** Ends an account's plan without touching the credits it already handed over. */
export async function cancelSubscription(userId, actor) {
  const result = await Subscription.updateMany(
    { userId, status: { $in: ['trialing', 'active', 'past_due'] } },
    { $set: { status: 'cancelled', cancelledAt: new Date() } },
  );

  if (result.modifiedCount > 0) {
    await recordAudit({
      actor,
      action: 'plan.cancelled',
      subjectType: 'User',
      subjectId: userId,
      onBehalfOfUserId: userId,
    });
  }

  return { cancelled: result.modifiedCount ?? 0 };
}

/** The live plan for each of a set of accounts, keyed by user id. */
export async function plansForUsers(userIds) {
  const subscriptions = await Subscription.find({
    userId: { $in: userIds },
    status: { $in: ['trialing', 'active', 'past_due'] },
  })
    .populate('planId')
    .lean();

  return new Map(
    subscriptions
      .filter((subscription) => subscription.planId)
      .map((subscription) => [
        String(subscription.userId),
        { key: subscription.planId.key, name: subscription.planId.name },
      ]),
  );
}

export default {
  listPlans,
  assignPlanByKey,
  createPlan,
  updatePlan,
  removePlan,
  assignPlan,
  cancelSubscription,
  currentSubscription,
  plansForUsers,
  publicPlan,
};
