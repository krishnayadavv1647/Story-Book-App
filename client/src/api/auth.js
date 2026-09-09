import { api, apiRequest, setAccessToken } from './client.js';

/**
 * Auth endpoints. Each one that returns a session also installs the access
 * token, so no caller has to remember to do it.
 */

function adopt(payload) {
  setAccessToken(payload.accessToken);
  return { user: payload.user };
}

/**
 * Creates the account. No session comes back: the reply says an address needs
 * proving, and `verifyLoginCode` is what turns the emailed code into a session.
 */
export async function register(body) {
  return api.post('/auth/register', body);
}

export async function login(body) {
  return adopt(await api.post('/auth/login', body));
}

/**
 * Silent boot. A 401 here just means "not signed in" — it is the expected answer
 * for a first-time visitor, not an error worth surfacing.
 */
export async function restoreSession() {
  const payload = await apiRequest('/auth/refresh', {
    method: 'POST',
    retryOnUnauthorized: false,
  });
  return adopt(payload);
}

export async function fetchSession() {
  return api.get('/auth/session');
}

export async function logout() {
  try {
    await apiRequest('/auth/logout', { method: 'POST', retryOnUnauthorized: false });
  } finally {
    // The local session ends whether or not the server acknowledged it.
    setAccessToken(null);
  }
}

/**
 * Ask for a one-time sign-in code. Creates the account if the address is new,
 * which is how signing up with a code works — there is no separate register
 * call. The reply is deliberately identical either way.
 */
export async function requestLoginCode(body) {
  return api.post('/auth/otp/request', body);
}

export async function verifyLoginCode(body) {
  return adopt(await api.post('/auth/otp/verify', body));
}

export async function forgotPassword(body) {
  return api.post('/auth/forgot-password', body);
}

export async function resetPassword(body) {
  return api.post('/auth/reset-password', body);
}

export default {
  register,
  login,
  restoreSession,
  fetchSession,
  logout,
  forgotPassword,
  resetPassword,
  requestLoginCode,
  verifyLoginCode,
};
