import crypto from 'node:crypto';

import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { env, isProduction } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { REFRESH_COOKIE, refreshCookieOptions } from '../../utils/tokens.js';
import {
  buildAuthUrl,
  exchangeCodeForProfile,
  isGoogleAuthConfigured,
} from '../../providers/google/googleAuth.js';
import * as authService from './auth.service.js';

/**
 * The access token is returned in the body for the client to hold in memory;
 * the refresh token only ever travels as an httpOnly cookie. Neither is written
 * anywhere JavaScript on the page can read the long-lived half.
 */
function setRefreshCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
}

function clearRefreshCookie(res) {
  const { maxAge, ...options } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, options);
}

/**
 * The OAuth `state` is stored in a short-lived httpOnly cookie and compared on
 * the callback — a value the attacker cannot forge, which is what makes a
 * planted callback fail. Same path/SameSite as the refresh cookie.
 */
const GSTATE_COOKIE = 'sb_gstate';

function stateCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: 10 * 60 * 1000,
  };
}

/** Where to send the browser back to once the OAuth round-trip is over. */
function clientRedirect(pathAndQuery) {
  const base = env.CLIENT_ORIGIN[0].replace(/\/$/, '');
  return `${base}${pathAndQuery}`;
}

/**
 * Registering no longer signs anybody in. The account exists, a code is on its
 * way, and the next step is `/auth/otp/verify` — which is the same step a
 * partner app's reader takes, so there is one verification path, not two.
 */
export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.validated.body);

  return sendCreated(res, {
    data: {
      verificationRequired: true,
      email: result.email,
      ...(isProduction ? {} : { devCode: result.devCode ?? null }),
    },
    message: 'Check your email for a code to finish signing up.',
  });
});

export const login = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken, session } = await authService.login(req.validated.body, req);

  setRefreshCookie(res, refreshToken);
  return sendSuccess(res, { data: { accessToken, ...session }, message: 'Signed in' });
});

/**
 * Step 1 of Sign in with Google: send the browser to Google's consent screen.
 * A random `state` is planted in a cookie and echoed in the URL so the callback
 * can prove the round-trip started here.
 */
export const googleStart = asyncHandler(async (req, res) => {
  if (!isGoogleAuthConfigured()) {
    return res.redirect(clientRedirect('/sign-in?error=google_unavailable'));
  }

  const state = crypto.randomBytes(16).toString('base64url');
  res.cookie(GSTATE_COOKIE, state, stateCookieOptions());
  return res.redirect(buildAuthUrl({ state }));
});

/**
 * Step 2: Google returns the user here with a one-time `code`. We verify the
 * `state`, exchange the code for the verified profile, issue our own session as
 * an httpOnly refresh cookie, and hand the browser back to the app — which
 * turns that cookie into a live session through its normal silent refresh. The
 * access token is never put in the URL.
 */
export const googleCallback = asyncHandler(async (req, res) => {
  const { maxAge, ...clearOptions } = stateCookieOptions();
  res.clearCookie(GSTATE_COOKIE, clearOptions);

  const { code, state, error } = req.query;
  const cookieState = req.cookies?.[GSTATE_COOKIE];

  if (error) {
    // The user declined at Google's screen — not an error worth alarming them.
    return res.redirect(clientRedirect('/sign-in?error=google_denied'));
  }

  if (!code || !state || !cookieState || state !== cookieState) {
    return res.redirect(clientRedirect('/sign-in?error=google_failed'));
  }

  try {
    const profile = await exchangeCodeForProfile(String(code));
    const { refreshToken } = await authService.signInWithGoogleProfile(profile, req);
    setRefreshCookie(res, refreshToken);
    return res.redirect(clientRedirect('/'));
  } catch (err) {
    logger.warn({ err }, 'Google sign-in callback failed');
    return res.redirect(clientRedirect('/sign-in?error=google_failed'));
  }
});

export const refresh = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken, session } = await authService.rotateRefreshToken(
    req.cookies?.[REFRESH_COOKIE],
    req,
  );

  setRefreshCookie(res, refreshToken);
  return sendSuccess(res, { data: { accessToken, ...session }, message: 'Session refreshed' });
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  return sendSuccess(res, { data: null, message: 'Signed out' });
});

export const session = asyncHandler(async (req, res) => {
  const payload = await authService.toSessionPayload(req.user);
  return sendSuccess(res, { data: payload, message: 'Session' });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.requestPasswordReset(req.validated.body);

  // Deliberately identical whether or not the address is registered.
  return sendSuccess(res, {
    data: isProduction ? null : { devToken: result.devToken ?? null },
    message: 'If that email has an account, a reset link is on its way.',
  });
});

/**
 * The reply never varies: same message, same status, whether the address was
 * already registered, has just been created, is suspended, or is still inside
 * its resend cooldown. A public endpoint that answered differently would be a
 * way to find out who has an account here.
 */
export const requestLoginCode = asyncHandler(async (req, res) => {
  const result = await authService.requestLoginCode(req.validated.body);

  return sendSuccess(res, {
    data: isProduction ? null : { devCode: result.devCode ?? null },
    message: 'If that address can receive mail, a sign-in code is on its way.',
  });
});

export const verifyLoginCode = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken, session } = await authService.verifyLoginCode(
    req.validated.body,
    req,
  );

  setRefreshCookie(res, refreshToken);
  return sendSuccess(res, { data: { accessToken, ...session }, message: 'Signed in' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.validated.body);
  clearRefreshCookie(res);

  return sendSuccess(res, {
    data: null,
    message: 'Password updated. Sign in with your new password.',
  });
});

export default {
  register,
  login,
  googleStart,
  googleCallback,
  refresh,
  logout,
  session,
  forgotPassword,
  resetPassword,
  requestLoginCode,
  verifyLoginCode,
};
