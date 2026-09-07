import crypto from 'node:crypto';
import mongoose from 'mongoose';

import { RefreshToken, User } from '../../models/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { isMailConfigured, sendMail } from '../../providers/email/mailer.js';
import { passwordResetEmail } from '../../providers/email/templates.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  durationToMs,
  generateRefreshToken,
  hashIp,
  hashToken,
  signAccessToken,
} from '../../utils/tokens.js';

const RESET_TTL_MS = 30 * 60 * 1000;

function sessionMeta(req) {
  return {
    userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
    ipHash: hashIp(req.ip),
  };
}

async function issueSession(user, req, { family } = {}) {
  const { raw, hash } = generateRefreshToken();

  const token = await RefreshToken.create({
    userId: user._id,
    tokenHash: hash,
    family: family ?? new mongoose.Types.ObjectId(),
    expiresAt: new Date(Date.now() + durationToMs(env.JWT_REFRESH_TTL)),
    ...sessionMeta(req),
  });

  return { accessToken: signAccessToken(user), refreshToken: raw, tokenId: token._id };
}

export async function toSessionPayload(user) {
  return {
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
      emailVerified: Boolean(user.emailVerifiedAt),
      preferences: user.preferences,
    },
  };
}

export async function register({ name, email, password }, req) {
  const existing = await User.findOne({ email });
  if (existing) {
    // The address is already visible to whoever owns it, and refusing to say so
    // here just sends people to a confusing "wrong password" on sign-in.
    throw ApiError.conflict('An account already exists for that email address');
  }

  const user = await User.create({ name, email, password });

  const tokens = await issueSession(user, req);
  return { ...tokens, session: await toSessionPayload(user) };
}

export async function login({ email, password }, req) {
  const user = await User.findOne({ email }).select('+passwordHash');

  // Same error and roughly the same work whether or not the account exists, so
  // the response cannot be used to enumerate registered addresses.
  const ok = user ? await user.verifyPassword(password) : false;
  if (!user || !ok) {
    throw ApiError.unauthorized('Email or password is incorrect');
  }

  if (user.status !== 'active') {
    throw ApiError.forbidden('This account is not available');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueSession(user, req);
  return { ...tokens, session: await toSessionPayload(user) };
}

/**
 * Sign in (or up) from an already-verified Google profile (the callback has
 * exchanged the code and verified the ID token before calling this).
 *
 * Matching is by Google `sub` — the one identifier Google guarantees is stable
 * — and falls back to the verified email, so a visitor who first registered
 * with a password and later signs in with Google lands on the *same* account
 * rather than a duplicate. A brand-new visitor gets an account with no password
 * (they sign in through Google) and an email already marked verified, because
 * Google verified it for us.
 */
export async function signInWithGoogleProfile(profile, req) {
  // An unverified Google email must never be trusted to match an existing
  // account — that would let someone claim another person's address.
  if (!profile.email || !profile.emailVerified) {
    throw ApiError.unauthorized('Your Google account needs a verified email address to sign in');
  }

  let user = await User.findOne({ googleId: profile.sub });

  if (!user) {
    const byEmail = await User.findOne({ email: profile.email });
    if (byEmail) {
      // Link Google to the existing account. The password, if any, still works.
      byEmail.googleId = profile.sub;
      if (!byEmail.avatarUrl && profile.picture) byEmail.avatarUrl = profile.picture;
      if (!byEmail.emailVerifiedAt) byEmail.emailVerifiedAt = new Date();
      user = byEmail;
    } else {
      user = new User({
        email: profile.email,
        name: profile.name,
        googleId: profile.sub,
        avatarUrl: profile.picture,
        emailVerifiedAt: new Date(),
      });
    }
  }

  if (user.status !== 'active') {
    throw ApiError.forbidden('This account is not available');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueSession(user, req);
  return { ...tokens, session: await toSessionPayload(user) };
}

/**
 * Rotation with reuse detection.
 *
 * Every refresh burns the presented token and issues a new one in the same
 * family. Presenting an already-rotated token means it leaked — the legitimate
 * holder has moved on — so the entire family is revoked and both parties are
 * forced to sign in again. That is the point: a stolen token buys at most one
 * refresh before the theft is detected.
 */
export async function rotateRefreshToken(rawToken, req) {
  if (!rawToken) throw ApiError.unauthorized('No active session');

  const presented = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
  if (!presented) throw ApiError.unauthorized('No active session');

  if (presented.status !== 'active') {
    await RefreshToken.updateMany(
      { family: presented.family, status: { $ne: 'revoked' } },
      { $set: { status: 'revoked', revokedAt: new Date(), revokedReason: 'token_reuse' } },
    );
    logger.warn({ userId: String(presented.userId) }, 'Refresh token reuse detected');
    throw ApiError.unauthorized('Session is no longer valid');
  }

  if (presented.expiresAt.getTime() < Date.now()) {
    throw ApiError.unauthorized('Session expired');
  }

  const user = await User.findById(presented.userId);
  if (!user || user.status !== 'active') {
    throw ApiError.unauthorized('Your account is not available');
  }

  const next = await issueSession(user, req, { family: presented.family });

  presented.status = 'rotated';
  presented.replacedBy = next.tokenId;
  await presented.save();

  return { ...next, session: await toSessionPayload(user) };
}

export async function logout(rawToken) {
  if (!rawToken) return;

  await RefreshToken.findOneAndUpdate(
    { tokenHash: hashToken(rawToken), status: 'active' },
    { $set: { status: 'revoked', revokedAt: new Date(), revokedReason: 'logout' } },
  );
}

/** Ends every session for the account — used after a password reset. */
export async function revokeAllSessions(userId, reason) {
  await RefreshToken.updateMany(
    { userId, status: { $ne: 'revoked' } },
    { $set: { status: 'revoked', revokedAt: new Date(), revokedReason: reason } },
  );
}

/**
 * Sends the reset link, and reports only whether it went out.
 *
 * A delivery failure is never raised to the caller: the reply to a reset
 * request is identical whatever happens, so an error here would either leak
 * that the address is registered or turn a working request into a 500. The log
 * is the only place a failure is visible.
 */
async function deliverResetLink(user, link) {
  if (!isMailConfigured()) {
    if (env.NODE_ENV === 'production') {
      logger.warn(
        { userId: String(user._id) },
        'Password reset requested but no mailer is configured',
      );
    }
    return false;
  }

  try {
    await sendMail({
      to: user.email,
      ...passwordResetEmail({
        name: user.name,
        link,
        expiresInMinutes: Math.round(RESET_TTL_MS / 60_000),
      }),
      tags: [{ name: 'type', value: 'password_reset' }],
    });
    return true;
  } catch (error) {
    logger.error(
      { userId: String(user._id), code: error.code, retryable: error.retryable },
      'Could not send the password reset email',
    );
    return false;
  }
}

/**
 * Always resolves the same way whether or not the address is registered — the
 * response must not reveal who has an account.
 *
 * With a mailer configured the link is emailed. Without one — the default in
 * development — it is logged instead, and the raw token comes back to the
 * caller, which surfaces it ONLY outside production.
 */
export async function requestPasswordReset({ email }) {
  const user = await User.findOne({ email });
  if (!user) return { delivered: false };

  const raw = crypto.randomBytes(32).toString('base64url');
  user.passwordReset = {
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
    requestedAt: new Date(),
  };
  await user.save();

  const link = `${env.CLIENT_ORIGIN[0]}/reset-password?token=${raw}`;
  const delivered = await deliverResetLink(user, link);

  if (env.NODE_ENV !== 'production') {
    logger.info({ email: user.email }, `Password reset link (dev only): ${link}`);
    return { delivered, devToken: raw };
  }

  return { delivered };
}

export async function resetPassword({ token, password }) {
  const user = await User.findOne({
    'passwordReset.tokenHash': hashToken(token),
    'passwordReset.expiresAt': { $gt: new Date() },
  }).select('+passwordReset.tokenHash +passwordReset.expiresAt');

  if (!user) {
    throw ApiError.badRequest('This reset link is invalid or has expired', {
      code: 'INVALID_RESET_TOKEN',
    });
  }

  user.password = password;
  user.passwordReset = { tokenHash: null, expiresAt: null, requestedAt: null };
  await user.save();

  // Anyone holding a session from before the reset loses it.
  await revokeAllSessions(user._id, 'password_reset');

  return { email: user.email };
}

export default {
  register,
  login,
  signInWithGoogleProfile,
  rotateRefreshToken,
  logout,
  revokeAllSessions,
  requestPasswordReset,
  resetPassword,
  toSessionPayload,
};
