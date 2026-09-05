import crypto from 'node:crypto';

/**
 * In-process object store for local development and tests.
 *
 * Everything lives in a Map and disappears when the process does. It exists so
 * the whole generation pipeline can be exercised without an S3 or R2 account —
 * the same reason `dev:memdb` exists for the database.
 */
const objects = new Map();

export const memoryDriver = {
  name: 'memory',

  async put({ key, body, contentType }) {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const etag = crypto.createHash('md5').update(buffer).digest('hex');

    objects.set(key, { body: buffer, contentType });
    return { key, etag, sizeBytes: buffer.length };
  },

  async get(key) {
    return objects.get(key) ?? null;
  },

  async remove(key) {
    objects.delete(key);
    return { deleted: true };
  },

  /** The memory driver has no public host, so reads go through our own route. */
  supportsDirectUrl: false,

  reset() {
    objects.clear();
  },

  get size() {
    return objects.size;
  },
};

export default memoryDriver;
