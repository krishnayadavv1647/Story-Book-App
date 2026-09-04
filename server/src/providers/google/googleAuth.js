import { OAuth2Client } from 'google-auth-library';

import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Google sign-in via the server-side Authorization Code flow.
 *
 * The browser is sent to Google, consents, and is returned to our callback with
 * a one-time `code`. We exchange that code for tokens using the client id AND
 * the client **secret** (so the exchange can only be done by this server), then
 * verify the returned ID token. All three values — client id, client secret and
 * redirect URI — live only in the server environment; the browser never sees
 * the secret and never handles a token itself.
 *
 * `google-auth-library` does the security-critical work: building the consent
 * URL, exchanging the code, and verifying the ID token's signature, issuer,
 * audience and expiry.
 */

const SCOPES = ['openid', 'email', 'profile'];

let client;

/** The URL Google returns to. Defaults to this server's own callback path. */
export function getRedirectUri() {
  return env.GOOGLE_REDIRECT_URI || `${env.SERVER_PUBLIC_URL}/api/v1/auth/google/callback`;
}

function getClient() {
  if (!isGoogleAuthConfigured()) return null;
  client ??= new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: getRedirectUri(),
  });
  return client;
}

/** Enabled only when both the id and the secret are configured. */
export function isGoogleAuthConfigured() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function requireClient() {
  const oauth = getClient();
  if (!oauth) {
    throw ApiError.badRequest('Google sign-in is not configured on this server', {
      code: 'GOOGLE_NOT_CONFIGURED',
    });
  }
  return oauth;
}

/**
 * The Google consent URL to redirect the browser to. `state` is round-tripped
 * back to the callback and checked there, which is what defends the flow
 * against CSRF. `select_account` always lets the user pick which Google account.
 */
export function buildAuthUrl({ state }) {
  return requireClient().generateAuthUrl({
    access_type: 'online',
    scope: SCOPES,
    state,
    prompt: 'select_account',
    include_granted_scopes: true,
  });
}

/**
 * Exchanges the one-time authorization code for the signed-in user's profile.
 * Throws a 401 for any code or token that does not verify — the caller must
 * never learn why.
 */
export async function exchangeCodeForProfile(code) {
  const oauth = requireClient();

  let payload;
  try {
    const { tokens } = await oauth.getToken(code);
    const ticket = await oauth.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthorized('Could not verify your Google sign-in');
  }

  if (!payload?.sub) {
    throw ApiError.unauthorized('Could not verify your Google sign-in');
  }

  return {
    sub: payload.sub,
    email: payload.email ? String(payload.email).toLowerCase() : null,
    emailVerified: Boolean(payload.email_verified),
    // Google may omit the display name; fall back to the local part of the
    // email so a new account always has something to show.
    name: payload.name || payload.email?.split('@')[0] || 'Reader',
    picture: payload.picture ?? null,
  };
}

export default { isGoogleAuthConfigured, getRedirectUri, buildAuthUrl, exchangeCodeForProfile };
