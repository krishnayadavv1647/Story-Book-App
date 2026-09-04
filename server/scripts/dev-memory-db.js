import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Runs the API against a throwaway in-memory MongoDB.
 *
 * For local work before a real database is provisioned: `npm run dev:memdb`.
 * Data is discarded on exit, and the generated secrets are random per run, so
 * every restart starts from an empty database and invalidates old sessions.
 *
 * Never use this for anything but local development.
 */
const mongod = await MongoMemoryServer.create();

process.env.MONGODB_URI = mongod.getUri();
process.env.MONGODB_DB_NAME = 'storybook_dev';
process.env.NODE_ENV ??= 'development';

// Load the same .env files the app would, before filling any gaps. Without
// this, the generated secrets below would land in process.env first and dotenv
// — which never overwrites — would leave a configured secret unused, so every
// restart invalidated sessions even when a real one was set.
const here = path.dirname(fileURLToPath(import.meta.url));
for (const file of [path.resolve(here, '../.env'), path.resolve(here, '../../.env')]) {
  if (existsSync(file)) dotenv.config({ path: file });
}

// The env schema allows empty secrets outside production, but signing a JWT
// with an empty key throws — so supply real ones for whatever is still missing.
for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'COOKIE_SECRET']) {
  if (!process.env[key]) {
    process.env[key] = crypto.randomBytes(32).toString('hex');
    // eslint-disable-next-line no-console
    console.log(`${key} not configured — generated one for this run only.`);
  }
}

process.on('exit', () => mongod.stop());
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await mongod.stop();
    process.exit(0);
  });
}

// eslint-disable-next-line no-console
console.log('In-memory MongoDB started — data will be discarded on exit.');

await import('../src/index.js');
