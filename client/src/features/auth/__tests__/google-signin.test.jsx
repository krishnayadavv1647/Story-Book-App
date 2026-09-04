import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import SignInPage from '../../../pages/SignInPage.jsx';
import { useAuthStore } from '../../../store/authStore.js';
import { useConfigStore } from '../../../store/configStore.js';

function renderSignIn(path = '/sign-in') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/" element={<div>Workspace</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ status: 'unauthenticated', user: null });
  useConfigStore.setState({ googleAuthEnabled: false, status: 'unknown' });
});

describe('Continue with Google', () => {
  it('is not rendered when Google sign-in is disabled', () => {
    useConfigStore.setState({ googleAuthEnabled: false, status: 'loaded' });
    renderSignIn();

    expect(screen.queryByRole('link', { name: /continue with google/i })).not.toBeInTheDocument();
    // The password form is still fully present.
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('links to the server OAuth entry point when enabled', () => {
    useConfigStore.setState({ googleAuthEnabled: true, status: 'loaded' });
    renderSignIn();

    const link = screen.getByRole('link', { name: /continue with google/i });
    // A real navigation to the API, which redirects the browser on to Google.
    expect(link).toHaveAttribute('href', expect.stringContaining('/auth/google'));
  });

  it('surfaces a failed Google round-trip from the redirect back', () => {
    useConfigStore.setState({ googleAuthEnabled: true, status: 'loaded' });
    renderSignIn('/sign-in?error=google_failed');

    expect(screen.getByRole('alert')).toHaveTextContent(/didn.t work/i);
  });
});
