import mongoose from 'mongoose';
import { env, isProduction } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);
// Index building is explicit in production — a deploy must not silently rebuild.
mongoose.set('autoIndex', !isProduction);

let connectionPromise = null;

/**
 * The host and port of a MongoDB URI, with any credentials removed.
 *
 * Saying *where* the connection was refused is the single most useful thing in
 * the message, but the URI itself carries a username and password, so only the
 * address is ever logged.
 */
export function describeTarget(uri) {
  try {
    const parsed = new URL(uri);
    return parsed.host || '(unknown host)';
  } catch {
    return '(unparseable MONGODB_URI)';
  }
}

/**
 * Mongoose's selection error carries the whole topology description — dozens of
 * fields of internal state that bury the one fact that matters. Reduce it to
 * what a reader can act on.
 */
function explainConnectionFailure(err, uri) {
  const target = describeTarget(uri);
  const refused =
    err?.name === 'MongooseServerSelectionError' && /ECONNREFUSED/.test(err.message ?? '');

  if (refused) {
    return {
      target,
      hint:
        'Nothing is listening there. Start MongoDB, or for local development ' +
        'without installing it run `npm run dev:memdb` (or `npm run dev:stub` ' +
        'to include stand-ins for the AI providers).',
    };
  }

  return { target, hint: err?.message ?? 'Connection failed.' };
}

export async function connectDatabase(uri = env.MONGODB_URI) {
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose
    .connect(uri, {
      dbName: env.MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 20,
      minPoolSize: 2,
    })
    .then((m) => {
      logger.info({ dbName: env.MONGODB_DB_NAME }, 'MongoDB connected');
      return m;
    })
    .catch((err) => {
      connectionPromise = null;
      // Log the address and what to do about it, never the URI — it carries
      // credentials — and never the raw topology dump.
      const { target, hint } = explainConnectionFailure(err, uri);
      logger.error({ target, code: err?.name }, `Could not reach MongoDB at ${target}. ${hint}`);
      throw err;
    });

  return connectionPromise;
}

export async function disconnectDatabase() {
  connectionPromise = null;
  await mongoose.disconnect();
}

/** 1 = connected. Used by the readiness probe. */
export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Runs `fn` inside a transaction when the deployment supports one (replica set),
 * and falls back to a plain call on a standalone server so development works.
 * Job state transitions use this.
 */
export async function withTransaction(fn) {
  let session;
  try {
    session = await mongoose.startSession();
  } catch {
    return fn(null);
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    // Standalone servers reject transactions outright; degrade rather than fail.
    if (err?.code === 20 || /Transaction numbers are only allowed/i.test(err?.message ?? '')) {
      logger.warn('Transactions unavailable (standalone MongoDB) — running unwrapped');
      return fn(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

export default { connectDatabase, disconnectDatabase, isDatabaseConnected, withTransaction };
