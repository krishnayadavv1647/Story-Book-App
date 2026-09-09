import {
  AuditLog,
  Book,
  ExportJob,
  GenerationJob,
  MediaAsset,
  User,
} from '../../models/index.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import * as creditsService from '../credits/credits.service.js';

/**
 * The operational picture: is the app working, and what is it costing.
 *
 * Counts only — no user content, no prompts, no images. An operator needs to
 * know that generation is failing, not what anyone wrote.
 */
export async function overview() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [users, books, jobs, recentFailures, exports, storageRows] = await Promise.all([
    User.countDocuments({}),
    Book.countDocuments({}),
    GenerationJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    GenerationJob.countDocuments({ status: 'failed', updatedAt: { $gte: since } }),
    ExportJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    MediaAsset.aggregate([
      { $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: '$storage.sizeBytes' } } },
    ]),
  ]);

  const byStatus = (rows) => Object.fromEntries(rows.map((row) => [row._id, row.count]));

  return {
    users,
    books,
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

  const [items, total] = await Promise.all([
    User.find(filter)
      .select('name email role status credits createdAt emailVerifiedAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return { items, total };
}

/**
 * Moves one account's credit balance by hand.
 *
 * The only way credits are handed out after signup — there is no billing yet —
 * so it is deliberately an admin action, written to the same ledger as every
 * automatic movement and stamped with who did it.
 */
export async function adjustUserCredits({ userId, amount, reason, actorId }) {
  const user = await User.findById(userId).select('name email').lean();
  if (!user) throw ApiError.notFound('Account not found');

  const result = await creditsService.adjust({ userId, amount, actorId, reason });
  return { user: { id: String(userId), name: user.name, email: user.email }, ...result };
}

export async function auditTrail({ limit = 50 }) {
  return AuditLog.find({}).sort({ createdAt: -1 }).limit(limit).lean();
}

export default { overview, listUsers, adjustUserCredits, auditTrail };
