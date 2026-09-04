import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';

/**
 * Gate for every authenticated route. While the session is still resolving it
 * renders nothing rather than redirecting, so a signed-in user never sees the
 * sign-in screen flash on a cold load.
 *
 * The redirect carries the attempted location so sign-in can return the user to
 * where they were going.
 */
export function RequireAuth({ children }) {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === 'unknown') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex h-full items-center justify-center text-sm text-ink-muted"
      >
        Loading your workspace…
      </div>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }

  return children;
}

export default RequireAuth;
