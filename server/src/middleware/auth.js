import { User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { setUserId } from './requestContext.js';

function readBearer(req) {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/**
 * Rejects the request unless a valid access token names a live account.
 *
 * The user is loaded on every request rather than trusted from the token, so a
 * suspension or role change takes effect immediately instead of lingering until
 * the access token expires.
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = readBearer(req);
  if (!token) throw ApiError.unauthorized();

  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub);

  if (!user || user.status !== 'active') {
    throw ApiError.unauthorized('Your account is not available');
  }

  req.user = user;
  setUserId(String(user._id));
  next();
});

/** Attaches the user when a token is present, but never rejects. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = readBearer(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (user && user.status === 'active') {
      req.user = user;
      setUserId(String(user._id));
    }
  } catch {
    // An unusable token on an optional route is simply an anonymous request.
  }

  return next();
});

/** Role gate. Always mount behind requireAuth. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    return next();
  };
}

/**
 * Ownership gate for a loaded document. Admins pass; everyone else must own it.
 * A non-owner gets 404, not 403 — telling them the resource exists would leak
 * the identifier space.
 */
export function assertOwnership(doc, user, { ownerField = 'ownerId' } = {}) {
  if (!doc) throw ApiError.notFound();
  if (user.role === 'admin') return doc;
  if (String(doc[ownerField]) !== String(user._id)) throw ApiError.notFound();
  return doc;
}

export default { requireAuth, optionalAuth, requireRole, assertOwnership };
