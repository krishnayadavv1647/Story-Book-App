import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const storage = new AsyncLocalStorage();

/** Only accept a caller-supplied id that cannot be used for log injection. */
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Establishes a per-request async context carrying the trace id. Every log line
 * and every error response is stamped with it, so a user-visible failure can be
 * traced to its server-side cause without exposing anything sensitive.
 */
export function requestContext(req, res, next) {
  const incoming = req.get('x-request-id');
  const requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  storage.run({ requestId, userId: null }, () => next());
}

export function getStore() {
  return storage.getStore();
}

export function getRequestId() {
  return storage.getStore()?.requestId;
}

export function getUserId() {
  return storage.getStore()?.userId ?? null;
}

export function setUserId(userId) {
  const store = storage.getStore();
  if (store) store.userId = userId;
}

export default requestContext;
