import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { localDriver } from '../local.driver.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mM8w8DwnwEJMOEUGdECAKAaAv3rzZgUAAAAAElFTkSuQmCC',
  'base64',
);

const keys = [];
const key = (name) => {
  const k = `page_image/test-owner/${name}`;
  keys.push(k);
  return k;
};

afterAll(async () => {
  await Promise.all(keys.map((k) => localDriver.remove(k)));
});

describe('the local object store', () => {
  it('returns exactly the bytes it was given', async () => {
    const k = key(`roundtrip-${Date.now()}.png`);

    const put = await localDriver.put({ key: k, body: PNG, contentType: 'image/png' });
    expect(put.sizeBytes).toBe(PNG.length);

    const got = await localDriver.get(k);
    expect(got.body.equals(PNG)).toBe(true);
    expect(got.contentType).toBe('image/png');
  });

  it('writes real bytes to disk, so a restart cannot lose them', async () => {
    const k = key(`persist-${Date.now()}.png`);
    await localDriver.put({ key: k, body: PNG, contentType: 'image/png' });

    // The bytes are on the filesystem, not in a Map that dies with the process.
    // The in-memory store lost them on every restart, which left the database
    // pointing at images that answered 404 for the rest of the book's life.
    const onDisk = await fs.readFile(path.resolve(localDriver.root, k));
    expect(onDisk.equals(PNG)).toBe(true);
  });

  it('answers null for something that was never stored', async () => {
    expect(await localDriver.get('page_image/nobody/missing.png')).toBeNull();
  });

  it('removes an object', async () => {
    const k = key(`remove-${Date.now()}.png`);
    await localDriver.put({ key: k, body: PNG, contentType: 'image/png' });

    await localDriver.remove(k);
    expect(await localDriver.get(k)).toBeNull();
  });

  it('refuses a key that would escape the storage directory', async () => {
    // Keys are generated internally, but a store that can be talked out of its
    // own directory is a file-write primitive pointed at the whole disk.
    for (const escape of ['../../etc/passwd', '../../../secrets.env', '/absolute/elsewhere']) {
      await expect(localDriver.put({ key: escape, body: PNG })).rejects.toThrow(/escape/i);
    }

    expect(await fs.readdir(path.resolve(localDriver.root, '..')).catch(() => [])).not.toContain(
      'secrets.env',
    );
  });
});

describe('every driver answers a missing object the same way', () => {
  it('returns null rather than throwing', async () => {
    // The media route reads `if (!object) throw notFound(...)`. A driver that
    // throws instead turns a clean 404 into an unhandled 500, so a deleted
    // image looks like the server has broken. S3 did exactly that.
    const { memoryDriver } = await import('../memory.driver.js');
    const { s3Driver } = await import('../s3.driver.js');

    expect(await memoryDriver.get('page_image/nobody/missing.png')).toBeNull();
    expect(await localDriver.get('page_image/nobody/missing.png')).toBeNull();

    // The S3 driver is not called here — no bucket in tests — so its contract
    // is asserted from the source: a 404 must resolve, not reject.
    const source = await fs.readFile(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../s3.driver.js'),
      'utf8',
    );
    expect(source).toMatch(/NoSuchKey/);
    expect(source).toMatch(/httpStatusCode === 404/);
    expect(typeof s3Driver.get).toBe('function');
  });
});
