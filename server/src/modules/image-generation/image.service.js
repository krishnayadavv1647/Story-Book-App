import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { notify } from '../notifications/notifications.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { requestHash as buildRequestHash } from '../../utils/requestHash.js';
import {
  Book,
  BookPage,
  Character,
  GenerationJob,
  MediaAsset,
  PromptVersion,
  User,
} from '../../models/index.js';
import { kieImageProvider } from '../../providers/kie/KieImageProvider.js';
import { ingestRemoteImage, resolveAssetUrl } from '../../providers/storage/index.js';
import { screenPrompt } from '../story-generation/moderation.js';
import { addReference } from '../characters/characters.service.js';
import { chargeJob, refundJob } from '../credits/jobCredits.js';
import { BOOK_COVER_PROMPT, POSES, characterPrompt, coverPrompt, pagePrompt } from './prompts.js';

/**
 * Image generation orchestration.
 *
 * The whole design turns on one rule: **a job settles exactly once.** A result
 * can arrive by callback or by poll, possibly at the same moment and possibly
 * more than once, so every completion path funnels through `settleJob`, which
 * claims the job with a guarded update before doing any work. Whoever loses the
 * race does nothing.
 */

/** Which media bucket a finished job's image belongs in. */
const MEDIA_KIND_BY_JOB = {
  character_image: 'character_image',
  page_image: 'page_image',
  book_cover: 'book_cover',
};

/**
 * Starts one image task.
 *
 * Screened before the provider is called: a description that cannot be
 * illustrated for a children's book never reaches it.
 */
export async function requestCharacterImage({ user, characterId, pose = 'front', bookId = null, signal }) {
  const character = await Character.findOne({ _id: characterId, ownerId: user._id });
  if (!character) throw ApiError.notFound('Character not found');

  const prompt = characterPrompt(character, pose);

  if (!character.identity?.consistencyPrompt && !character.appearance) {
    throw ApiError.badRequest('Describe how this character looks before generating them.', {
      code: 'NO_APPEARANCE',
    });
  }

  const screening = await screenPrompt({ ownerId: user._id, prompt });
  if (!screening.allowed) {
    throw ApiError.badRequest('That description cannot be illustrated for a children’s book.', {
      code: 'CONTENT_BLOCKED',
    });
  }

  const hash = buildRequestHash({
    kind: 'character_image',
    characterId: String(character._id),
    pose,
    prompt,
    model: env.KIE_IMAGE_MODEL,
  });

  const existing = await GenerationJob.findOne({ ownerId: user._id, requestHash: hash });
  if (existing && !['failed', 'cancelled'].includes(existing.status)) {
    // Already paid for and either running or done — hand back the same job.
    return { job: existing, reused: true };
  }


  const job =
    existing ??
    (await GenerationJob.create({
      ownerId: user._id,
      type: 'character_image',
      provider: 'kie',
      model: env.KIE_IMAGE_MODEL,
      requestHash: hash,
      request: { prompt, aspectRatio: '3:4', settings: { pose } },
      // `bookId` is set only by a run. It is what lets a settled character image
      // find the book waiting on it and start the next stage.
      refs: { characterId: character._id, bookId },
      status: 'queued',
    }));

  // A retried job still carries the previous attempt's provider task id. That id
  // is unique per provider in the database, so leaving it there makes the retry
  // collide with itself and surface as a meaningless "value already in use".
  await GenerationJob.updateOne(
    { _id: job._id },
    {
      $set: {
        status: 'queued',
        externalTaskId: null,
        settleClaimedAt: null,
        error: { code: null, message: null },
      },
      $inc: { attempts: 1 },
    },
  );

  // Paid for before the provider is called; `failJob` gives it back if the
  // illustration never arrives.
  await chargeJob({ job, reason: `Character illustration: ${character.name}` });

  try {
    const referenceUrls = await referenceUrlsFor(character);

    const { externalTaskId } = await kieImageProvider.createTask({
      prompt,
      aspectRatio: '3:4',
      resolution: '1K',
      outputFormat: 'png',
      referenceUrls,
      jobId: job._id,
      signal,
    });

    await GenerationJob.updateOne(
      { _id: job._id },
      {
        $set: {
          externalTaskId,
          status: 'processing',
          startedAt: new Date(),
          nextPollAt: new Date(Date.now() + env.KIE_POLL_INTERVAL_MS),
        },
      },
    );

    await Character.updateOne(
      { _id: character._id },
      { $set: { status: 'generating', lastGenerationJobId: job._id } },
    );

    schedulePoll(job._id);

    return { job: await GenerationJob.findById(job._id), reused: false };
  } catch (err) {
    await failJob(job._id, err);
    throw err;
  }
}

/** A locked character's stored references are replayed into every new request. */
async function referenceUrlsFor(character) {
  const ids = character.identity?.referenceAssetIds ?? [];
  if (ids.length === 0) return [];

  const assets = await MediaAsset.find({ _id: { $in: ids }, status: 'stored' });
  const urls = await Promise.all(assets.map((asset) => resolveAssetUrl(asset)));
  return urls.filter(Boolean);
}


async function failJob(jobId, err) {
  const job = await GenerationJob.findById(jobId);
  if (!job || ['succeeded', 'failed', 'cancelled'].includes(job.status)) return;

  // Every image failure arrives here — a provider error, a rejected task, an
  // image that could not be stored — so this is the one place a refund belongs.
  // The terminal-status check above is what stops a job being refunded twice.
  await refundJob(job, 'Illustration failed');

  await GenerationJob.updateOne(
    { _id: jobId },
    {
      $set: {
        status: 'failed',
        completedAt: new Date(),
        error: {
          code: err?.code ?? 'INTERNAL_ERROR',
          message: err?.message ?? 'Image generation failed',
          retryable: Boolean(err?.retryable),
          at: new Date(),
        },
      },
    },
  );

  if (job.type === 'character_image' && job.refs?.characterId) {
    await Character.updateOne(
      { _id: job.refs.characterId },
      { $set: { status: 'failed', lastError: err?.message ?? 'Image generation failed' } },
    );
  }

  if (job.type === 'page_image' && job.refs?.pageId) {
    await BookPage.updateOne(
      { _id: job.refs.pageId },
      { $set: { status: 'failed', lastError: err?.message ?? 'Image generation failed' } },
    );
    await refreshBookProgress(job.refs.bookId);
  }

  // A run has to keep moving through failure. A character nobody could draw
  // still lets the pages start — vaguer, but drawn — and a cover that failed is
  // the end of the run rather than a screen waiting forever on an image that is
  // never coming.
  if (job.type === 'character_image' && job.refs?.bookId) {
    await advanceAutopilotAfterCharacters(job.refs.bookId);
  }

  if (job.type === 'book_cover' && job.refs?.bookId) {
    await completeAutopilot(job.refs.bookId);
  }
}

/**
 * Recomputes a book's counters from its pages rather than incrementing them.
 *
 * Increments drift the moment a job is retried or settled twice; a recount is
 * cheap at book scale and cannot disagree with the pages themselves.
 */
export async function refreshBookProgress(bookId) {
  if (!bookId) return null;

  const rows = await BookPage.aggregate([
    { $match: { bookId: new mongoose.Types.ObjectId(String(bookId)) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byStatus = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const ready = byStatus.ready ?? 0;
  const failed = byStatus.failed ?? 0;
  const outstanding = total - ready - failed;

  const status = outstanding > 0 ? 'generating' : failed > 0 ? 'failed' : 'ready';

  // Only tell the user when the book actually crosses into a finished state —
  // this function runs after every page, and a notification per page would be
  // noise rather than news.
  const previous = await Book.findById(bookId).select('status title ownerId').lean();
  const justFinished = outstanding === 0 && previous && previous.status !== status;

  await Book.updateOne(
    { _id: bookId },
    {
      $set: {
        'generation.pagesTotal': total,
        'generation.pagesReady': ready,
        'generation.pagesFailed': failed,
        ...(outstanding === 0 ? { 'generation.completedAt': new Date() } : {}),
        status,
      },
    },
  );

  // Every page is in. In a run, that is the cue for the cover — and only a run
  // acts on it, because `advanceAutopilotAfterPages` claims on the stage.
  if (outstanding === 0) await advanceAutopilotAfterPages(bookId);

  if (justFinished) {
    await notify({
      userId: previous.ownerId,
      type: failed > 0 ? 'book_failed' : 'book_ready',
      severity: failed > 0 ? 'warning' : 'success',
      title:
        failed > 0
          ? `${failed} ${failed === 1 ? 'page' : 'pages'} could not be illustrated`
          : `“${previous.title || 'Your book'}” is fully illustrated`,
      body:
        failed > 0
          ? `${ready} of ${total} pages are ready. The rest can be retried.`
          : `All ${total} pages are ready to edit and export.`,
      actionPath: `/books/${bookId}/${failed > 0 ? 'generate' : 'editor'}`,
      refs: { bookId },
    }).catch(() => {
      // A notification is a courtesy; failing to record one must never fail the
      // generation that actually succeeded.
    });
  }

  return { total, ready, failed, outstanding, status };
}

/**
 * The single completion path.
 *
 * `findOneAndUpdate` on a non-terminal status is the claim: exactly one caller
 * gets the document back, so a callback and a poll arriving together — or the
 * same callback delivered twice — produce one settlement, one storage transfer
 * and one settled job.
 */
export async function settleJob(jobId, normalized) {
  if (!normalized?.isTerminal) return { settled: false, reason: 'not_terminal' };

  // The claim must move the job into a state the filter no longer matches,
  // otherwise two callers both "claim" a job sitting in `processing`. A
  // dedicated timestamp does that without inventing a new status.
  const claimed = await GenerationJob.findOneAndUpdate(
    { _id: jobId, status: { $in: ['queued', 'processing'] }, settleClaimedAt: null },
    { $set: { settleClaimedAt: new Date(), progress: normalized.progress ?? 0 } },
    { new: true },
  );

  if (!claimed) return { settled: false, reason: 'already_settled' };

  if (normalized.status === 'failed') {
    await failJob(jobId, { code: normalized.errorCode ?? 'KIE_FAILED', message: normalized.error });
    return { settled: true, status: 'failed' };
  }

  if (normalized.imageUrls.length === 0) {
    await failJob(
      jobId,
      { code: 'KIE_NO_IMAGES', message: 'The provider reported success but returned no image' });
    return { settled: true, status: 'failed' };
  }

  try {
    const asset = await ingestRemoteImage({
      url: normalized.imageUrls[0],
      ownerId: claimed.ownerId,
      kind: MEDIA_KIND_BY_JOB[claimed.type] ?? 'page_image',
      refs: {
        characterId: claimed.refs?.characterId ?? null,
        pageId: claimed.refs?.pageId ?? null,
        bookId: claimed.refs?.bookId ?? null,
      },
      origin: {
        provider: 'kie',
        model: claimed.model,
        externalTaskId: normalized.externalTaskId,
        generationJobId: claimed._id,
      },
    });

    await GenerationJob.updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'succeeded',
          progress: 100,
          completedAt: new Date(),
          latencyMs: normalized.costTimeMs,
          'cost.providerCostMicros': Math.round((normalized.providerCredits ?? 0) * 1000),
          outputs: [
            {
              mediaAssetId: asset._id,
              providerUrl: normalized.imageUrls[0],
              transferredAt: new Date(),
            },
          ],
        },
      },
    );

    if (claimed.type === 'character_image' && claimed.refs?.characterId) {
      const pose = claimed.request?.settings?.pose ?? 'front';
      const update = {
        $set: { status: 'ready', lastError: null },
        // One entry per pose: a regenerated pose replaces its slot rather than
        // stacking a second copy beside it.
        $pull: { previews: { pose } },
      };

      await Character.updateOne({ _id: claimed.refs.characterId }, update);
      await Character.updateOne(
        { _id: claimed.refs.characterId },
        {
          $push: { previews: { pose, mediaAssetId: asset._id, isPrimary: pose === 'front' } },
          ...(pose === 'front' ? { $set: { primaryMediaId: asset._id } } : {}),
        },
      );

      // Set only by a run, and only then does this do anything: the last
      // character to land is what starts the pages.
      if (claimed.refs?.bookId) await advanceAutopilotAfterCharacters(claimed.refs.bookId);
    }

    if (claimed.type === 'book_cover' && claimed.refs?.bookId) {
      // Unconditional: this *is* the cover, and regenerating one is how a user
      // replaces a cover they did not like.
      await Book.updateOne(
        { _id: claimed.refs.bookId },
        { $set: { coverMediaId: asset._id, coverSource: 'generated' } },
      );

      // The cover is the last stage, so this is where a run ends.
      await completeAutopilot(claimed.refs.bookId);
    }

    if (claimed.type === 'page_image' && claimed.refs?.pageId) {
      const page = await BookPage.findById(claimed.refs.pageId);

      if (page) {
        // Append a revision rather than overwrite: the previous illustration
        // stays recoverable, which is the invariant the page model exists for.
        page.revisions.push({
          source: 'kie',
          narration: page.narration,
          sceneDescription: page.sceneDescription,
          illustrationPrompt: page.illustrationPrompt,
          mediaAssetId: asset._id,
          generationJobId: claimed._id,
          acceptedAt: new Date(),
        });
        page.activeRevisionId = page.revisions.at(-1)._id;
        page.mediaAssetId = asset._id;
        page.status = 'ready';
        page.lastError = null;
        await page.save();

        // The book's thumbnail. Page 1 wins outright; otherwise the first page
        // to finish fills the slot, so a book has a cover as soon as it has any
        // artwork at all. Nothing was setting `coverMediaId`, so every book in
        // the library showed a placeholder forever.
        //
        // A generated cover always wins. It carries the title and subtitle in
        // the artwork, which is what the library card now relies on, so letting
        // page one replace it would blank the title off every card.
        await Book.updateOne(
          {
            _id: claimed.refs.bookId,
            coverSource: { $ne: 'generated' },
            ...(page.order === 1 ? {} : { coverMediaId: null }),
          },
          { $set: { coverMediaId: asset._id, coverSource: 'page' } },
        );
      }

      await refreshBookProgress(claimed.refs.bookId);
    }

    logger.info({ jobId: String(jobId), assetId: String(asset._id) }, 'Image job settled');
    return { settled: true, status: 'succeeded', assetId: asset._id };
  } catch (err) {
    await failJob(jobId, err);
    return { settled: true, status: 'failed' };
  }
}

/** Releases a claim so a later attempt can settle the job. */
export async function releaseClaim(jobId) {
  await GenerationJob.updateOne({ _id: jobId }, { $set: { settleClaimedAt: null } });
}

/**
 * Bounded polling with linear backoff.
 *
 * The inline driver runs this in-process, which is fine for one server. The
 * BullMQ driver will schedule the same check; `settleJob` makes either safe.
 */
const timers = new Map();

export function schedulePoll(jobId, attempt = 0) {
  if (env.QUEUE_DRIVER !== 'inline') return;
  if (attempt >= env.KIE_MAX_POLL_ATTEMPTS) return;

  // Linear backoff, capped, so a slow task does not hammer the provider.
  const delay = Math.min(env.KIE_POLL_INTERVAL_MS * (1 + Math.floor(attempt / 5)), 15_000);

  const timer = setTimeout(async () => {
    timers.delete(String(jobId));
    try {
      const done = await pollOnce(jobId);
      if (!done) schedulePoll(jobId, attempt + 1);
    } catch (err) {
      logger.warn({ err, jobId: String(jobId) }, 'Poll failed; will retry');
      schedulePoll(jobId, attempt + 1);
    }
  }, delay);

  timer.unref?.();
  timers.set(String(jobId), timer);
}

export function stopPolling(jobId) {
  const timer = timers.get(String(jobId));
  if (timer) clearTimeout(timer);
  timers.delete(String(jobId));
}

/** Returns true when the job needs no further polling. */
export async function pollOnce(jobId) {
  const job = await GenerationJob.findById(jobId);
  if (!job || !['queued', 'processing'].includes(job.status)) return true;
  if (!job.externalTaskId) return false;

  await GenerationJob.updateOne({ _id: jobId }, { $inc: { pollAttempts: 1 } });

  const normalized = await kieImageProvider.getTaskStatus(job.externalTaskId);

  if (!normalized.isTerminal) {
    await GenerationJob.updateOne({ _id: jobId }, { $set: { progress: normalized.progress ?? 0 } });
    return false;
  }

  await settleJob(jobId, normalized);
  return true;
}

/**
 * A callback tells us *something happened*; it never tells us what. The token in
 * the path proves the caller reached the right door, then the task is re-read
 * from the provider so a forged or replayed body cannot decide a job's outcome.
 */
export async function handleCallback({ token, body }) {
  const jobId = body?.data?.taskId
    ? (await GenerationJob.findOne({ provider: 'kie', externalTaskId: body.data.taskId }))?._id
    : null;

  if (!jobId) return { accepted: false, reason: 'unknown_task' };

  const verification = kieImageProvider.verifyCallback(null, body, { jobId, token });
  if (!verification.verified) {
    logger.warn({ reason: verification.reason }, 'Rejected a Kie callback');
    return { accepted: false, reason: verification.reason };
  }

  // A pipeline update so `firstReceivedAt` is set only the first time —
  // `$min` against a null would keep the null, since null sorts lowest.
  await GenerationJob.updateOne({ _id: jobId }, [
    {
      $set: {
        'callback.receivedCount': { $add: [{ $ifNull: ['$callback.receivedCount', 0] }, 1] },
        'callback.lastReceivedAt': '$$NOW',
        'callback.verified': true,
        'callback.firstReceivedAt': { $ifNull: ['$callback.firstReceivedAt', '$$NOW'] },
      },
    },
  ]);

  stopPolling(jobId);

  const job = await GenerationJob.findById(jobId);
  const normalized = await kieImageProvider.getTaskStatus(job.externalTaskId);
  const result = await settleJob(jobId, normalized);

  return { accepted: true, ...result };
}

export async function cancelImageJob({ user, jobId }) {
  const job = await GenerationJob.findOne({ _id: jobId, ownerId: user._id });
  if (!job) throw ApiError.notFound('Job not found');

  if (['succeeded', 'failed', 'cancelled'].includes(job.status)) {
    return { status: job.status, alreadyFinished: true };
  }

  stopPolling(jobId);
  if (job.externalTaskId) await kieImageProvider.cancelTask(job.externalTaskId);

  await GenerationJob.updateOne(
    { _id: jobId },
    { $set: { status: 'cancelled', cancelledAt: new Date(), completedAt: new Date() } },
  );
  await refundJob(job, 'Cancelled before it finished');

  return { status: 'cancelled', alreadyFinished: false, upstreamCancelled: false };
}


/* ------------------------------------------------------------------------ *
 * Page and book illustration
 * ------------------------------------------------------------------------ */

/**
 * Visual anchors for a page: each character's generated front pose plus any
 * uploaded references. Text alone drifts; the reference images are what actually
 * hold a character's face steady across sixty pages.
 */
async function referenceUrlsForCast(cast) {
  const ids = cast.flatMap((character) => [
    character.primaryMediaId,
    ...(character.identity?.referenceAssetIds ?? []),
  ]);

  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return [];

  const assets = await MediaAsset.find({ _id: { $in: unique }, status: 'stored' });
  const urls = await Promise.all(assets.map((asset) => resolveAssetUrl(asset)));

  // The provider fetches these itself, so a relative path is no use to it.
  return urls
    .filter(Boolean)
    .map((url) => (url.startsWith('http') ? url : `${env.SERVER_PUBLIC_URL}${url}`))
    .slice(0, 8);
}

/** Starts one page illustration. Safe to call again for a retry. */
export async function requestPageImage({ user, book, pageId, signal }) {
  const page = await BookPage.findOne({ _id: pageId, bookId: book._id });
  if (!page) throw ApiError.notFound('Page not found');


  const cast = await Character.find({ _id: { $in: page.characterIds ?? [] } });
  const prompt = pagePrompt({ page, cast, book });

  const screening = await screenPrompt({ ownerId: user._id, prompt });
  if (!screening.allowed) {
    throw ApiError.badRequest('That page cannot be illustrated for a children\u2019s book.', {
      code: 'CONTENT_BLOCKED',
    });
  }

  // The cast's identity is part of the hash: relock or redraw a character and
  // the page is genuinely a different request, so it re-runs rather than
  // returning a stale illustration.
  const hash = buildRequestHash({
    kind: 'page_image',
    pageId: String(page._id),
    prompt,
    cast: cast
      .map((c) => `${c._id}:${c.identity?.fingerprint ?? ''}:${c.primaryMediaId ?? ''}`)
      .sort(),
    model: env.KIE_IMAGE_MODEL,
  });

  const existing = await GenerationJob.findOne({ ownerId: user._id, requestHash: hash });
  if (existing && !['failed', 'cancelled'].includes(existing.status)) {
    return { job: existing, reused: true };
  }


  const job =
    existing ??
    (await GenerationJob.create({
      ownerId: user._id,
      type: 'page_image',
      provider: 'kie',
      model: env.KIE_IMAGE_MODEL,
      requestHash: hash,
      request: { prompt, aspectRatio: '4:3', settings: { order: page.order } },
      refs: { bookId: book._id, pageId: page._id },
      status: 'queued',
    }));

  // Same reason as above: release the previous attempt's task id first.
  await GenerationJob.updateOne(
    { _id: job._id },
    {
      $set: {
        status: 'queued',
        externalTaskId: null,
        settleClaimedAt: null,
        error: { code: null, message: null },
      },
      $inc: { attempts: 1 },
    },
  );
  await BookPage.updateOne({ _id: page._id }, { $set: { status: 'queued', lastError: null } });

  await chargeJob({ job, reason: `Illustration for page ${page.order}` });

  try {
    const { externalTaskId } = await kieImageProvider.createTask({
      prompt,
      aspectRatio: '4:3',
      resolution: '1K',
      outputFormat: 'png',
      referenceUrls: await referenceUrlsForCast(cast),
      jobId: job._id,
      signal,
    });

    await GenerationJob.updateOne(
      { _id: job._id },
      { $set: { externalTaskId, status: 'processing', startedAt: new Date() } },
    );
    await BookPage.updateOne(
      { _id: page._id },
      { $set: { status: 'generating', lastGenerationJobId: job._id } },
    );

    schedulePoll(job._id);
    await refreshBookProgress(book._id);

    return { job: await GenerationJob.findById(job._id), reused: false };
  } catch (err) {
    await failJob(job._id, err);
    throw err;
  }
}

/**
 * Illustrates a whole book.
 *
 * Pages are started in the background with a concurrency cap — firing sixty
 * requests at once would be throttled by the provider and would make a single
 * failure look like a total one. Each page is an independent job, so one failure
 * leaves the rest to finish and can be retried on its own.
 */
export async function generateBookImages({ user, book, only = null }) {
  const filter = { bookId: book._id };
  if (only) filter._id = { $in: only };
  else filter.status = { $in: ['pending', 'failed'] };

  const pages = await BookPage.find(filter).sort({ order: 1 }).select('_id order');

  if (pages.length === 0) {
    throw ApiError.badRequest('Every page in this book already has an illustration.', {
      code: 'NOTHING_TO_GENERATE',
    });
  }


  await Book.updateOne(
    { _id: book._id },
    {
      $set: {
        status: 'generating',
        'generation.startedAt': new Date(),
        'generation.lastError': null,
      },
    },
  );

  const ids = pages.map((page) => page._id);

  // Mark them queued before answering. The caller refetches progress the moment
  // this returns, and the fan-out below has not run yet — a page that is about
  // to be illustrated must not read back as "not started", because the screen
  // would conclude nothing was running and stop watching.
  await BookPage.updateMany(
    { _id: { $in: ids } },
    { $set: { status: 'queued', lastError: null } },
  );

  runWithConcurrency(ids, env.QUEUE_CONCURRENCY, (pageId) =>
    requestPageImage({ user, book, pageId }).catch(async (err) => {
      logger.warn({ err, pageId: String(pageId) }, 'Page illustration could not be started');

      // Leaving it queued would strand the page: it would never settle, and the
      // screen would wait on it forever. Failed is both true and retryable.
      await BookPage.updateOne(
        { _id: pageId },
        {
          $set: {
            status: 'failed',
            lastError: err?.message ?? 'The illustration could not be started.',
          },
        },
      ).catch(() => {});

      await refreshBookProgress(book._id).catch(() => {});
    }),
  );

  return { started: ids.length };
}

/** Runs `task` over `items`, at most `limit` in flight. Fire-and-forget. */
function runWithConcurrency(items, limit, task) {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
    while (queue.length > 0) {
      await task(queue.shift());
    }
  });

  // Deliberately not awaited: the caller returns immediately and the UI polls.
  Promise.all(workers).catch((err) => logger.error({ err }, 'Book illustration run failed'));
}

/**
 * Everything the generation screen draws, in one call.
 *
 * It reports the whole run, not just the pages: on autopilot the cast is drawn
 * before any page is, so a response that only counted pages would leave the
 * screen showing "0 of 10" with nothing apparently happening for a minute.
 */
export async function bookGenerationProgress(book) {
  const pages = await BookPage.find({ bookId: book._id })
    .sort({ order: 1 })
    .select('order status lastError mediaAssetId title')
    .lean();

  const cast = await Character.find({ _id: { $in: book.characterIds ?? [] } })
    .select('name role status lastError primaryMediaId')
    .lean();

  const assets = await MediaAsset.find({
    _id: {
      $in: [...pages.map((p) => p.mediaAssetId), ...cast.map((c) => c.primaryMediaId)].filter(
        Boolean,
      ),
    },
  });
  const urlById = new Map(
    await Promise.all(assets.map(async (a) => [String(a._id), await resolveAssetUrl(a)])),
  );

  const counts = pages.reduce((acc, page) => {
    acc[page.status] = (acc[page.status] ?? 0) + 1;
    return acc;
  }, {});

  const ready = counts.ready ?? 0;
  const failed = counts.failed ?? 0;
  // `pending` means never started — counting it as in-flight would leave the
  // "illustrate" action permanently disabled on a book nobody has started.
  const pending = counts.pending ?? 0;
  const inFlight = (counts.queued ?? 0) + (counts.generating ?? 0);

  const stage = book.autopilot?.stage ?? null;

  return {
    total: pages.length,
    ready,
    failed,
    pending,
    inFlight,
    percent: pages.length ? Math.round((ready / pages.length) * 100) : 0,
    /**
     * `isRunning` is what keeps the screen polling between stages. Page counts
     * alone go quiet while the cast is being drawn and again while the cover
     * is, and a screen that stopped asking during either would simply freeze.
     */
    autopilot: {
      enabled: Boolean(book.autopilot?.enabled),
      stage,
      isRunning: ['characters', 'pages', 'cover'].includes(stage),
      characterImages: book.autopilot?.characterImages ?? null,
      error: book.autopilot?.lastError ?? null,
    },
    characters: cast.map((character) => ({
      characterId: String(character._id),
      name: character.name,
      role: character.role,
      status: character.status,
      error: character.lastError ?? null,
      imageUrl: character.primaryMediaId
        ? (urlById.get(String(character.primaryMediaId)) ?? null)
        : null,
    })),
    pages: pages.map((page) => ({
      pageId: String(page._id),
      order: page.order,
      title: page.title,
      status: page.status,
      error: page.lastError ?? null,
      imageUrl: page.mediaAssetId ? (urlById.get(String(page.mediaAssetId)) ?? null) : null,
    })),
  };
}

/* ------------------------------------------------------------------------ *
 * Book covers
 * ------------------------------------------------------------------------ */

/**
 * Records the base cover prompt as a versioned template, the same way a story
 * plan does, so a cover can be traced back to the wording that produced it and
 * a change to that wording is visible rather than silent.
 */
async function ensureCoverPromptVersion() {
  const { key, version, systemInstruction } = BOOK_COVER_PROMPT;

  const existing = await PromptVersion.findOne({ key, version });
  if (existing) return existing;

  // Retire the currently-active version for this key before inserting the new
  // one: the partial unique index allows a single active row per key, so a
  // version bump would otherwise throw E11000 the first time it runs.
  await PromptVersion.updateMany({ key, isActive: true }, { $set: { isActive: false } });

  return PromptVersion.findOneAndUpdate(
    { key, version },
    {
      $setOnInsert: {
        key,
        version,
        provider: 'kie',
        model: env.KIE_IMAGE_MODEL,
        systemInstruction,
        template: 'coverPrompt(book, cast)',
        isActive: true,
        activatedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );
}

/**
 * The book's front cover: the story's own artwork with the title and subtitle
 * lettered into it.
 *
 * This is what the library card shows. The card prints no title of its own any
 * more, so the words have to be in the picture — see `COVER_BASE_PROMPT`.
 *
 * Deliberately its own endpoint rather than a step inside `generateBookImages`:
 * a cover is regenerated on its own far more often than a book is reillustrated,
 * and a failed cover must never mark the book itself as failed.
 */
export async function requestBookCover({ user, book, signal }) {

  const cast = await Character.find({ _id: { $in: book.characterIds ?? [] } });
  const prompt = coverPrompt({ book, cast });

  const screening = await screenPrompt({ ownerId: user._id, prompt });
  if (!screening.allowed) {
    throw ApiError.badRequest('That book cannot have a cover illustrated for it.', {
      code: 'CONTENT_BLOCKED',
    });
  }

  // The prompt carries the title, subtitle, style and cast, so hashing it is
  // what makes "retitle the book, get a new cover" true — and "press the button
  // twice, pay once" true as well.
  const hash = buildRequestHash({
    kind: 'book_cover',
    bookId: String(book._id),
    prompt,
    cast: cast.map((c) => `${c._id}:${c.identity?.fingerprint ?? ''}:${c.primaryMediaId ?? ''}`).sort(),
    model: env.KIE_IMAGE_MODEL,
  });

  const existing = await GenerationJob.findOne({ ownerId: user._id, requestHash: hash });
  if (existing && !['failed', 'cancelled'].includes(existing.status)) {
    return { job: existing, reused: true };
  }

  const promptVersion = await ensureCoverPromptVersion();

  const job =
    existing ??
    (await GenerationJob.create({
      ownerId: user._id,
      type: 'book_cover',
      provider: 'kie',
      model: env.KIE_IMAGE_MODEL,
      promptVersionId: promptVersion?._id ?? null,
      requestHash: hash,
      // Portrait, because a book cover is portrait — and because the card draws
      // it into a 202 x 267 slot.
      request: { prompt, aspectRatio: '3:4', settings: { title: book.title } },
      refs: { bookId: book._id },
      status: 'queued',
    }));

  // A retry still carries the previous attempt's provider task id, and that id
  // is unique per provider — leaving it would make the retry collide with itself.
  await GenerationJob.updateOne(
    { _id: job._id },
    {
      $set: {
        status: 'queued',
        externalTaskId: null,
        settleClaimedAt: null,
        error: { code: null, message: null },
      },
      $inc: { attempts: 1 },
    },
  );

  await chargeJob({ job, reason: 'Book cover' });

  try {
    const { externalTaskId } = await kieImageProvider.createTask({
      prompt,
      aspectRatio: '3:4',
      resolution: '1K',
      outputFormat: 'png',
      referenceUrls: await referenceUrlsForCast(cast),
      jobId: job._id,
      signal,
    });

    await GenerationJob.updateOne(
      { _id: job._id },
      { $set: { externalTaskId, status: 'processing', startedAt: new Date() } },
    );

    schedulePoll(job._id);

    return { job: await GenerationJob.findById(job._id), reused: false };
  } catch (err) {
    await failJob(job._id, err);
    throw err;
  }
}

/**
 * What the cover surfaces need in one call: the picture, where it came from, and
 * whether a job is still working on it.
 */
export async function bookCoverStatus(book) {
  const asset = book.coverMediaId ? await MediaAsset.findById(book.coverMediaId) : null;

  const job = await GenerationJob.findOne({ type: 'book_cover', 'refs.bookId': book._id })
    .sort({ createdAt: -1 })
    .lean();

  return {
    // The surfaces that draw a cover also draw the fallback, and the fallback is
    // these two lines set in type — so they travel with the cover.
    title: book.title,
    subtitle: book.subtitle ?? '',
    coverUrl: asset ? await resolveAssetUrl(asset) : null,
    // `page` means the thumbnail is still standing in: a page illustration, with
    // no title lettered into it.
    source: book.coverMediaId ? (book.coverSource ?? 'page') : null,
    isGenerated: book.coverSource === 'generated' && Boolean(book.coverMediaId),
    job: job
      ? {
          jobId: String(job._id),
          status: job.status,
          error: job.status === 'failed' ? (job.error?.message ?? null) : null,
        }
      : null,
    inFlight: Boolean(job && ['queued', 'processing'].includes(job.status)),
  };
}

/* ------------------------------------------------------------------------ *
 * Autopilot — one prompt in, a finished book out
 * ------------------------------------------------------------------------ */

/**
 * The product's normal path is four screens: review the plan, design the cast,
 * illustrate the pages, then the editor. Each is a real step with real choices,
 * and for an author who just wants the book their Book Settings already
 * describe, all four are decisions they never asked to make.
 *
 * Autopilot runs the same services in the same order, with nobody pressing the
 * buttons. Nothing is bypassed: every stage still screens its prompt, and every
 * screen it skips past stays reachable afterwards for anyone who wants to change
 * something.
 *
 * It is driven by settlement, not by waiting. A stage starts the next one as its
 * last image lands, which means no sleeping loop to get wrong, and a run picks
 * itself back up from a provider callback that arrives after a restart.
 */

const RUNNING_STAGES = ['characters', 'pages', 'cover'];

/**
 * Photographs the author supplied go on the hero.
 *
 * A reference is replayed into every image a character appears in, so it has to
 * belong to somebody. The cast is not known until the plan exists, and the plan
 * is what this run just made — so there is no moment at which the author could
 * have picked. The lead is the one they meant: a photo uploaded to a story about
 * one child is that child.
 */
async function anchorReferences({ ownerId, characters, assetIds }) {
  const lead = characters.find((character) => character.role === 'main') ?? characters[0];
  if (!lead) return;

  for (const assetId of assetIds) {
    await addReference({ ownerId, characterId: lead._id, assetId }).catch((err) => {
      logger.warn({ err, assetId: String(assetId) }, 'Reference could not be attached');
    });
  }
}

/**
 * Starts a run. Returns as soon as the first stage is under way — the caller
 * watches `bookGenerationProgress`, which reports every stage.
 */
export async function startAutopilot({
  user,
  book,
  characterImages = 'generate',
  referenceAssetIds = [],
}) {
  if (book.autopilot?.enabled && RUNNING_STAGES.includes(book.autopilot?.stage)) {
    return { started: false, alreadyRunning: true, stage: book.autopilot.stage };
  }

  const characters = await Character.find({ _id: { $in: book.characterIds ?? [] } });
  const pending = await BookPage.countDocuments({
    bookId: book._id,
    status: { $in: ['pending', 'failed'] },
  });

  const toDraw = characters.filter((character) => character.status !== 'ready');

  if (referenceAssetIds.length > 0) {
    await anchorReferences({ ownerId: user._id, characters, assetIds: referenceAssetIds });
  }

  await Book.updateOne(
    { _id: book._id },
    {
      $set: {
        'autopilot.enabled': true,
        'autopilot.stage': 'characters',
        'autopilot.characterImages': characterImages,
        'autopilot.startedAt': new Date(),
        'autopilot.completedAt': null,
        'autopilot.lastError': null,
      },
    },
  );

  // Deliberately not awaited: the caller answers immediately and the screen
  // polls, exactly as starting a book's illustrations does.
  runCharacterStage({ user, bookId: book._id, characters: toDraw }).catch((err) =>
    logger.error({ err, bookId: String(book._id) }, 'Autopilot character stage failed'),
  );

  return {
    started: true,
    stage: 'characters',
    characters: toDraw.length,
    pages: pending,
  };
}

/**
 * One job per undrawn character, in order — a cast is two or three people, so
 * there is nothing to gain from firing them at once.
 */
async function runCharacterStage({ user, bookId, characters }) {
  for (const character of characters) {
    try {
      await requestCharacterImage({ user, characterId: character._id, pose: 'front', bookId });
    } catch (err) {
      logger.warn(
        { err, characterId: String(character._id) },
        'Autopilot could not start a character illustration',
      );

      // Leaving it in its old status would strand the run: nothing would settle
      // and the book would sit on the character stage forever.
      await Character.updateOne(
        { _id: character._id },
        { $set: { status: 'failed', lastError: err?.message ?? 'Could not be illustrated.' } },
      ).catch(() => {});
    }
  }

  // Covers what a settlement cannot: a book with no cast at all, and a run whose
  // every character image was reused from work already paid for — in both cases
  // nothing is going to settle, so nothing would ever start the next stage.
  await advanceAutopilotAfterCharacters(bookId);
}

/** Records a stage that could not run. The run continues; this is a note. */
async function noteAutopilotError(bookId, err) {
  await Book.updateOne(
    { _id: bookId },
    { $set: { 'autopilot.lastError': err?.message ?? 'A stage could not be started.' } },
  ).catch(() => {});
}

/** Ends the run, whatever state it ended in. */
async function finishAutopilot(bookId) {
  await Book.updateOne(
    { _id: bookId, 'autopilot.enabled': true, 'autopilot.stage': { $in: RUNNING_STAGES } },
    { $set: { 'autopilot.stage': 'done', 'autopilot.completedAt': new Date() } },
  ).catch(() => {});
}

/**
 * Cast done, so illustrate the pages.
 *
 * Called by every character image as it settles, successfully or not, so it must
 * be safe to call repeatedly and from several at once. The `findOneAndUpdate` is
 * the claim: the stage it matches on is the stage it moves off, so exactly one
 * caller gets the book back and starts the pages.
 */
export async function advanceAutopilotAfterCharacters(bookId) {
  if (!bookId) return;

  const book = await Book.findById(bookId);
  if (!book?.autopilot?.enabled || book.autopilot.stage !== 'characters') return;

  const stillDrawing = await Character.countDocuments({
    _id: { $in: book.characterIds ?? [] },
    status: { $in: ['queued', 'generating'] },
  });
  if (stillDrawing > 0) return;

  const claimed = await Book.findOneAndUpdate(
    { _id: bookId, 'autopilot.enabled': true, 'autopilot.stage': 'characters' },
    { $set: { 'autopilot.stage': 'pages' } },
    { new: true },
  );
  if (!claimed) return;

  const user = await User.findById(claimed.ownerId);
  if (!user) return finishAutopilot(bookId);

  try {
    await generateBookImages({ user, book: claimed });
  } catch (err) {
    // A book that is already fully illustrated is not a failure — it just has
    // nothing left to do at this stage.
    if (err?.code !== 'NOTHING_TO_GENERATE') await noteAutopilotError(bookId, err);
    await advanceAutopilotAfterPages(bookId);
  }
}

/**
 * Pages done, so draw the cover.
 *
 * Runs even when some pages failed. A cover is about the book, not about the
 * page that did not render, and the author can retry that page afterwards —
 * ending the run here would leave them with a library card and no title on it.
 */
export async function advanceAutopilotAfterPages(bookId) {
  if (!bookId) return;

  const claimed = await Book.findOneAndUpdate(
    { _id: bookId, 'autopilot.enabled': true, 'autopilot.stage': 'pages' },
    { $set: { 'autopilot.stage': 'cover' } },
    { new: true },
  );
  if (!claimed) return;

  const user = await User.findById(claimed.ownerId);
  if (!user) return finishAutopilot(bookId);

  try {
    await requestBookCover({ user, book: claimed });
  } catch (err) {
    // Say so and end the run, rather than leaving the screen waiting on a cover
    // that is never coming.
    await noteAutopilotError(bookId, err);
    await finishAutopilot(bookId);
  }
}

/** Ends a run once its cover settles, whichever way it went. */
export async function completeAutopilot(bookId) {
  await finishAutopilot(bookId);
}

/** All four poses of a character reference sheet, one job each. */
export async function requestCharacterSheet({ user, characterId }) {

  const jobs = [];
  for (const { pose } of POSES) {
    const { job } = await requestCharacterImage({ user, characterId, pose });
    jobs.push({ pose, jobId: String(job._id) });
  }

  return { jobs, started: jobs.length };
}

export default {
  requestCharacterImage,
  requestPageImage,
  requestBookCover,
  bookCoverStatus,
  startAutopilot,
  advanceAutopilotAfterCharacters,
  advanceAutopilotAfterPages,
  generateBookImages,
  bookGenerationProgress,
  requestCharacterSheet,
  refreshBookProgress,
  settleJob,
  pollOnce,
  handleCallback,
  cancelImageJob,
  schedulePoll,
  stopPolling,
};
