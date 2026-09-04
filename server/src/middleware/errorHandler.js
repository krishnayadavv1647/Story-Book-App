import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { isProduction } from '../config/env.js';
import { buildErrorBody } from '../utils/apiResponse.js';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Normalises any thrown value into { status, message, code, details }.
 * Driver text, stack traces and internal identifiers never survive this step.
 */
function normalise(err) {
  if (err?.isApiError) {
    return {
      status: err.statusCode,
      message: err.expose ? err.message : GENERIC_MESSAGE,
      code: err.code,
      details: err.expose ? err.details : null,
    };
  }

  /**
   * Provider failures carry their own code. Collapsing them into a generic 500
   * would leave the UI unable to tell "not configured" from "rate limited" from
   * "timed out" — three problems with three different answers for the user.
   */
  if (err?.isProviderError) {
    const status =
      {
        GEMINI_NOT_CONFIGURED: 503,
        GEMINI_RATE_LIMITED: 429,
        GEMINI_TIMEOUT: 504,
      }[err.code] ?? 502;

    const message =
      {
        GEMINI_NOT_CONFIGURED: 'Story generation is not configured on this server yet.',
        GEMINI_RATE_LIMITED: 'The story service is busy right now. Please try again shortly.',
        GEMINI_TIMEOUT: 'The story service took too long to respond. Please try again.',
        GEMINI_UNAUTHORIZED: 'The story service rejected this server’s credentials.',
      }[err.code] ?? 'The story service is unavailable right now. Please try again.';

    return { status, message, code: err.code, details: { retryable: Boolean(err.retryable) } };
  }

  if (err instanceof ZodError) {
    return {
      status: 422,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    };
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return {
      status: 422,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    };
  }

  if (err instanceof mongoose.Error.CastError) {
    return {
      status: 400,
      message: 'Malformed identifier',
      code: 'BAD_REQUEST',
      details: { path: err.path },
    };
  }

  // Duplicate key — report the field name, never the attempted value.
  if (err?.code === 11000) {
    return {
      status: 409,
      message: 'That value is already in use',
      code: 'DUPLICATE_KEY',
      details: { fields: Object.keys(err.keyPattern ?? {}) },
    };
  }

  if (err?.name === 'TokenExpiredError') {
    return { status: 401, message: 'Session expired', code: 'TOKEN_EXPIRED', details: null };
  }

  if (err?.name === 'JsonWebTokenError') {
    return { status: 401, message: 'Invalid credentials', code: 'UNAUTHENTICATED', details: null };
  }

  // Thrown by express.json() on a malformed payload.
  if (err instanceof SyntaxError && 'body' in err) {
    return { status: 400, message: 'Malformed JSON body', code: 'BAD_REQUEST', details: null };
  }

  return { status: 500, message: GENERIC_MESSAGE, code: 'INTERNAL_ERROR', details: null };
}

// Express identifies error middleware by its four-parameter arity.
export function errorHandler(err, req, res, next) {
  const { status, message, code, details } = normalise(err);

  const logPayload = {
    err,
    status,
    code,
    method: req.method,
    path: req.originalUrl,
  };

  if (status >= 500) {
    logger.error(logPayload, 'Unhandled request failure');
  } else {
    logger.warn(logPayload, 'Request rejected');
  }

  if (res.headersSent) {
    return next(err);
  }

  const body = buildErrorBody({ message, code, details });

  // Stack traces are a development affordance only, and never for 4xx.
  if (!isProduction && status >= 500 && err?.stack) {
    body.error.stack = err.stack.split('\n').slice(0, 8);
  }

  return res.status(status).json(body);
}

export default errorHandler;
