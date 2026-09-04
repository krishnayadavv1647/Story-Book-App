import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import AppRoutes from '../../../routes/AppRoutes.jsx';
import { createQueryClient } from '../../../lib/queryClient.js';
import { ToastProvider } from '../../../components/common/index.js';
import { useAuthStore } from '../../../store/authStore.js';
import { setAccessToken, getAccessToken } from '../../../api/client.js';

function renderAt(path) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

const ok = (data) => jsonResponse({ success: true, data, message: 'OK', meta: {}, error: null });
const fail = (status, code, message, details = null) =>
  jsonResponse({ success: false, data: null, message, meta: {}, error: { code, details } }, { status });

const SESSION = {
  accessToken: 'access-token-1',
  user: { id: 'u1', name: 'Krishna Yadav', email: 'krishna@example.com', role: 'user' },
};

/**
 * Signing in lands on the dashboard, which fetches immediately. Routing the mock
 * by URL keeps those calls from being answered with a session payload, which
 * would crash the grid rather than fail the assertion under test.
 */
function respondByUrl(authResponse) {
  return vi.fn(async (url) => {
    const path = String(url);
    if (path.includes('/auth/')) return authResponse;
    if (path.includes('/books/summary')) return ok({ total: 0, byStatus: {} });
    return ok([]);
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  setAccessToken(null);
  useAuthStore.setState({ status: 'unauthenticated', user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sign in', () => {
  it('signs the user in and lands them in the workspace', async () => {
    vi.stubGlobal('fetch', respondByUrl(ok(SESSION)));
    renderAt('/sign-in');

    await userEvent.type(screen.getByLabelText('Email'), 'krishna@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a-long-enough-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument(),
    );

    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain('/auth/login');
    expect(JSON.parse(init.body)).toEqual({
      email: 'krishna@example.com',
      password: 'a-long-enough-passphrase',
    });

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(getAccessToken()).toBe('access-token-1');
  });

  it('shows the server message when the credentials are rejected', async () => {
    fetch.mockResolvedValue(fail(401, 'UNAUTHENTICATED', 'Email or password is incorrect'));
    renderAt('/sign-in');

    await userEvent.type(screen.getByLabelText('Email'), 'krishna@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    // The form stays put so the user can correct it.
    expect(screen.getByLabelText('Email')).toHaveValue('krishna@example.com');
  });

  it('sends a signed-in visitor away from the sign-in screen', async () => {
    vi.stubGlobal('fetch', respondByUrl(ok(null)));
    useAuthStore.setState({ status: 'authenticated', user: { id: 'u1', name: 'K' } });
    renderAt('/sign-in');

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument();
  });

  it('waits rather than flashing the form while the session is still resolving', () => {
    useAuthStore.setState({ status: 'unknown', user: null });
    renderAt('/sign-in');

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument();
  });
});

describe('sign up', () => {
  it('creates the account and signs in', async () => {
    vi.stubGlobal('fetch', respondByUrl(ok(SESSION)));
    renderAt('/sign-up');

    await userEvent.type(screen.getByLabelText('Name'), 'Krishna Yadav');
    await userEvent.type(screen.getByLabelText('Email'), 'krishna@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a-long-enough-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(fetch.mock.calls[0][0]).toContain('/auth/register');
  });

  it('binds a server validation failure to the field that caused it', async () => {
    fetch.mockResolvedValue(
      fail(422, 'VALIDATION_ERROR', 'Validation failed', [
        { path: 'body.password', message: 'Use at least 12 characters' },
      ]),
    );
    renderAt('/sign-up');

    await userEvent.type(screen.getByLabelText('Name'), 'Krishna Yadav');
    await userEvent.type(screen.getByLabelText('Email'), 'krishna@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Use at least 12 characters');
    // The message lands on the password field, not in a generic banner.
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('reports a duplicate account without blaming a field', async () => {
    fetch.mockResolvedValue(
      fail(409, 'CONFLICT', 'An account already exists for that email address'),
    );
    renderAt('/sign-up');

    await userEvent.type(screen.getByLabelText('Name'), 'Krishna Yadav');
    await userEvent.type(screen.getByLabelText('Email'), 'krishna@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a-long-enough-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });
});

describe('password reset', () => {
  it('confirms the request without revealing whether the account exists', async () => {
    fetch.mockResolvedValue(ok({ devToken: null }));
    renderAt('/forgot-password');

    await userEvent.type(screen.getByLabelText('Email'), 'nobody@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText(/if that address has an account/i)).toBeInTheDocument();
  });

  it('refuses to render the form when the link carries no token', () => {
    renderAt('/reset-password');

    expect(screen.getByRole('heading', { name: /link is incomplete/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('requires both passwords to match before calling the server', async () => {
    renderAt('/reset-password?token=a-token-long-enough-to-pass');

    await userEvent.type(screen.getByLabelText('New password'), 'a-long-enough-passphrase');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'something-else-entirely');
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Both passwords must match');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('submits when the passwords match', async () => {
    fetch.mockResolvedValue(ok(null));
    renderAt('/reset-password?token=a-token-long-enough-to-pass');

    await userEvent.type(screen.getByLabelText('New password'), 'a-long-enough-passphrase');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'a-long-enough-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain('/auth/reset-password');
    expect(JSON.parse(init.body)).toEqual({
      token: 'a-token-long-enough-to-pass',
      password: 'a-long-enough-passphrase',
    });
  });
});

describe('sign out', () => {
  it('ends the session and returns the user to sign-in', async () => {
    vi.stubGlobal('fetch', respondByUrl(ok(null)));
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'u1', name: 'Krishna Yadav' },
    });
    setAccessToken('access-token-1');

    renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument(),
    );
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(getAccessToken()).toBeNull();
  });
});
