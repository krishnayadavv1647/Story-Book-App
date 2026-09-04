import pino from 'pino';
import { env, isProduction } from './env.js';
import { getRequestId } from '../middleware/requestContext.js';

/**
 * Redaction is deliberately broad. Anything that could carry a credential, a
 * token, a raw prompt or user PII is censored before it can reach a log sink.
 */
const redact = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    'req.headers["x-kie-signature"]',
    'res.headers["set-cookie"]',
    '*.password',
    '*.passwordHash',
    '*.token',
    '*.accessToken',
    '*.refreshToken',
    '*.apiKey',
    '*.secret',
    '*.callbackSecret',
    '*.authorization',
    'body.password',
    'body.email',
    'apiKey',
    'secret',
    'password',
  ],
  censor: '[REDACTED]',
};

export const logger = pino({
  level: env.LOG_LEVEL,
  redact,
  base: { service: 'storybook-studio-server' },
  formatters: {
    level: (label) => ({ level: label }),
  },
  mixin() {
    const requestId = getRequestId();
    return requestId ? { requestId } : {};
  },
  transport: isProduction
    ? undefined
    : { target: 'pino/file', options: { destination: 1 } },
});

export default logger;
