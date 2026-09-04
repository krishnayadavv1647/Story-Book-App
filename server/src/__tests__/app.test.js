import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, API_PREFIX } from '../app.js';

let app;

beforeAll(() => {
  app = createApp();
});

/** Every field of the envelope, on every response, without exception. */
function expectEnvelope(body) {
  expect(body).toHaveProperty('success');
  expect(body).toHaveProperty('data');
  expect(body).toHaveProperty('message');
  expect(body).toHaveProperty('meta');
  expect(body).toHaveProperty('error');
  expect(body.meta).toHaveProperty('requestId');
  expect(typeof body.meta.requestId).toBe('string');
}

describe('response envelope', () => {
  it('wraps a success response and stamps a request id', async () => {
    const res = await request(app).get(`${API_PREFIX}/health`);

    expect(res.status).toBe(200);
    expectEnvelope(res.body);
    expect(res.body.success).toBe(true);
    expect(res.body.error).toBeNull();
    expect(res.headers['x-request-id']).toBe(res.body.meta.requestId);
  });

  it('wraps a failure response in the same shape', async () => {
    const res = await request(app).get(`${API_PREFIX}/does-not-exist`);

    expect(res.status).toBe(404);
    expectEnvelope(res.body);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('echoes a caller-supplied request id when it is safe', async () => {
    const id = 'trace-abc-123456';
    const res = await request(app).get(`${API_PREFIX}/health`).set('X-Request-Id', id);

    expect(res.body.meta.requestId).toBe(id);
  });

  // Node's HTTP client refuses to transmit a header containing a raw newline, so
  // the realistic attack is a value that is valid HTTP but still unsafe to trust.
  it.each([
    ['spaces and an assignment', 'bad id INJECTED=1'],
    ['a percent-encoded newline', 'trace%0aINJECTED=1'],
    ['path traversal', '../../etc/passwd'],
    ['an over-long value', 'a'.repeat(200)],
    ['an empty value', ''],
  ])('replaces an unsafe caller request id (%s)', async (_label, value) => {
    const res = await request(app).get(`${API_PREFIX}/health`).set('X-Request-Id', value);

    expect(res.body.meta.requestId).not.toBe(value);
    expect(res.body.meta.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('returns the envelope for a malformed JSON body rather than an Express HTML page', async () => {
    const res = await request(app)
      .post(`${API_PREFIX}/health`)
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expectEnvelope(res.body);
    expect(res.body.success).toBe(false);
  });
});

describe('health and readiness probes', () => {
  it('reports liveness without leaking environment detail', async () => {
    const res = await request(app).get(`${API_PREFIX}/health`);
    const serialised = JSON.stringify(res.body);

    expect(res.body.data.status).toBe('ok');
    expect(typeof res.body.data.uptimeSeconds).toBe('number');

    for (const leak of ['mongodb://', 'password', 'secret', 'apiKey', 'NODE_ENV', 'JWT']) {
      expect(serialised).not.toContain(leak);
    }
  });

  it('reports 503 from readiness while the database is not connected', async () => {
    const res = await request(app).get(`${API_PREFIX}/ready`);

    // No database is connected in this suite, so readiness must refuse traffic.
    expect(res.status).toBe(503);
    expectEnvelope(res.body);
    expect(res.body.error.code).toBe('NOT_READY');
    expect(res.body.error.details.checks.database).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('mongodb://');
  });
});

describe('security headers', () => {
  it('removes the framework fingerprint and sets baseline headers', async () => {
    const res = await request(app).get(`${API_PREFIX}/health`);

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('withholds CORS headers from an origin outside the allowlist', async () => {
    const res = await request(app)
      .get(`${API_PREFIX}/health`)
      .set('Origin', 'https://not-our-app.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    // A rejected origin is a policy decision, not a server fault — it must not
    // surface as a 500 or pollute the error logs.
    expect(res.status).toBe(200);
  });

  it('allows the configured client origin with credentials', async () => {
    const res = await request(app)
      .get(`${API_PREFIX}/health`)
      .set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
