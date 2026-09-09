import { CreditLedger, User } from '../../models/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * The credit balance and the ledger behind it.
 *
 * Two rules hold everything else up:
 *
 *   1. A balance only ever moves through this file. Nothing else writes
 *      `User.credits`, so every movement is guaranteed to leave a ledger row
 *      explaining it.
 *   2. Spending is a CONDITIONAL update — `credits: { $gte: amount }` — not a
 *      read, a check and a write. Two requests arriving together therefore
 *      cannot both spend the last credit: the database decides, once, and the
 *      loser is told the balance is short.
 *
 * Every write is idempotent when given an `idempotencyKey`. That matters on the
 * refund path, where a provider callback and a poll can settle the same failed
 * job at the same moment and both try to give the credits back.
 */

/** 402: nothing is wrong with the request; there is just not enough left. */
export function insufficientCredits({ required, available }) {
  return new ApiError(402, `This needs ${required} credits and you have ${available} left.`, {
    code: 'INSUFFICIENT_CREDITS',
    details: { required, available },
  });
}

export async function getBalance(userId) {
  const user = await User.findById(userId).select('credits').lean();
  return user?.credits ?? 0;
}

/**
 * Writes one ledger row, or reports that this exact movement already happened.
 *
 * The unique index on `idempotencyKey` is what makes the second caller lose:
 * rather than checking first and racing anyway, the write is attempted and the
 * duplicate-key error is read as "somebody else got there".
 */
async function record(entry) {
  try {
    return await CreditLedger.create(entry);
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

/**
 * Takes credits for work about to be done.
 *
 * Returns the ledger entry's id, which the caller passes back to `refund` if
 * the work then fails — that is what ties a refund to exactly one charge.
 * Throws a 402 when the balance is short, and charges nothing.
 */
export async function spend({ userId, amount, reason = '', refs = {}, idempotencyKey = null }) {
  if (!amount) return { charged: 0, balance: await getBalance(userId), entryId: null };

  const updated = await User.findOneAndUpdate(
    { _id: userId, credits: { $gte: amount } },
    { $inc: { credits: -amount } },
    { new: true, projection: { credits: 1 } },
  );

  if (!updated) {
    const user = await User.findById(userId).select('credits').lean();
    if (!user) throw ApiError.notFound('Account not found');
    throw insufficientCredits({ required: amount, available: user.credits });
  }

  const entry = await record({
    userId,
    amount: -amount,
    balanceAfter: updated.credits,
    type: 'debit',
    reason,
    refs,
    idempotencyKey,
  });

  if (!entry) {
    // This exact charge was already applied by another caller. Undo the second
    // one rather than leaving the user paying twice for one piece of work.
    const reverted = await User.findOneAndUpdate(
      { _id: userId },
      { $inc: { credits: amount } },
      { new: true, projection: { credits: 1 } },
    );
    return { charged: 0, balance: reverted?.credits ?? 0, entryId: null, reused: true };
  }

  return { charged: amount, balance: updated.credits, entryId: entry._id };
}

/**
 * Gives credits back for work that did not happen.
 *
 * Never throws: a refund runs on failure paths, and an error here would replace
 * the real reason the work failed with a confusing one. A refund that cannot be
 * applied is logged instead.
 */
export async function refund({ userId, amount, reason = '', refs = {}, idempotencyKey = null }) {
  if (!amount) return null;

  try {
    const updated = await User.findOneAndUpdate(
      { _id: userId },
      { $inc: { credits: amount } },
      { new: true, projection: { credits: 1 } },
    );
    if (!updated) return null;

    const entry = await record({
      userId,
      amount,
      balanceAfter: updated.credits,
      type: 'refund',
      reason,
      refs,
      idempotencyKey,
    });

    if (!entry) {
      // Already refunded — take the duplicate back off again.
      await User.updateOne({ _id: userId }, { $inc: { credits: -amount } });
      return null;
    }

    return entry;
  } catch (error) {
    logger.error({ userId: String(userId), amount, code: error?.code }, 'Could not refund credits');
    return null;
  }
}

/**
 * An admin moving a balance by hand. `amount` is signed: positive tops up,
 * negative corrects downwards, and a downward correction can never push an
 * account below zero.
 */
export async function adjust({ userId, amount, actorId, reason = '' }) {
  if (!Number.isInteger(amount) || amount === 0) {
    throw ApiError.badRequest('Enter how many credits to add or take away.', {
      code: 'INVALID_ADJUSTMENT',
    });
  }

  const guard = amount < 0 ? { credits: { $gte: -amount } } : {};
  const updated = await User.findOneAndUpdate(
    { _id: userId, ...guard },
    { $inc: { credits: amount } },
    { new: true, projection: { credits: 1, name: 1, email: 1 } },
  );

  if (!updated) {
    const user = await User.findById(userId).select('credits').lean();
    if (!user) throw ApiError.notFound('Account not found');
    throw insufficientCredits({ required: -amount, available: user.credits });
  }

  await record({
    userId,
    amount,
    balanceAfter: updated.credits,
    type: 'admin_adjust',
    reason,
    actorId,
  });

  logger.info(
    { userId: String(userId), amount, actorId: String(actorId) },
    'Credit balance adjusted by an admin',
  );

  return { balance: updated.credits, adjusted: amount };
}

/**
 * Writes the opening row for a new account.
 *
 * The credits themselves come from the schema default, so an account is never
 * created without them; this only records where they came from. Best-effort by
 * design — a missing history line is not worth failing a registration over.
 */
export async function recordSignupGrant(user) {
  try {
    await record({
      userId: user._id,
      amount: user.credits ?? env.CREDITS_SIGNUP_GRANT,
      balanceAfter: user.credits ?? env.CREDITS_SIGNUP_GRANT,
      type: 'signup_grant',
      reason: 'Welcome credits',
      idempotencyKey: `signup:${user._id}`,
    });
  } catch (error) {
    logger.warn(
      { userId: String(user._id), code: error?.code },
      'Could not record the signup credit grant',
    );
  }
}

/** The balance, what things cost, and the most recent movements. */
export async function summary(userId) {
  const [balance, recent] = await Promise.all([
    getBalance(userId),
    CreditLedger.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  return { balance, signupGrant: env.CREDITS_SIGNUP_GRANT, recent };
}

export async function history({ userId, page = 1, limit = 25 }) {
  const [items, total] = await Promise.all([
    CreditLedger.find({ userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CreditLedger.countDocuments({ userId }),
  ]);

  return { items, total, page, limit };
}

export default {
  getBalance,
  spend,
  refund,
  adjust,
  recordSignupGrant,
  summary,
  history,
  insufficientCredits,
};
