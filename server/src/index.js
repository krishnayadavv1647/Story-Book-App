import { createApp } from './app.js';
import { env, isProduction, ENV_FILES_LOADED } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { syncIndexes } from './models/index.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'HTTP server listening');
});

// Say which file the configuration came from — or that none was found, which is
// otherwise indistinguishable from a file full of defaults.
if (ENV_FILES_LOADED.length === 0) {
  logger.warn(
    'No .env file found (looked in server/ and the repository root) — every setting is a default',
  );
} else {
  logger.info({ files: ENV_FILES_LOADED.length }, 'Environment loaded');
}

/**
 * A port clash is the most common way to fail to start in development, and a
 * raw stack trace does not say what to do about it. Say what happened, and how
 * to fix it, then exit quietly — the uncaughtException handler below would
 * otherwise print an unreadable dump for something entirely ordinary.
 */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.fatal(
      { port: env.PORT },
      `Port ${env.PORT} is already in use — another server is running. ` +
        `Stop it, or start this one with a different port: PORT=5001 npm run dev`,
    );
    process.exit(1);
  }

  logger.fatal({ err }, 'HTTP server failed to start');
  process.exit(1);
});

/**
 * The server starts serving before the database is up. /health answers straight
 * away while /ready keeps reporting 503 until the connection lands, which is
 * what lets an orchestrator distinguish "still starting" from "broken".
 */
connectDatabase()
  .then(async () => {
    if (isProduction) {
      const built = await syncIndexes();
      logger.info({ models: built.length }, 'Indexes synchronised');
    }
  })
  .catch(() => {
    // `connectDatabase` has already explained what failed and what to do; this
    // only adds what it means for the process that is now running.
    logger.error('Startup database connection failed — the API is up but /ready reports 503');
  });

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  const forced = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
  forced.unref();

  server.close(async () => {
    try {
      await disconnectDatabase();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — exiting');
  process.exit(1);
});

export { app, server };
