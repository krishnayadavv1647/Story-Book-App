/**
 * Application error carrying an HTTP status and a stable machine-readable code.
 *
 * `expose` decides whether `message` may be shown to the caller. Anything not
 * explicitly exposed is replaced with a generic message by the error handler,
 * so internal detail can never leak through an unhandled path.
 */
export class ApiError extends Error {
  constructor(statusCode, message, { code, details = null, expose = true, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code ?? defaultCodeFor(statusCode);
    this.details = details;
    this.expose = expose;
    this.isApiError = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Invalid request', options) {
    return new ApiError(400, message, { code: 'BAD_REQUEST', ...options });
  }

  static validation(details, message = 'Validation failed') {
    return new ApiError(422, message, { code: 'VALIDATION_ERROR', details });
  }

  static unauthorized(message = 'Authentication required', options) {
    return new ApiError(401, message, { code: 'UNAUTHENTICATED', ...options });
  }

  static forbidden(message = 'You do not have access to this resource', options) {
    return new ApiError(403, message, { code: 'FORBIDDEN', ...options });
  }

  static notFound(message = 'Resource not found', options) {
    return new ApiError(404, message, { code: 'NOT_FOUND', ...options });
  }

  static conflict(message = 'Conflicting request', options) {
    return new ApiError(409, message, { code: 'CONFLICT', ...options });
  }

  static tooManyRequests(message = 'Too many requests', options) {
    return new ApiError(429, message, { code: 'RATE_LIMITED', ...options });
  }

  static providerFailure(message = 'Upstream provider failed', options) {
    return new ApiError(502, message, { code: 'PROVIDER_ERROR', ...options });
  }

  static internal(message = 'Something went wrong', options) {
    return new ApiError(500, message, { code: 'INTERNAL_ERROR', expose: false, ...options });
  }
}

function defaultCodeFor(statusCode) {
  if (statusCode >= 500) return 'INTERNAL_ERROR';
  if (statusCode === 404) return 'NOT_FOUND';
  if (statusCode === 403) return 'FORBIDDEN';
  if (statusCode === 401) return 'UNAUTHENTICATED';
  return 'BAD_REQUEST';
}

export default ApiError;
