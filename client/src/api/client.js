/**
 * The only place the browser talks to the API.
 *
 * Token handling: the short-lived access token is held in a module variable, not
 * in localStorage — anything readable by page scripts is readable by an injected
 * one. The long-lived refresh token never reaches JavaScript at all; it lives in
 * an httpOnly cookie scoped to /api/v1/auth.
 *
 * Every response uses the { success, data, message, meta, error } envelope, so
 * this unwraps it once and hands callers plain data.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

let accessToken = null;

export function setAccessToken(token) {
  accessToken = token ?? null;
}

export function getAccessToken() {
  return accessToken;
}

export class ApiClientError extends Error {
  constructor({ message, code, details, status, requestId }) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code ?? 'UNKNOWN';
    this.details = details ?? null;
    this.status = status ?? 0;
    this.requestId = requestId ?? null;
  }

  get isAuthError() {
    return this.status === 401 || this.code === 'TOKEN_EXPIRED';
  }

  get isValidationError() {
    return this.code === 'VALIDATION_ERROR';
  }

  /** Field path -> first message, for binding server errors onto a form. */
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    return this.details.reduce((acc, issue) => {
      const key = String(issue.path ?? '').replace(/^body\./, '');
      if (key && !acc[key]) acc[key] = issue.message;
      return acc;
    }, {});
  }
}

function buildUrl(path, query) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v));
    else url.searchParams.set(key, value);
  }
  return url.toString();
}

/** One fetch, one envelope unwrap. No retry logic lives here. */
async function performRequest(
  path,
  { method, body, query, signal, idempotencyKey, headers, isMultipart },
) {
  const requestHeaders = { Accept: 'application/json', ...headers };
  // A multipart body carries its own boundary. Setting Content-Type by hand
  // drops it and the server cannot parse the request at all.
  if (body !== undefined && !isMultipart) requestHeaders['Content-Type'] = 'application/json';
  if (accessToken) requestHeaders.Authorization = `Bearer ${accessToken}`;
  // Sent on generation-sensitive mutations so a retry cannot
  // produce a second charge or a second job.
  if (idempotencyKey) requestHeaders['Idempotency-Key'] = idempotencyKey;

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: requestHeaders,
      // The refresh cookie has to travel with the request.
      credentials: 'include',
      body: body === undefined ? undefined : isMultipart ? body : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    throw new ApiClientError({
      message: 'Could not reach the server. Check your connection and try again.',
      code: 'NETWORK_ERROR',
      status: 0,
    });
  }

  const requestId = response.headers.get('x-request-id');
  if (response.status === 204) return { data: null, meta: null };

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiClientError({
      message: 'The server returned an unreadable response.',
      code: 'BAD_RESPONSE',
      status: response.status,
      requestId,
    });
  }

  if (!response.ok || payload?.success === false) {
    throw new ApiClientError({
      message: payload?.message ?? 'Request failed',
      code: payload?.error?.code,
      details: payload?.error?.details,
      status: response.status,
      requestId: payload?.meta?.requestId ?? requestId,
    });
  }

  return { data: payload.data, meta: payload.meta ?? null };
}

/**
 * Single-flight refresh: several requests failing at once share one refresh call
 * rather than each firing their own, which would rotate the token repeatedly and
 * trip the server's reuse detection.
 */
let refreshInFlight = null;

async function refreshAccessToken() {
  refreshInFlight ??= performRequest('/auth/refresh', { method: 'POST' })
    .then(({ data }) => {
      setAccessToken(data.accessToken);
      return data;
    })
    .catch((err) => {
      setAccessToken(null);
      throw err;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

export async function apiRequest(path, options = {}) {
  const { method = 'GET', retryOnUnauthorized = true, ...rest } = options;

  try {
    const { data } = await performRequest(path, { method, ...rest });
    return data;
  } catch (err) {
    const isAuthEndpoint = path.startsWith('/auth/');
    if (!(err instanceof ApiClientError) || !err.isAuthError || !retryOnUnauthorized || isAuthEndpoint) {
      throw err;
    }

    // One silent refresh, then one retry. If that fails the session is over.
    await refreshAccessToken();
    const { data } = await performRequest(path, { method, ...rest });
    return data;
  }
}

/** Returns `{ items, pagination }` for list endpoints. */
export async function apiList(path, options = {}) {
  const { method = 'GET', retryOnUnauthorized = true, ...rest } = options;

  const run = () => performRequest(path, { method, ...rest });

  let result;
  try {
    result = await run();
  } catch (err) {
    if (!(err instanceof ApiClientError) || !err.isAuthError || !retryOnUnauthorized) throw err;
    await refreshAccessToken();
    result = await run();
  }

  return { items: result.data ?? [], pagination: result.meta?.pagination ?? null };
}

export const api = {
  get: (path, options) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options) => apiRequest(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => apiRequest(path, { ...options, method: 'PATCH', body }),
  put: (path, body, options) => apiRequest(path, { ...options, method: 'PUT', body }),
  delete: (path, options) => apiRequest(path, { ...options, method: 'DELETE' }),
  list: apiList,
  refresh: refreshAccessToken,
};

export default api;
