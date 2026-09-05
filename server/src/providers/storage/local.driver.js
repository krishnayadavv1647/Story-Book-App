import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../../config/env.js';

/**
 * Object storage on the local disk, for development without a bucket.
 *
 * It exists because the in-memory driver loses everything on restart while the
 * `MediaAsset` rows survive in the database. The result was a library full of
 * books whose illustrations answered 404 — the record said the image was there
 * and the bytes were gone. Writing to disk keeps the two in step across a
 * restart, which is what anyone actually expects from "saved".
 *
 * Not for production: a single machine's disk is not durable storage, and
 * `selectDriver` still prefers S3/R2 whenever a bucket is configured.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(env.STORAGE_LOCAL_DIR || path.join(here, '../../../.storage'));

/**
 * Keys come from `buildKey` and are of the form `kind/ownerId/uuid.ext`. They
 * are resolved under ROOT and checked, so a crafted key can never escape it.
 */
function resolveKey(key) {
  const full = path.resolve(ROOT, key);
  const root = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;

  if (full !== ROOT && !full.startsWith(root)) {
    throw new Error('Refusing a storage key that escapes the storage directory');
  }
  return full;
}

const META = (file) => `${file}.meta.json`;

export const localDriver = {
  name: 'local',

  async put({ key, body, contentType }) {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const file = resolveKey(key);

    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buffer);
    // The content type travels beside the bytes; the database also records it,
    // but the store should be readable on its own.
    await fs.writeFile(META(file), JSON.stringify({ contentType }), 'utf8');

    return {
      key,
      etag: crypto.createHash('md5').update(buffer).digest('hex'),
      sizeBytes: buffer.length,
    };
  },

  async get(key) {
    const file = resolveKey(key);

    try {
      const [body, meta] = await Promise.all([
        fs.readFile(file),
        fs.readFile(META(file), 'utf8').catch(() => '{}'),
      ]);

      return { body, contentType: JSON.parse(meta).contentType ?? null };
    } catch (err) {
      // A missing object is a normal answer, not a failure.
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  },

  async remove(key) {
    const file = resolveKey(key);
    await fs.rm(file, { force: true });
    await fs.rm(META(file), { force: true });
    return { deleted: true };
  },

  /** No public host, so reads go through our own signed media route. */
  supportsDirectUrl: false,

  /** Used by tests and tooling; never by a request path. */
  createReadStream: (key) => createReadStream(resolveKey(key)),

  get root() {
    return ROOT;
  },
};

export default localDriver;
