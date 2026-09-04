import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { callbackLimiter, generationLimiter } from '../../middleware/rateLimit.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { GenerationJob, MediaAsset } from '../../models/index.js';
import { resolveAssetUrl } from '../../providers/storage/index.js';
import { loadBook } from '../books/loadBook.js';
import * as imageService from './image.service.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

const router = Router();

/**
 * The provider callback is unauthenticated by necessity — Kie.ai has no account
 * with us. It is protected by the unguessable token in its own path and by a
 * rate limit, and it is never trusted to decide anything: the handler re-reads
 * the task from the provider.
 *
 * Mounted before `requireAuth`, and it always answers 200 so the provider does
 * not retry a delivery we have already dealt with.
 */
router.post(
  '/kie/callback/:token',
  callbackLimiter,
  asyncHandler(async (req, res) => {
    const result = await imageService.handleCallback({
      token: req.params.token,
      body: req.body,
    });

    return sendSuccess(res, { data: result, message: 'Callback received' });
  }),
);

router.use(requireAuth);

router.post(
  '/characters/:characterId/image',
  generationLimiter,
  validate({
    params: z.object({ characterId: objectId }),
    body: z.object({
      pose: z.enum(['front', 'side', 'three_quarter', 'full_body']).default('front'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { job, reused } = await imageService.requestCharacterImage({
      user: req.user,
      characterId: req.validated.params.characterId,
      pose: req.validated.body.pose,
    });

    return sendSuccess(res, {
      data: { jobId: String(job._id), status: job.status, reused },
      message: reused ? 'Existing illustration reused' : 'Illustration started',
    });
  }),
);

/** Every unillustrated page in the book, started in the background. */
router.post(
  '/books/:bookId/images',
  generationLimiter,
  validate({ params: z.object({ bookId: objectId }) }),
  loadBook,
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      data: await imageService.generateBookImages({ user: req.user, book: req.book }),
      message: 'Illustration started',
    }),
  ),
);

/**
 * The one-shot run: cast, pages and cover, in that order, with nobody pressing
 * the buttons between them.
 *
 * The only thing it asks for is how the cast should be drawn — from their
 * written description, or anchored to photographs the author uploaded first.
 * Everything else is already in the book's own settings.
 */
router.post(
  '/books/:bookId/autopilot',
  generationLimiter,
  validate({
    params: z.object({ bookId: objectId }),
    body: z.object({
      characterImages: z.enum(['generate', 'upload']).default('generate'),
      // Uploaded through /media/upload first; the run attaches them to the lead.
      referenceAssetIds: z.array(objectId).max(8).default([]),
    }),
  }),
  loadBook,
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      data: await imageService.startAutopilot({
        user: req.user,
        book: req.book,
        characterImages: req.validated.body.characterImages,
        referenceAssetIds: req.validated.body.referenceAssetIds,
      }),
      message: 'Building your book',
    }),
  ),
);

/** Per-page progress, polled while a book generates. */
router.get(
  '/books/:bookId/progress',
  validate({ params: z.object({ bookId: objectId }) }),
  loadBook,
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      data: await imageService.bookGenerationProgress(req.book),
      message: 'Generation progress',
    }),
  ),
);

/**
 * The book's front cover — the story's artwork with its title and subtitle
 * lettered into the picture. The library card draws this and prints no title
 * beside it, so this is where a book's name becomes visible.
 */
router.post(
  '/books/:bookId/cover',
  generationLimiter,
  validate({ params: z.object({ bookId: objectId }) }),
  loadBook,
  asyncHandler(async (req, res) => {
    const { job, reused } = await imageService.requestBookCover({
      user: req.user,
      book: req.book,
    });

    return sendSuccess(res, {
      data: { jobId: String(job._id), status: job.status, reused },
      message: reused ? 'Existing cover reused' : 'Cover started',
    });
  }),
);

/** Polled while a cover generates, and read on load to decide whether to start one. */
router.get(
  '/books/:bookId/cover',
  validate({ params: z.object({ bookId: objectId }) }),
  loadBook,
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      data: await imageService.bookCoverStatus(req.book),
      message: 'Book cover',
    }),
  ),
);

/** One page — used both for a first attempt and for retrying a failed one. */
router.post(
  '/books/:bookId/pages/:pageId/image',
  generationLimiter,
  validate({ params: z.object({ bookId: objectId, pageId: objectId }) }),
  loadBook,
  asyncHandler(async (req, res) => {
    const { job, reused } = await imageService.requestPageImage({
      user: req.user,
      book: req.book,
      pageId: req.validated.params.pageId,
    });

    return sendSuccess(res, {
      data: { jobId: String(job._id), status: job.status, reused },
      message: reused ? 'Existing illustration reused' : 'Illustration started',
    });
  }),
);

/** All four poses of a character reference sheet. */
router.post(
  '/characters/:characterId/sheet',
  generationLimiter,
  validate({ params: z.object({ characterId: objectId }) }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      data: await imageService.requestCharacterSheet({
        user: req.user,
        characterId: req.validated.params.characterId,
      }),
      message: 'Character sheet started',
    }),
  ),
);

/** Polled by the UI while a job runs. */
router.get(
  '/jobs/:jobId',
  validate({ params: z.object({ jobId: objectId }) }),
  asyncHandler(async (req, res) => {
    const job = await GenerationJob.findOne({
      _id: req.validated.params.jobId,
      ownerId: req.user._id,
    });
    if (!job) throw ApiError.notFound('Job not found');

    const assetId = job.outputs?.[0]?.mediaAssetId ?? null;
    const asset = assetId ? await MediaAsset.findById(assetId) : null;

    return sendSuccess(res, {
      data: {
        jobId: String(job._id),
        status: job.status,
        progress: job.progress,
        // Provider identifiers and cost stay server-side.
        error: job.status === 'failed' ? { code: job.error?.code, message: job.error?.message } : null,
        imageUrl: asset ? await resolveAssetUrl(asset) : null,
      },
      message: 'Job status',
    });
  }),
);

router.post(
  '/jobs/:jobId/cancel',
  validate({ params: z.object({ jobId: objectId }) }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      data: await imageService.cancelImageJob({ user: req.user, jobId: req.validated.params.jobId }),
      message: 'Job cancelled',
    }),
  ),
);

export default router;
