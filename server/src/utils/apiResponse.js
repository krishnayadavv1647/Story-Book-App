import { getRequestId } from '../middleware/requestContext.js';

/**
 * Every response on /api/v1 — success or failure — uses this envelope:
 *   { success, data, message, meta, error }
 */
export function sendSuccess(res, { data = null, message = 'OK', meta = {}, status = 200 } = {}) {
  return res.status(status).json({
    success: true,
    data,
    message,
    meta: { requestId: getRequestId() ?? null, ...meta },
    error: null,
  });
}

export function sendCreated(res, options = {}) {
  return sendSuccess(res, { status: 201, message: 'Created', ...options });
}

export function sendPaginated(res, { items, page, limit, total, message = 'OK', meta = {} }) {
  return sendSuccess(res, {
    data: items,
    message,
    meta: {
      ...meta,
      pagination: {
        page,
        limit,
        total,
        totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
        hasNext: page * limit < total,
      },
    },
  });
}

export function buildErrorBody({ message, code, details = null, meta = {} }) {
  return {
    success: false,
    data: null,
    message,
    meta: { requestId: getRequestId() ?? null, ...meta },
    error: { code, details },
  };
}

export default { sendSuccess, sendCreated, sendPaginated, buildErrorBody };
