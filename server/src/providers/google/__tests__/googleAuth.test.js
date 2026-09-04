import { describe, it, expect } from 'vitest';

import {
  buildAuthUrl,
  exchangeCodeForProfile,
  getRedirectUri,
  isGoogleAuthConfigured,
} from '../googleAuth.js';

/**
 * The test environment sets no Google client id/secret (see vitest.config.js),
 * so this exercises the "not configured" guard without any network call:
 * building a consent URL or exchanging a code must refuse before reaching
 * Google. The happy path — a real code exchange — is covered end to end in the
 * auth HTTP tests with the provider mocked, since it cannot run offline.
 */
describe('googleAuth (unconfigured)', () => {
  it('reports that Google sign-in is off', () => {
    expect(isGoogleAuthConfigured()).toBe(false);
  });

  it('derives a callback redirect URI from the server public URL', () => {
    expect(getRedirectUri()).toMatch(/\/api\/v1\/auth\/google\/callback$/);
  });

  it('refuses to build a consent URL when unconfigured', () => {
    expect(() => buildAuthUrl({ state: 'x' })).toThrowError(
      expect.objectContaining({ statusCode: 400, code: 'GOOGLE_NOT_CONFIGURED' }),
    );
  });

  it('refuses to exchange a code when unconfigured', async () => {
    await expect(exchangeCodeForProfile('some-code')).rejects.toMatchObject({
      statusCode: 400,
      code: 'GOOGLE_NOT_CONFIGURED',
    });
  });
});
