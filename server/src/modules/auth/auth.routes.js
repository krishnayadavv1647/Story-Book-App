import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import * as controller from './auth.controller.js';
import {
  bonusCodeParamSchema,
  forgotPasswordSchema,
  requestLoginCodeSchema,
  verifyLoginCodeSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth.validators.js';

const router = Router();

// Every credential-accepting route is rate limited: these are the endpoints
// worth brute-forcing, and they are cheap to hammer.
router.post('/register', authLimiter, validate({ body: registerSchema }), controller.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
// Sign in with Google — server-side Authorization Code flow. `google` sends the
// browser to Google; `google/callback` is Google's return, and must be listed
// as an Authorized redirect URI on the OAuth credential.
router.get('/google', authLimiter, controller.googleStart);
router.get('/google/callback', controller.googleCallback);
/**
 * Sign in with a code emailed to the address — and, for an address nobody has
 * used before, sign up with one.
 *
 * Public by design: another app's browser calls these directly, which is what
 * lets it register somebody without holding a secret of ours. Both wear the
 * auth rate limit, which is the only thing between a stranger and our mailer.
 */
router.post(
  '/otp/request',
  authLimiter,
  validate({ body: requestLoginCodeSchema }),
  controller.requestLoginCode,
);
router.post(
  '/otp/verify',
  authLimiter,
  validate({ body: verifyLoginCodeSchema }),
  controller.verifyLoginCode,
);

// What a bonus link offers, for the sign-up page it lands on. Public by nature —
// it is read before anybody has an account — and rate limited like the rest.
router.get(
  '/bonus/:code',
  authLimiter,
  validate({ params: bonusCodeParamSchema }),
  controller.bonusLookup,
);

router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/session', requireAuth, controller.session);

router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  controller.forgotPassword,
);
router.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  controller.resetPassword,
);

export default router;
