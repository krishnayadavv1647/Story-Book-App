import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';

/**
 * Keeps a signed-in user off the auth screens. Like RequireAuth it waits while
 * the session is still resolving, so a cold load does not flash the sign-in form
 * before the silent refresh lands.
 */
export function RedirectIfAuthenticated() {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === 'unknown') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex h-full items-center justify-center text-sm text-ink-muted"
      >
        Loading…
      </div>
    );
  }

  if (status === 'authenticated') {
    return <Navigate to={location.state?.from?.pathname ?? '/'} replace />;
  }

  return <Outlet />;
}

export default RedirectIfAuthenticated;
