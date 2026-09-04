import { Router } from 'express';
import { isDatabaseConnected } from '../config/db.js';
import { sendSuccess, buildErrorBody } from '../utils/apiResponse.js';

const router = Router();

/**
 * Liveness. Answers "is the process up and serving?" and nothing more.
 * Deliberately exposes no version, no environment, no dependency detail — this
 * endpoint is typically reachable without authentication.
 */
router.get('/health', (_req, res) =>
  sendSuccess(res, {
    data: { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) },
    message: 'Service is live',
  }),
);

/**
 * Readiness. 200 only when every hard dependency is usable; 503 otherwise, so a
 * load balancer stops sending traffic. Reports booleans, never connection
 * strings, hostnames or credentials.
 */
router.get('/ready', (_req, res) => {
  const checks = { database: isDatabaseConnected() };
  const ready = Object.values(checks).every(Boolean);

  if (!ready) {
    return res.status(503).json(
      buildErrorBody({
        message: 'Service is not ready',
        code: 'NOT_READY',
        details: { checks },
      }),
    );
  }

  return sendSuccess(res, { data: { status: 'ready', checks }, message: 'Service is ready' });
});

export default router;
