import { Router } from 'express';
import { sendSuccess } from '../utils/apiResponse.js';
import { env } from '../config/env.js';
import { isGoogleAuthConfigured } from '../providers/google/googleAuth.js';

const router = Router();

/**
 * Public runtime configuration for the browser.
 *
 * The client reads whatever it needs from here instead of from its own
 * build-time env, so every setting lives in one place: the server's
 * environment. For Google sign-in the browser only needs to know *whether* it
 * is enabled — the client id, secret and redirect URI all stay on the server
 * (the flow is server-side), so none of them is exposed here.
 *
 * Hard rule: only values safe to hand any visitor may appear. NEVER a secret.
 * This endpoint is intentionally unauthenticated.
 */
router.get('/config', (_req, res) =>
  sendSuccess(res, {
    data: {
      googleAuthEnabled: isGoogleAuthConfigured(),
      // A public YouTube link, or null when the welcome pop-up is switched off.
      welcomeVideoUrl: /^(off|none|false)$/i.test(env.WELCOME_VIDEO_URL)
        ? null
        : env.WELCOME_VIDEO_URL,
    },
    message: 'Public configuration',
  }),
);

export default router;
