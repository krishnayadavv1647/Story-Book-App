import crypto from 'node:crypto';

import { BonusLink, Plan, User } from '../../models/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { assignPlan } from '../plans/plans.service.js';
import * as credits from '../credits/credits.service.js';
import { recordAudit } from '../admin/audit.service.js';

/**
 * Bonus sign-up links: a URL an admin hands out, and the plan it puts a new
 * reader on.
 *
 * The flow is deliberately two-step. Signing up through a link only NOTES the
 * link on the account, which opens with no credits at all; the plan is handed
 * over when the address is verified. So an ordinary sign-up opens on
 * CREDITS_SIGNUP_GRANT, and a bonus sign-up ends up holding exactly what the
 * plan grants — never both.
 */

/** 12 random bytes as 16 url-safe characters: unguessable, still pasteable. */
function generateCode() {
  return crypto.randomBytes(12).toString('base64url');
}

export async function listLinks() {
  return BonusLink.find({})
    .sort({ createdAt: -1 })
    .populate('planId', 'key name creditsGranted isActive')
    .lean();
}

export async function createLink({ label, planId, actor }) {
  const plan = await Plan.findById(planId).select('_id name isActive').lean();
  if (!plan) throw ApiError.notFound('Plan not found');
  if (!plan.isActive) {
    throw ApiError.badRequest('That plan is withdrawn, so a link to it would grant nothing.', {
      code: 'PLAN_INACTIVE',
    });
  }

  const link = await BonusLink.create({
    code: generateCode(),
    label,
    planId,
    createdBy: actor?._id ?? null,
  });

  await recordAudit({
    actor,
    action: 'bonus_link.created',
    subjectType: 'BonusLink',
    subjectId: link._id,
    changes: [{ field: 'plan', before: null, after: plan.name }],
    reason: label,
  });

  return BonusLink.findById(link._id).populate('planId', 'key name creditsGranted isActive').lean();
}

export async function updateLink({ linkId, patch, actor }) {
  const before = await BonusLink.findById(linkId).lean();
  if (!before) throw ApiError.notFound('Bonus link not found');

  const link = await BonusLink.findByIdAndUpdate(linkId, { $set: patch }, { new: true })
    .populate('planId', 'key name creditsGranted isActive')
    .lean();

  const action =
    patch.isActive === false
      ? 'bonus_link.disabled'
      : patch.isActive === true
        ? 'bonus_link.enabled'
        : 'bonus_link.updated';

  await recordAudit({
    actor,
    action,
    subjectType: 'BonusLink',
    subjectId: link._id,
    changes: Object.keys(patch).map((field) => ({
      field,
      before: before[field] ?? null,
      after: link[field] ?? null,
    })),
  });

  return link;
}

/**
 * A link that can be used right now, with its plan — or null.
 *
 * Every reason a link cannot be used (unknown, switched off, pointing at a
 * withdrawn plan) comes back as the same null: a sign-up through a dead link is
 * simply an ordinary sign-up, not a failed one.
 */
export async function resolveLink(code) {
  if (typeof code !== 'string' || !code.trim() || code.length > 64) return null;

  const link = await BonusLink.findOne({ code: code.trim(), isActive: true })
    .populate('planId')
    .lean();

  return link?.planId?.isActive ? link : null;
}

/**
 * What the sign-up page may say about a link before anybody types.
 *
 * The plan's name and credits and nothing else — not the admin's label for the
 * campaign, and not how many people have used it.
 */
export async function describeLink(code) {
  const link = await resolveLink(code);
  if (!link) return { valid: false };

  return { valid: true, planName: link.planId.name, credits: link.planId.creditsGranted };
}

/**
 * Hands a bonus account its plan, once its address is proved.
 *
 * The pending link is cleared by a conditional update BEFORE anything is
 * granted, so two verifications racing each other settle it exactly once.
 *
 * If the link was switched off between signing up and verifying, the reader
 * gets what an ordinary sign-up gets instead — switching a link off takes
 * effect immediately, but it never leaves somebody holding nothing.
 */
export async function settleSignupBonus(user) {
  const linkId = user.pendingBonusLinkId;
  if (!linkId) return null;

  const claimed = await User.findOneAndUpdate(
    { _id: user._id, pendingBonusLinkId: linkId },
    { $set: { pendingBonusLinkId: null } },
  );
  user.pendingBonusLinkId = null;
  if (!claimed) return null;

  const link = await BonusLink.findById(linkId).populate('planId').lean();

  if (link?.isActive && link.planId?.isActive) {
    const result = await assignPlan({ userId: user._id, planId: link.planId._id, actor: null });
    await BonusLink.updateOne(
      { _id: linkId },
      { $inc: { uses: 1 }, $set: { lastUsedAt: new Date() } },
    );
    user.credits = result.balance;

    logger.info({ userId: String(user._id), linkId: String(linkId) }, 'Bonus link redeemed');
    return { via: 'bonus', credits: result.creditsGranted };
  }

  if (env.CREDITS_SIGNUP_GRANT > 0) {
    const entry = await credits.grant({
      userId: user._id,
      amount: env.CREDITS_SIGNUP_GRANT,
      type: 'signup_grant',
      reason: 'Welcome credits',
      // Same key the ordinary sign-up grant uses, so it can never land twice.
      idempotencyKey: `signup:${user._id}`,
    });
    if (entry) user.credits = entry.balanceAfter;
  }

  return { via: 'fallback', credits: env.CREDITS_SIGNUP_GRANT };
}

export default {
  listLinks,
  createLink,
  updateLink,
  resolveLink,
  describeLink,
  settleSignupBonus,
};
