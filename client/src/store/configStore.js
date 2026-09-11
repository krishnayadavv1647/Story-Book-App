import { create } from 'zustand';
import * as configApi from '../api/config.js';

/**
 * Public runtime configuration, fetched once from the API.
 *
 * Values the browser needs come from the server's environment rather than the
 * client's own build, so there is a single place to configure them. For Google
 * sign-in that is just a boolean — whether it is enabled — because the flow is
 * server-side (the client id, secret and redirect URI all stay on the server).
 *
 * `load()` is idempotent and single-flight: safe to call from app boot and from
 * any component, and it fetches at most once.
 */
let inflight = null;

export const useConfigStore = create((set, get) => ({
  googleAuthEnabled: false,
  // The welcome pop-up's YouTube link, or null when it is switched off.
  welcomeVideoUrl: null,
  // 'unknown' until the first fetch resolves, then 'loaded' or 'error'.
  status: 'unknown',

  async load() {
    if (get().status === 'loaded') return undefined;
    if (inflight) return inflight;

    inflight = configApi
      .fetchConfig()
      .then((config) => {
        set({
          googleAuthEnabled: Boolean(config?.googleAuthEnabled),
          welcomeVideoUrl: config?.welcomeVideoUrl || null,
          status: 'loaded',
        });
      })
      .catch(() => {
        // A missing config just means no optional integrations light up; it must
        // never block the app from loading.
        set({ status: 'error' });
      })
      .finally(() => {
        inflight = null;
      });

    return inflight;
  },
}));

export default useConfigStore;
