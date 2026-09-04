import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { env } from '../../config/env.js';
import * as storyService from './story.service.js';

/**
 * Aborts the upstream provider call when the browser goes away.
 *
 * Without this, a user who navigates off mid-generation leaves a request running
 * that nobody will read — and one that has
 * to be refunded anyway. Cheaper to stop it.
 */
function abortOnDisconnect(req, res) {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}

export const generatePlan = asyncHandler(async (req, res) => {
  const { prompt, settings } = req.validated.body;

  const result = await storyService.generateStoryPlan({
    user: req.user,
    prompt,
    settings,
    requestId: req.requestId,
    signal: abortOnDisconnect(req, res),
  });

  return sendSuccess(res, {
    data: {
      bookId: String(result.bookId),
      jobId: String(result.jobId),
      reused: result.reused,
      pageCount: result.plan?.pages.length ?? null,
      attempts: result.meta?.attempts ?? null,
    },
    message: result.reused ? 'Existing plan reused' : 'Story plan ready',
  });
});

export const chat = asyncHandler(async (req, res) => {
  const { messages } = req.validated.body;

  const result = await storyService.chat({
    user: req.user,
    messages,
    requestId: req.requestId,
    signal: abortOnDisconnect(req, res),
  });

  return sendSuccess(res, { data: { message: result.message }, message: 'Reply' });
});

export const regenerate = asyncHandler(async (req, res) => {
  const result = await storyService.regeneratePlan({
    user: req.user,
    book: req.book,
    requestId: req.requestId,
    signal: abortOnDisconnect(req, res),
  });

  return sendSuccess(res, {
    data: { bookId: String(result.bookId), jobId: String(result.jobId) },
    message: 'Plan regenerated',
  });
});

export const cancel = asyncHandler(async (req, res) => {
  const result = await storyService.cancelJob({ user: req.user, jobId: req.validated.params.jobId });
  return sendSuccess(res, { data: result, message: 'Job cancelled' });
});

/**
 * Whether each engine is usable, so the agent screen's status meters report
 * something real instead of decoration.
 *
 * Reports booleans and model names only — never a key, and never a base URL,
 * which can carry an account identifier.
 */
export const engines = asyncHandler(async (_req, res) =>
  sendSuccess(res, {
    data: {
      writer: {
        configured: Boolean(env.GEMINI_API_KEY),
        model: env.GEMINI_API_KEY ? env.GEMINI_MODEL : null,
      },
      image: {
        configured: Boolean(env.KIE_API_KEY && env.KIE_BASE_URL && env.KIE_IMAGE_MODEL),
        model: env.KIE_API_KEY ? env.KIE_IMAGE_MODEL || null : null,
      },
    },
    message: 'Engine status',
  }),
);

export default { generatePlan, regenerate, chat, cancel, engines };
