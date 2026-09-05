import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

const DURATION = /^(\d+)(s|m|h|d)$/;
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Turns "30d" / "15m" into milliseconds so cookie and DB expiry agree with the JWT. */
export function durationToMs(value) {
  const match = DURATION.exec(String(value).trim());
  if (!match) throw new Error(`Unsupported duration: ${value}`);
  return Number(match[1]) * UNIT_MS[match[2]];
}

export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL, issuer: 'storybook-studio' },
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'storybook-studio' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Session expired', { code: 'TOKEN_EXPIRED' });
    }
    throw ApiError.unauthorized('Invalid credentials');
  }
}

/**
 * Refresh tokens are opaque random strings. Only their SHA-256 hash is stored,
 * so a database leak yields nothing replayable. SHA-256 rather than bcrypt is
 * correct here: the input is 256 bits of entropy, so there is nothing to brute
 * force, and lookup must be an indexed equality match.
 */
export function generateRefreshToken() {
  const raw = crypto.randomBytes(48).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** IPs are hashed before storage — enough to spot reuse, not enough to track. */
export function hashIp(ip) {
  if (!ip) return null;
  return crypto
    .createHash('sha256')
    .update(`${ip}:${env.COOKIE_SECRET || 'storybook'}`)
    .digest('hex')
    .slice(0, 32);
}

export const REFRESH_COOKIE = 'sb_refresh';

/**
 * Scoped to the auth routes: no other endpoint needs the refresh cookie, so no
 * other endpoint should receive it. SameSite=Lax plus that path is what keeps
 * the CSRF surface down to a single, side-effect-limited endpoint.
 */
export function refreshCookieOptions() {
  const sameSite = env.COOKIE_SAMESITE;
  return {
    httpOnly: true,
    // SameSite=None is only honoured on a Secure cookie, so force it — a
    // cross-origin frontend cannot receive the session otherwise.
    secure: env.COOKIE_SECURE || sameSite === 'none',
    sameSite,
    path: '/api/v1/auth',
    maxAge: durationToMs(env.JWT_REFRESH_TTL),
  };
}

export default {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
  hashIp,
  durationToMs,
  REFRESH_COOKIE,
  refreshCookieOptions,
};
