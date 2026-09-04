import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { buildErrorBody } from '../utils/apiResponse.js';

/**
 * Rate limiters are per-surface because the surfaces have very different costs:
 * a login attempt is cheap to serve but valuable to brute-force, a generation
 * request costs real money, and a provider callback must not be throttled to
 * the point of dropping legitimate deliveries.
 */
function build({ max, windowMs = env.RATE_LIMIT_WINDOW_MS, keyBy = 'ip', message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Authenticated traffic is limited per account, so one user on a shared NAT
    // cannot exhaust the budget of everyone behind that address.
    keyGenerator: (req) =>
      keyBy === 'user' && req.user?.id ? `u:${req.user.id}` : `ip:${req.ip}`,
    handler: (_req, res) =>
      res.status(429).json(
        buildErrorBody({
          message: message ?? 'Too many requests. Please slow down.',
          code: 'RATE_LIMITED',
        }),
      ),
  });
}

export const authLimiter = build({
  max: env.RATE_LIMIT_AUTH_MAX,
  message: 'Too many authentication attempts. Try again shortly.',
});

export const chatLimiter = build({ max: env.RATE_LIMIT_CHAT_MAX, keyBy: 'user' });
export const generationLimiter = build({ max: env.RATE_LIMIT_GENERATION_MAX, keyBy: 'user' });
export const uploadLimiter = build({ max: env.RATE_LIMIT_UPLOAD_MAX, keyBy: 'user' });
export const exportLimiter = build({ max: env.RATE_LIMIT_EXPORT_MAX, keyBy: 'user' });
export const callbackLimiter = build({ max: env.RATE_LIMIT_CALLBACK_MAX });
export const defaultLimiter = build({ max: env.RATE_LIMIT_DEFAULT_MAX });

export default {
  authLimiter,
  chatLimiter,
  generationLimiter,
  uploadLimiter,
  exportLimiter,
  callbackLimiter,
  defaultLimiter,
};
