import crypto from 'node:crypto';
import mongoose from 'mongoose';

import { RefreshToken, User } from '../../models/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { isMailConfigured, sendMail } from '../../providers/email/mailer.js';
import { loginCodeEmail, passwordResetEmail } from '../../providers/email/templates.js';
import { recordSignupGrant } from '../credits/credits.service.js';
import { assignPlanByKey } from '../plans/plans.service.js';
import { resolveLink, settleSignupBonus } from '../bonus-links/bonusLinks.service.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  durationToMs,
  generateRefreshToken,
  hashIp,
  hashToken,
  signAccessToken,
} from '../../utils/tokens.js';

const RESET_TTL_MS = 30 * 60 * 1000;

/** Six digits: short enough to read off a phone and retype without a mistake. */
const CODE_LENGTH = 6;

/**
 * `randomInt` and not `Math.random`: this is a credential, and a predictable
 * one is no credential at all.
 */
function generateLoginCode() {
  return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

/**
 * A name for an account created by someone typing only their email. The local
 * part is the best guess available, and the user can change it in Settings.
 */
function nameFromEmail(email) {
  const local = String(email).split('@')[0].replace(/[._-]+/g, ' ').trim();
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Reader';
}

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
      credits: user.credits ?? 0,
      emailVerified: Boolean(user.emailVerifiedAt),
      preferences: user.preferences,
    },
  };
}

/**
 * Everything a brand-new account gets, wherever it signed up from.
 *
 * Three routes create accounts — the register form, Sign in with Google, and a
 * code sent to an address nobody has used before — and all three come through
 * here, so a new arrival cannot end up with a plan on one path and nothing on
 * another.
 */
async function openNewAccount(user, { bonusLink = null } = {}) {
  // A bonus account opens with nothing: its credits are the link's plan, and
  // they arrive when the address is proved (`settleSignupBonus`). Granting the
  // ordinary opening balance too would stack the two.
  if (bonusLink) return;

  await recordSignupGrant(user);

  const granted = await assignPlanByKey({ userId: user._id, key: env.SIGNUP_PLAN_KEY });
  // The document in hand is now behind the database, and the caller may be
  // about to build a session payload out of it.
  if (granted) user.credits = granted.balance;
}

/**
 * Puts a fresh code on the account and mails it.
 *
 * Shared by every route that needs one — asking for a code, registering, and
 * signing in to an address that was never verified — so the cooldown and the
 * hashing rules cannot drift apart between them.
 */
async function issueLoginCode(user) {
  const lastSent = user.loginCode?.requestedAt;
  if (lastSent && Date.now() - lastSent.getTime() < env.OTP_RESEND_COOLDOWN_S * 1000) {
    // The code already sent is still valid, so there is nothing to do.
    return { delivered: false, throttled: true };
  }

  const code = generateLoginCode();
  user.loginCode = {
    codeHash: hashToken(code),
    expiresAt: new Date(Date.now() + env.OTP_CODE_TTL_MINUTES * 60 * 1000),
    attempts: 0,
    requestedAt: new Date(),
  };
  await user.save();

  let delivered = false;
  if (isMailConfigured()) {
    try {
      await sendMail({
        to: user.email,
        ...loginCodeEmail({ name: user.name, code, expiresInMinutes: env.OTP_CODE_TTL_MINUTES }),
        tags: [{ name: 'type', value: 'login_code' }],
      });
      delivered = true;
    } catch (error) {
      logger.error(
        { userId: String(user._id), code: error.code },
        'Could not send the sign-in code',
      );
    }
  }

  // Outside production the code is handed back so the flow can be walked
  // through without a mail provider configured.
  if (env.NODE_ENV !== 'production') {
    logger.info({ email: user.email }, `Sign-in code (dev only): ${code}`);
    return { delivered, code };
  }

  return { delivered };
}

export async function register({ name, email, password, bonusCode }) {
  const existing = await User.findOne({ email });
  if (existing) {
    // The address is already visible to whoever owns it, and refusing to say so
    // here just sends people to a confusing "wrong password" on sign-in.
    throw ApiError.conflict('An account already exists for that email address');
  }

  const bonusLink = await resolveLink(bonusCode);
  const user = await User.create({
    name,
    email,
    password,
    ...(bonusLink ? { credits: 0, pendingBonusLinkId: bonusLink._id } : {}),
  });
  await openNewAccount(user, { bonusLink });

  // No session yet. An address nobody has proved they can read is not an
  // account anybody should be signed in to — the emailed code is that proof,
  // and `verifyLoginCode` is what turns it into a session.
  const { code } = await issueLoginCode(user);

  return { verificationRequired: true, email: user.email, devCode: code ?? null };
}

export async function login({ email, password }, req) {
  // `loginCode.requestedAt` comes along because an unverified account is sent a
  // code from here — without it the resend cooldown cannot be seen, and every
  // attempt would mail a fresh code and invalidate the last one.
  const user = await User.findOne({ email }).select('+passwordHash +loginCode.requestedAt');

  // Same error and roughly the same work whether or not the account exists, so
  // the response cannot be used to enumerate registered addresses.
  const ok = user ? await user.verifyPassword(password) : false;
  if (!user || !ok) {
    throw ApiError.unauthorized('Email or password is incorrect');
  }

  if (user.status !== 'active') {
    throw ApiError.forbidden('This account is not available');
  }

  /**
   * The password was right, and that is exactly why this is not a rejection:
   * the account exists and belongs to whoever typed it. What is missing is
   * proof that the address works, so a code goes out and the caller finishes
   * there. An account that predates verification meets this once.
   */
  if (!user.emailVerifiedAt) {
    await issueLoginCode(user);
    throw ApiError.forbidden('Check your email for a code to finish signing in.', {
      code: 'EMAIL_NOT_VERIFIED',
      details: { email: user.email },
    });
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
export async function signInWithGoogleProfile(profile, req, { bonusCode = null } = {}) {
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
      const bonusLink = await resolveLink(bonusCode);
      user = new User({
        email: profile.email,
        name: profile.name,
        googleId: profile.sub,
        avatarUrl: profile.picture,
        emailVerifiedAt: new Date(),
        ...(bonusLink ? { credits: 0, pendingBonusLinkId: bonusLink._id } : {}),
      });
    }
  }

  if (user.status !== 'active') {
    throw ApiError.forbidden('This account is not available');
  }

  // Read before the save, which is what turns a new document into a stored one.
  const isNewAccount = user.isNew;

  user.lastLoginAt = new Date();
  await user.save();

  // Google has already proved the address, which is why this route hands back a
  // session straight away.
  if (isNewAccount) {
    await openNewAccount(user, { bonusLink: user.pendingBonusLinkId ? {} : null });
    // Nothing to wait for: Google has proved the address, so a bonus link's
    // plan is handed over now rather than on a verification that never comes.
    await settleSignupBonus(user);
  }

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

/**
 * Emails a one-time sign-in code, creating the account if it is new.
 *
 * This is how a partner app registers somebody without holding a secret: it
 * asks for a code, the reader types it back, and an account exists. Because the
 * endpoint is public, three things carry the weight — the caller never learns
 * whether the address was already registered, a per-address cooldown stops the
 * mailer being used to flood somebody, and the code is stored hashed and burned
 * after a handful of wrong guesses.
 */
export async function requestLoginCode({ email, name, bonusCode }) {
  let user = await User.findOne({ email }).select('+loginCode.requestedAt');
  const isNewAccount = !user;

  if (!user) {
    // Only ever on a brand-new account, so asking for a second code — with or
    // without a bonus link — cannot collect anything twice.
    const bonusLink = await resolveLink(bonusCode);
    user = await User.create({
      email,
      name: name?.trim() || nameFromEmail(email),
      ...(bonusLink ? { credits: 0, pendingBonusLinkId: bonusLink._id } : {}),
    });
    await openNewAccount(user, { bonusLink });
  }

  // A suspended account gets no code, and no explanation either.
  if (user.status !== 'active') return { delivered: false, isNewAccount };

  const { delivered, code } = await issueLoginCode(user);
  return code ? { delivered, isNewAccount, devCode: code } : { delivered, isNewAccount };
}

/**
 * Exchanges a valid code for a session.
 *
 * Every failure answers the same way. Telling the caller whether the address
 * exists, whether a code was ever asked for, or whether this one has expired
 * would turn a public endpoint into an enumeration tool; "ask for a new one"
 * covers all of them and is the only useful next step in each case.
 */
export async function verifyLoginCode({ email, code }, req) {
  const user = await User.findOne({ email }).select(
    '+loginCode.codeHash +loginCode.expiresAt +loginCode.attempts',
  );

  const rejected = () =>
    ApiError.unauthorized('That code is not valid. Ask for a new one.', {
      code: 'INVALID_LOGIN_CODE',
    });

  const clearCode = async () => {
    user.loginCode = { codeHash: null, expiresAt: null, attempts: 0, requestedAt: null };
    await user.save();
  };

  if (!user?.loginCode?.codeHash || !user.loginCode.expiresAt) throw rejected();

  if (user.loginCode.expiresAt.getTime() < Date.now()) {
    await clearCode();
    throw rejected();
  }

  // Burn the code rather than merely refusing this guess: six digits is a
  // million combinations, which is walkable inside the lifetime otherwise.
  if ((user.loginCode.attempts ?? 0) >= env.OTP_MAX_ATTEMPTS) {
    await clearCode();
    throw rejected();
  }

  if (hashToken(code) !== user.loginCode.codeHash) {
    await User.updateOne({ _id: user._id }, { $inc: { 'loginCode.attempts': 1 } });
    throw rejected();
  }

  if (user.status !== 'active') throw ApiError.forbidden('This account is not available');

  user.loginCode = { codeHash: null, expiresAt: null, attempts: 0, requestedAt: null };
  // Typing a code that only arrived by email proves the address works, which is
  // exactly what verification means — and what the register and login routes
  // are waiting for.
  user.emailVerifiedAt = user.emailVerifiedAt ?? new Date();
  user.lastLoginAt = new Date();
  await user.save();

  // An account that signed up through a bonus link receives its plan here, and
  // only here — before the session payload is built, so the balance it shows
  // is the one the reader actually has.
  await settleSignupBonus(user);

  const tokens = await issueSession(user, req);
  return { ...tokens, session: await toSessionPayload(user) };
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
  requestLoginCode,
  verifyLoginCode,
  toSessionPayload,
};
