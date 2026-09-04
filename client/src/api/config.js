import { apiRequest } from './client.js';

/**
 * Public runtime configuration, served by the API from the server environment.
 * This is where the client learns things like the Google client id, so that
 * PUBLIC config lives only in the backend and never has to be duplicated into
 * the client's own build-time env.
 *
 * A 401 is not meaningful here (the endpoint is public), so a single request is
 * made with no refresh-retry.
 */
export async function fetchConfig() {
  return apiRequest('/config', { method: 'GET', retryOnUnauthorized: false });
}

export default { fetchConfig };
