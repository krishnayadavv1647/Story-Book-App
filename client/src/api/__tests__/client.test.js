import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, apiRequest, ApiClientError, setAccessToken, getAccessToken } from '../client.js';

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key) => headers[key.toLowerCase()] ?? null },
    json: async () => body,
  };
}

const envelope = (data, extra = {}) => ({
  success: true,
  data,
  message: 'OK',
  meta: { requestId: 'req-1' },
  error: null,
  ...extra,
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  setAccessToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('envelope handling', () => {
  it('unwraps data so callers never see the envelope', async () => {
    fetch.mockResolvedValue(jsonResponse(envelope({ id: 'book-1', title: 'Little Moon Keeper' })));

    await expect(api.get('/books/book-1')).resolves.toEqual({
      id: 'book-1',
      title: 'Little Moon Keeper',
    });
  });

  it('returns items and pagination for a list endpoint', async () => {
    fetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: [{ id: 'a' }, { id: 'b' }],
        message: 'OK',
        meta: { requestId: 'req-2', pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } },
        error: null,
      }),
    );

    const { items, pagination } = await api.list('/books');

    expect(items).toHaveLength(2);
    expect(pagination.total).toBe(2);
  });

  it('returns null for a 204 without trying to parse a body', async () => {
    fetch.mockResolvedValue({ ok: true, status: 204, headers: { get: () => null } });

    await expect(api.delete('/books/book-1')).resolves.toBeNull();
  });
});

describe('error handling', () => {
  it('turns a failure envelope into an ApiClientError carrying code and trace id', async () => {
    fetch.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          data: null,
          message: 'That is not allowed',
          meta: { requestId: 'req-3' },
          error: { code: 'INSUFFICIENT_CREDITS', details: { required: 10, available: 2 } },
        },
        { status: 402 },
      ),
    );

    const error = await api.post('/generation/book', {}).catch((e) => e);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error.code).toBe('INSUFFICIENT_CREDITS');
    expect(error.status).toBe(402);
    expect(error.requestId).toBe('req-3');
    expect(error.details).toEqual({ required: 10, available: 2 });
  });

  it('flags an auth failure so the caller can end the session', async () => {
    fetch.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          data: null,
          message: 'Session expired',
          meta: { requestId: 'req-4' },
          error: { code: 'TOKEN_EXPIRED', details: null },
        },
        { status: 401 },
      ),
    );

    const error = await api.get('/books', { retryOnUnauthorized: false }).catch((e) => e);

    expect(error.isAuthError).toBe(true);
  });

  it('maps validation issues onto form fields', async () => {
    fetch.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          data: null,
          message: 'Validation failed',
          meta: { requestId: 'req-5' },
          error: {
            code: 'VALIDATION_ERROR',
            details: [
              { path: 'body.title', message: 'Title is required', code: 'too_small' },
              { path: 'body.pageCount', message: 'Must be at least 1', code: 'too_small' },
            ],
          },
        },
        { status: 422 },
      ),
    );

    const error = await api.post('/books', {}).catch((e) => e);

    expect(error.isValidationError).toBe(true);
    expect(error.fieldErrors).toEqual({
      title: 'Title is required',
      pageCount: 'Must be at least 1',
    });
  });

  it('reports a network failure without leaking the underlying exception', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await api.get('/books').catch((e) => e);

    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).toMatch(/could not reach the server/i);
  });

  it('propagates an abort rather than disguising it as a network error', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetch.mockRejectedValue(abortError);

    await expect(api.get('/books')).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('access token and silent refresh', () => {
  const unauthorized = () =>
    jsonResponse(
      {
        success: false,
        data: null,
        message: 'Session expired',
        meta: {},
        error: { code: 'TOKEN_EXPIRED', details: null },
      },
      { status: 401 },
    );

  it('attaches the access token once one is held, and nothing before that', async () => {
    fetch.mockResolvedValue(jsonResponse(envelope(null)));

    await api.get('/books');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();

    setAccessToken('token-1');
    await api.get('/books');
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer token-1');
  });

  it('refreshes once and retries the original request', async () => {
    setAccessToken('expired-token');
    fetch
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(jsonResponse(envelope({ accessToken: 'token-2' })))
      .mockResolvedValueOnce(jsonResponse(envelope({ id: 'book-1' })));

    await expect(api.get('/books')).resolves.toEqual({ id: 'book-1' });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[1][0]).toContain('/auth/refresh');
    expect(getAccessToken()).toBe('token-2');
    // The retry carries the new token, not the stale one.
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer token-2');
  });

  it('shares one refresh across concurrent failures instead of rotating twice', async () => {
    setAccessToken('expired-token');
    fetch.mockImplementation(async (url) => {
      if (String(url).includes('/auth/refresh')) {
        return jsonResponse(envelope({ accessToken: 'token-2' }));
      }
      return getAccessToken() === 'token-2'
        ? jsonResponse(envelope({ ok: true }))
        : unauthorized();
    });

    await Promise.all([api.get('/books'), api.get('/characters'), api.get('/exports')]);

    const refreshCalls = fetch.mock.calls.filter(([url]) => String(url).includes('/auth/refresh'));
    // More than one would rotate the refresh token repeatedly and trip the
    // server's reuse detection, signing the user out.
    expect(refreshCalls).toHaveLength(1);
  });

  it('gives up when the refresh itself fails, and drops the token', async () => {
    setAccessToken('expired-token');
    fetch.mockResolvedValue(unauthorized());

    await expect(api.get('/books')).rejects.toBeInstanceOf(ApiClientError);
    expect(getAccessToken()).toBeNull();
  });

  it('never tries to refresh an auth endpoint', async () => {
    setAccessToken('expired-token');
    fetch.mockResolvedValue(unauthorized());

    await expect(api.post('/auth/login', {})).rejects.toBeInstanceOf(ApiClientError);

    // A rejected sign-in must not trigger a refresh loop.
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('request construction', () => {
  it('sends credentials so the refresh cookie travels with every call', async () => {
    fetch.mockResolvedValue(jsonResponse(envelope(null)));

    await api.get('/auth/session');

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('attaches an idempotency key only when one is supplied', async () => {
    fetch.mockResolvedValue(jsonResponse(envelope(null)));

    await apiRequest('/generation/book', { method: 'POST', body: {}, idempotencyKey: 'key-1' });
    expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe('key-1');

    await apiRequest('/books', { method: 'POST', body: {} });
    expect(fetch.mock.calls[1][1].headers['Idempotency-Key']).toBeUndefined();
  });

  it('drops empty query values instead of sending blank filters', async () => {
    fetch.mockResolvedValue(jsonResponse(envelope([])));

    await api.get('/books', { query: { status: 'ready', search: '', page: 2, tag: undefined } });

    const url = fetch.mock.calls[0][0];
    expect(url).toContain('status=ready');
    expect(url).toContain('page=2');
    expect(url).not.toContain('search=');
    expect(url).not.toContain('tag=');
  });
});
