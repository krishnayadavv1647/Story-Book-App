import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from '../../config/env.js';

/**
 * S3-compatible object storage — one driver for both AWS S3 and Cloudflare R2.
 *
 * R2 needs nothing special beyond `STORAGE_ENDPOINT` pointing at
 * `https://<account>.r2.cloudflarestorage.com` and `STORAGE_REGION=auto`, which
 * is why there is no separate R2 adapter to keep in step.
 */
let client;

function s3() {
  client ??= new S3Client({
    region: env.STORAGE_REGION,
    endpoint: env.STORAGE_ENDPOINT || undefined,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    credentials: env.STORAGE_ACCESS_KEY_ID
      ? {
          accessKeyId: env.STORAGE_ACCESS_KEY_ID,
          secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
        }
      : undefined,
  });

  return client;
}

export const s3Driver = {
  name: 's3',
  supportsDirectUrl: true,

  async put({ key, body, contentType }) {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);

    const result = await s3().send(
      new PutObjectCommand({
        Bucket: env.STORAGE_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return { key, etag: result.ETag?.replaceAll('"', '') ?? null, sizeBytes: buffer.length };
  },

  async get(key) {
    try {
      const result = await s3().send(
        new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }),
      );

      return {
        body: Buffer.from(await result.Body.transformToByteArray()),
        contentType: result.ContentType,
      };
    } catch (err) {
      // A missing object is a normal answer, and every other driver returns
      // null for it. Throwing here turned the media route's clean 404 into an
      // unhandled 500, so a deleted or not-yet-uploaded image looked like the
      // server had broken.
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  },

  async remove(key) {
    await s3().send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
    return { deleted: true };
  },

  /** A presigned GET, so the browser never needs our credentials. */
  async directUrl(key, { ttlSeconds = env.STORAGE_SIGNED_URL_TTL_S } = {}) {
    return getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }),
      { expiresIn: ttlSeconds },
    );
  },
};

export default s3Driver;
