import { GenerationJob } from '../../models/index.js';
import { priceOf } from './pricing.js';
import * as credits from './credits.service.js';

/**
 * Charging for work that runs as a GenerationJob.
 *
 * The rule the generation services follow is "spend before calling the
 * provider, give it back if nothing arrives". These two functions are that
 * rule, kept in one place so a new job type cannot accidentally be charged one
 * way and refunded another.
 *
 * What ties a refund to its charge is the ledger row's id, stored on the job.
 * Not the job id, and not the attempt count: a job can be retried, and each
 * attempt is charged and refunded on its own.
 */

/**
 * Takes payment for a job and records on the job what it cost.
 *
 * Throws a 402 when the balance is short — before the provider is called, so an
 * account that cannot pay never starts work it cannot finish.
 */
export async function chargeJob({ job, kind = job.type, reason }) {
  const amount = priceOf(kind);

  const { entryId, balance } = await credits.spend({
    userId: job.ownerId,
    amount,
    reason,
    refs: {
      jobId: job._id,
      bookId: job.refs?.bookId ?? null,
      pageId: job.refs?.pageId ?? null,
      characterId: job.refs?.characterId ?? null,
    },
  });

  await GenerationJob.updateOne(
    { _id: job._id },
    { $set: { 'cost.credits': amount, 'cost.creditsEntryId': entryId } },
  );

  return { charged: amount, balance, entryId };
}

/**
 * Gives back what a job charged.
 *
 * Safe to call on any job: one that was never charged, or already refunded,
 * does nothing. Never throws — it runs on failure paths, where an error here
 * would bury the real reason the work failed.
 */
export async function refundJob(job, reason) {
  const amount = job?.cost?.credits ?? 0;
  const entryId = job?.cost?.creditsEntryId;
  if (!amount || !entryId) return null;

  const entry = await credits.refund({
    userId: job.ownerId,
    amount,
    reason,
    refs: {
      jobId: job._id,
      bookId: job.refs?.bookId ?? null,
      pageId: job.refs?.pageId ?? null,
      characterId: job.refs?.characterId ?? null,
    },
    idempotencyKey: `refund:${entryId}`,
  });

  // Clearing the pointer, not the amount: what the job cost stays readable,
  // and a retry overwrites both when it charges again.
  if (entry) {
    await GenerationJob.updateOne({ _id: job._id }, { $set: { 'cost.creditsEntryId': null } });
  }

  return entry;
}

export default { chargeJob, refundJob };
