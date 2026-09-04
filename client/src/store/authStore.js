import { create } from 'zustand';
import * as authApi from '../api/auth.js';

/**
 * Session state for the whole client.
 *
 * `status` starts as `unknown` rather than `unauthenticated` so a protected
 * route waits for the silent refresh instead of bouncing an already-signed-in
 * user to the sign-in screen for one frame on a cold load.
 */
export const useAuthStore = create((set) => ({
  status: 'unknown',
  user: null,

  setSession({ user }) {
    set({ status: 'authenticated', user });
  },

  clearSession() {
    set({ status: 'unauthenticated', user: null });
  },

  /**
   * Runs once on load. The refresh cookie is the only thing that survives a
   * reload, so this trades it for an access token. A 401 is the ordinary answer
   * for a visitor who is not signed in, not a failure worth reporting.
   */
  async bootstrap() {
    try {
      const session = await authApi.restoreSession();
      set({ status: 'authenticated', user: session.user });
    } catch {
      set({ status: 'unauthenticated', user: null });
    }
  },

  async signIn(credentials) {
    const session = await authApi.login(credentials);
    set({ status: 'authenticated', user: session.user });
    return session;
  },

  async signUp(details) {
    const session = await authApi.register(details);
    set({ status: 'authenticated', user: session.user });
    return session;
  },

  /**
   * Re-reads the session. The sidebar draws the account from it, so a rename
   * has to be picked up from the server rather than guessed at locally.
   */
  async refreshSession() {
    try {
      const session = await authApi.fetchSession();
      set({ status: 'authenticated', user: session.user });
    } catch {
      // A failed refresh should never sign anyone out; what is on screen just
      // stays as it was until the next successful read.
    }
  },

  async signOut() {
    await authApi.logout();
    set({ status: 'unauthenticated', user: null });
  },
}));

export const selectIsAuthenticated = (state) => state.status === 'authenticated';
export const selectIsResolvingSession = (state) => state.status === 'unknown';

export default useAuthStore;
