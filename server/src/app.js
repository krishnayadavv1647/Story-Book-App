import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';

import { env, isProduction, isTest } from './config/env.js';
import { logger } from './config/logger.js';
import { requestContext } from './middleware/requestContext.js';
import { defaultLimiter } from './middleware/rateLimit.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';

export const API_PREFIX = '/api/v1';

export function createApp() {
  const app = express();

  // Behind a proxy/load balancer, req.ip must come from X-Forwarded-For or the
  // per-IP rate limiters would all key on the proxy's address.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; a restrictive default CSP is correct here.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  // Strict allowlist. `credentials: true` is what lets the refresh cookie work,
  // and it is exactly why a wildcard origin must never be used here.
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true); // same-origin / server-to-server
        // A disallowed origin resolves to `false`, not an error: the response
        // simply carries no CORS headers and the browser blocks it. Throwing
        // here would turn a routine policy decision into a logged 500.
        return callback(null, env.CLIENT_ORIGIN.includes(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );

  app.use(requestContext);

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => req.requestId,
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      }),
    );
  }

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser(env.COOKIE_SECRET || undefined));

  app.use(API_PREFIX, defaultLimiter, apiRoutes);

  // A friendly root so platform health checks and uptime probes hitting `/`
  // get a 200 instead of a logged 404. This is a JSON API — everything real
  // lives under `/api/v1`. Express answers HEAD `/` with this handler too.
  app.get('/', (_req, res) =>
    res.json({ name: 'StoryBook Studio API', status: 'ok', api: `${API_PREFIX}/health` }),
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
