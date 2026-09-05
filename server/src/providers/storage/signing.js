import crypto from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Signed media URLs.
 *
 * An <img> tag cannot send an Authorization header, and our access token lives
 * in memory rather than a cookie — so a media URL has to carry its own proof.
 * The signature covers the asset id and an expiry, so a leaked link stops
 * working and cannot be edited to point at somebody else's asset.
 */
const SECRET = () => env.COOKIE_SECRET || env.KIE_CALLBACK_SECRET || 'storybook-dev';

function sign(assetId, expiresAt) {
  return crypto
    .createHmac('sha256', SECRET())
    .update(`${assetId}:${expiresAt}`)
    .digest('base64url');
}

export function signAssetUrl(assetId, { ttlSeconds = env.STORAGE_SIGNED_URL_TTL_S } = {}) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = sign(assetId, expiresAt);

  /**
   * Relative on purpose. An absolute URL pointing at the API's own host makes
   * the image cross-origin from the app, which Helmet's
   * `Cross-Origin-Resource-Policy: same-site` then blocks — the <img> loads
   * nothing and reports naturalWidth 0 with no error anywhere. A relative path
   * resolves against the page's origin and works behind the dev proxy and a
   * same-origin deploy alike.
   */
  return `/api/v1/media/${assetId}?exp=${expiresAt}&sig=${signature}`;
}

/** Timing-safe, and expiry is checked before the signature is even compared. */
export function verifyAssetUrl({ assetId, exp, sig }) {
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  if (typeof sig !== 'string' || sig.length === 0) return false;

  const expected = Buffer.from(sign(assetId, expiresAt));
  const provided = Buffer.from(sig);

  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

export default { signAssetUrl, verifyAssetUrl };
