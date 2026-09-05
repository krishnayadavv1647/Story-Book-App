import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { MediaAsset } from '../../models/index.js';
import { localDriver } from './local.driver.js';
import { memoryDriver } from './memory.driver.js';
import { s3Driver } from './s3.driver.js';
import { signAssetUrl } from './signing.js';

/**
 * The storage boundary. Nothing above this file knows whether bytes live in S3,
 * in R2 or in a Map.
 *
 * `s3` is the configured default. Without a bucket it falls back to the local
 * disk, so a developer with no cloud credentials still gets a working pipeline —
 * and, unlike the in-memory store, one whose images survive a restart. The
 * in-memory store stays for tests, where persistence would only leak state
 * between runs.
 */
function selectDriver() {
  if (env.STORAGE_DRIVER === 'memory') return memoryDriver;
  if (env.STORAGE_DRIVER === 'local') return localDriver;

  if (!env.STORAGE_BUCKET) {
    logger.warn(
      { directory: localDriver.root },
      'No STORAGE_BUCKET configured — storing images on the local disk. Set a bucket before deploying',
    );
    return localDriver;
  }
  return s3Driver;
}

export const storage = selectDriver();

const EXTENSION = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };

export function buildKey({ ownerId, kind, contentType }) {
  const extension = EXTENSION[contentType] ?? 'bin';
  return `${kind}/${ownerId}/${crypto.randomUUID()}.${extension}`;
}

const MAX_TRANSFER_BYTES = 25 * 1024 * 1024;

/**
 * Copies a provider's image into our own bucket and records a MediaAsset.
 *
 * This is not an optimisation. A provider URL expires, so a book that merely
 * linked to one would quietly lose its illustrations; and the bytes are the
 * user's, not the provider's, to keep.
 */
export async function ingestRemoteImage({ url, ownerId, kind, refs = {}, origin = {}, signal }) {
  let response;
  try {
    response = await fetch(url, { signal });
  } catch (cause) {
    throw ApiError.providerFailure('Could not download the generated image', {
      code: 'MEDIA_DOWNLOAD_FAILED',
      cause,
    });
  }

  if (!response.ok) {
    throw ApiError.providerFailure('Could not download the generated image', {
      code: 'MEDIA_DOWNLOAD_FAILED',
      details: { status: response.status },
    });
  }

  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_TRANSFER_BYTES) {
    throw ApiError.badRequest('That image is too large to store', { code: 'MEDIA_TOO_LARGE' });
  }

  const contentType = (response.headers.get('content-type') ?? 'image/png').split(';')[0].trim();
  if (!contentType.startsWith('image/')) {
    // A provider returning something that is not an image is a bug or an
    // attack; either way it must not be written to our bucket.
    throw ApiError.providerFailure('The provider returned something that is not an image', {
      code: 'MEDIA_NOT_AN_IMAGE',
      details: { contentType },
    });
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_TRANSFER_BYTES) {
    throw ApiError.badRequest('That image is too large to store', { code: 'MEDIA_TOO_LARGE' });
  }

  const key = buildKey({ ownerId, kind, contentType });
  const stored = await storage.put({ key, body, contentType });

  return MediaAsset.create({
    ownerId,
    kind,
    status: 'stored',
    storage: {
      driver: storage.name,
      bucket: env.STORAGE_BUCKET || null,
      key: stored.key,
      etag: stored.etag,
      sizeBytes: stored.sizeBytes,
      contentType,
    },
    checksumSha256: crypto.createHash('sha256').update(body).digest('hex'),
    origin: { ...origin, sourceUrl: url },
    refs,
    moderation: { status: 'pending' },
  });
}

/** Stores bytes we already hold — an upload rather than a provider result. */
export async function ingestBuffer({ body, contentType, ownerId, kind, refs = {}, tempExpiresAt = null }) {
  const key = buildKey({ ownerId, kind, contentType });
  const stored = await storage.put({ key, body, contentType });

  return MediaAsset.create({
    ownerId,
    kind,
    status: 'stored',
    storage: {
      driver: storage.name,
      bucket: env.STORAGE_BUCKET || null,
      key: stored.key,
      etag: stored.etag,
      sizeBytes: stored.sizeBytes,
      contentType,
    },
    checksumSha256: crypto.createHash('sha256').update(body).digest('hex'),
    refs,
    // Unclaimed uploads are reaped by the TTL index rather than lingering.
    tempExpiresAt,
    moderation: { status: 'pending' },
  });
}

/** A URL the browser can load: presigned upstream, or signed through our route. */
export async function resolveAssetUrl(asset) {
  if (!asset?.storage?.key) return null;

  if (storage.supportsDirectUrl) {
    return storage.directUrl(asset.storage.key);
  }

  return signAssetUrl(String(asset._id));
}

export { signAssetUrl } from './signing.js';
export default { storage, ingestRemoteImage, ingestBuffer, resolveAssetUrl, buildKey };
