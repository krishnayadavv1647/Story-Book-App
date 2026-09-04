import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { isProduction } from '../../config/env.js';
import { REFRESH_COOKIE, refreshCookieOptions } from '../../utils/tokens.js';
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

export const register = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken, session } = await authService.register(
    req.validated.body,
    req,
  );

  setRefreshCookie(res, refreshToken);
  return sendCreated(res, { data: { accessToken, ...session }, message: 'Account created' });
});

export const login = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken, session } = await authService.login(req.validated.body, req);

  setRefreshCookie(res, refreshToken);
  return sendSuccess(res, { data: { accessToken, ...session }, message: 'Signed in' });
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

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.validated.body);
  clearRefreshCookie(res);

  return sendSuccess(res, {
    data: null,
    message: 'Password updated. Sign in with your new password.',
  });
});

export default { register, login, refresh, logout, session, forgotPassword, resetPassword };
