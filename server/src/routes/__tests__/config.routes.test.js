import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

import { createApp, API_PREFIX } from '../../app.js';

let app;

beforeAll(() => {
  app = createApp();
});

describe('GET /config', () => {
  it('returns public config and is reachable without authentication', async () => {
    const res = await request(app).get(`${API_PREFIX}/config`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // No Google credentials are set in the test env, so the feature is off.
    expect(res.body.data).toHaveProperty('googleAuthEnabled', false);
  });

  it('never leaks a secret through the public config', async () => {
    const res = await request(app).get(`${API_PREFIX}/config`);
    const serialised = JSON.stringify(res.body).toLowerCase();

    // The response must carry only public keys, nothing secret — in particular
    // never the Google client id, secret or redirect URI (the flow is server-side).
    expect(serialised).not.toContain('secret');
    expect(serialised).not.toContain('mongodb');
    expect(serialised).not.toContain('api_key');
    expect(serialised).not.toContain('client_id');
    expect(Object.keys(res.body.data)).toEqual(['googleAuthEnabled']);
  });
});
