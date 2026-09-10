import {
  AuditLog,
  Book,
  CreditLedger,
  ExportJob,
  GenerationJob,
  MediaAsset,
  RefreshToken,
  User,
} from '../../models/index.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import * as creditsService from '../credits/credits.service.js';
import * as plansService from '../plans/plans.service.js';
import { recordAudit } from './audit.service.js';

/**
 * The operational picture: is the app working, and what is it costing.
 *
 * Counts only — no user content, no prompts, no images. An operator needs to
 * know that generation is failing, not what anyone wrote.
 */
export async function overview() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [users, bookRows, jobs, recentFailures, exports, storageRows] = await Promise.all([
    User.countDocuments({}),
    Book.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    GenerationJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    GenerationJob.countDocuments({ status: 'failed', updatedAt: { $gte: since } }),
    ExportJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    MediaAsset.aggregate([
      { $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: '$storage.sizeBytes' } } },
    ]),
  ]);

  const byStatus = (rows) => Object.fromEntries(rows.map((row) => [row._id, row.count]));
  const booksByStatus = byStatus(bookRows);
  const count = (...statuses) => statuses.reduce((sum, s) => sum + (booksByStatus[s] ?? 0), 0);

  return {
    users,
    // Every book record, drafts and failures included — what was started.
    books: count(...Object.keys(booksByStatus)),
    /**
     * What was actually finished: illustrated and ready to read, or published.
     * The number an operator means by "how many books have we made" — a plan
     * nobody generated, or a run that failed, is not a book anyone received.
     */
    booksGenerated: count('ready', 'published'),
    booksInProgress: count('draft', 'planning', 'plan_ready', 'characters_ready', 'generating'),
    booksFailed: count('failed'),
    booksByStatus,
    jobs: byStatus(jobs),
    exports: byStatus(exports),
    failuresLast24h: recentFailures,
    storage: {
      objects: storageRows[0]?.count ?? 0,
      bytes: storageRows[0]?.bytes ?? 0,
    },
    providers: {
      // Whether a key is present, never the key.
      gemini: { configured: Boolean(env.GEMINI_API_KEY), model: env.GEMINI_MODEL },
      kie: { configured: Boolean(env.KIE_API_KEY), model: env.KIE_IMAGE_MODEL },
      storage: { driver: env.STORAGE_BUCKET ? 's3' : 'memory' },
    },
  };
}

export async function listUsers({ page = 1, limit = 25, search }) {
  const filter = {};
  if (search) {
    // Escaped: a search box must not accept a regular expression.
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ email: new RegExp(safe, 'i') }, { name: new RegExp(safe, 'i') }];
  }

  const [rows, total] = await Promise.all([
    User.find(filter)
      .select('name email role status credits createdAt emailVerifiedAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  // One lookup for the whole page rather than one per row — the plan is shown
  // on every line, and a query per account is how a list gets slow quietly.
  const plans = await plansService.plansForUsers(rows.map((row) => row._id));
  const items = rows.map((row) => ({ ...row, plan: plans.get(String(row._id)) ?? null }));

  return { items, total };
}

/**
 * Everything about one account, for the moment an operator has to answer a
 * question about a specific person: what they are on, what they have spent, and
 * whether their work is failing.
 */
export async function userDetail(userId) {
  const user = await User.findById(userId)
    .select('name email role status credits createdAt emailVerifiedAt lastLoginAt avatarUrl')
    .lean();
  if (!user) throw ApiError.notFound('Account not found');

  const [subscription, books, jobs, ledger, recentJobs] = await Promise.all([
    plansService.currentSubscription(userId),
    Book.countDocuments({ ownerId: userId }),
    GenerationJob.aggregate([
      { $match: { ownerId: user._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    CreditLedger.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
    GenerationJob.find({ ownerId: userId })
      .select('type status createdAt error.code cost.credits')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  return {
    user: { ...user, id: String(user._id) },
    subscription,
    books,
    jobs: Object.fromEntries(jobs.map((row) => [row._id, row.count])),
    ledger,
    recentJobs,
  };
}

/**
 * Suspends, reactivates, promotes or demotes an account.
 *
 * Two guards, both about not painting yourself into a corner: an admin cannot
 * act on their OWN account here (locking the last admin out of the panel is
 * unrecoverable from inside the app), and suspending revokes the account's
 * sessions rather than waiting for its access token to expire.
 */
export async function updateUser({ userId, patch, actor }) {
  if (String(userId) === String(actor._id)) {
    throw ApiError.badRequest('You cannot change your own role or status here.', {
      code: 'CANNOT_EDIT_SELF',
    });
  }

  const before = await User.findById(userId).select('role status name email').lean();
  if (!before) throw ApiError.notFound('Account not found');

  const after = await User.findByIdAndUpdate(
    userId,
    { $set: patch },
    { new: true, projection: { role: 1, status: 1, name: 1, email: 1, credits: 1 } },
  ).lean();

  let sessionsRevoked = 0;
  if (patch.status && patch.status !== 'active') {
    const revoked = await RefreshToken.updateMany(
      { userId, status: { $ne: 'revoked' } },
      { $set: { status: 'revoked', revokedAt: new Date(), revokedReason: 'account_suspended' } },
    );
    sessionsRevoked = revoked.modifiedCount ?? 0;
  }

  await recordAudit({
    actor,
    action: patch.status ? `user.${patch.status}` : 'user.role_changed',
    subjectType: 'User',
    subjectId: before._id,
    onBehalfOfUserId: before._id,
    changes: Object.keys(patch).map((field) => ({
      field,
      before: before[field] ?? null,
      after: after[field] ?? null,
    })),
  });

  return { user: { ...after, id: String(userId) }, sessionsRevoked };
}

/**
 * Moves one account's credit balance by hand.
 *
 * The only way credits are handed out after signup — there is no billing yet —
 * so it is deliberately an admin action, written to the same ledger as every
 * automatic movement and stamped with who did it.
 */
export async function adjustUserCredits({ userId, amount, reason, actor }) {
  const user = await User.findById(userId).select('name email credits').lean();
  if (!user) throw ApiError.notFound('Account not found');

  const result = await creditsService.adjust({ userId, amount, actorId: actor._id, reason });

  await recordAudit({
    actor,
    action: amount > 0 ? 'credits.granted' : 'credits.deducted',
    subjectType: 'User',
    subjectId: user._id,
    onBehalfOfUserId: user._id,
    changes: [{ field: 'credits', before: user.credits, after: result.balance }],
    reason: reason || null,
  });

  return { user: { id: String(userId), name: user.name, email: user.email }, ...result };
}

export async function auditTrail({ limit = 50 }) {
  return AuditLog.find({}).sort({ createdAt: -1 }).limit(limit).lean();
}

export default { overview, listUsers, userDetail, updateUser, adjustUserCredits, auditTrail };
