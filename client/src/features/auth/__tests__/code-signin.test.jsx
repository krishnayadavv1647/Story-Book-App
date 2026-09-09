import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import AppRoutes from '../../../routes/AppRoutes.jsx';
import { createQueryClient } from '../../../lib/queryClient.js';
import { ToastProvider } from '../../../components/common/index.js';
import { useAuthStore } from '../../../store/authStore.js';
import { setAccessToken } from '../../../api/client.js';

/**
 * Signing in with an emailed code. The same two calls another app makes from
 * its own screen, so what is covered here is the contract as well as the UI.
 */
function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

const envelope = (data, message = 'OK') => jsonResponse({ success: true, data, message });

const failure = (status, code, message) =>
  jsonResponse(
    { success: false, data: null, message, meta: {}, error: { code, details: null } },
    { status },
  );

const SESSION = {
  accessToken: 'token-from-code',
  user: { id: 'u1', name: 'Krishna Yadav', email: 'reader@example.com', role: 'user' },
};

function api({ verify = () => envelope(SESSION, 'Signed in') } = {}) {
  return vi.fn(async (url, init) => {
    const path = String(url);
    if (path.includes('/auth/otp/request')) {
      return envelope(null, 'If that address can receive mail, a sign-in code is on its way.');
    }
    if (path.includes('/auth/otp/verify')) return verify(JSON.parse(init.body));
    if (path.includes('/auth/refresh')) return failure(401, 'UNAUTHENTICATED', 'No session');
    if (path.includes('/config')) return envelope({ googleAuthEnabled: false });
    return envelope({ ok: true });
  });
}

function renderSignIn() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/sign-in']}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const callsTo = (mock, fragment) =>
  mock.mock.calls.filter(([url]) => String(url).includes(fragment));

beforeEach(() => {
  setAccessToken(null);
  useAuthStore.setState({ status: 'unauthenticated', user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('signing in with an emailed code', () => {
  it('asks for the address, then the code, then signs in', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderSignIn();

    await userEvent.click(
      await screen.findByRole('button', { name: /Email me a sign-in code instead/i }),
    );

    await userEvent.type(screen.getByLabelText('Email'), 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: /Email me a code/i }));

    await waitFor(() => expect(callsTo(fetchMock, '/auth/otp/request')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/auth/otp/request')[0][1].body)).toEqual({
      email: 'reader@example.com',
    });

    // The screen never claims an account exists — the server does not say so.
    expect(await screen.findByText(/can receive mail/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Your code'), '482913');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(JSON.parse(callsTo(fetchMock, '/auth/otp/verify')[0][1].body)).toEqual({
      email: 'reader@example.com',
      code: '482913',
    });
  });

  it('keeps the reader on the code step when the code is wrong', async () => {
    const fetchMock = api({
      verify: () =>
        failure(401, 'INVALID_LOGIN_CODE', 'That code is not valid. Ask for a new one.'),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderSignIn();

    await userEvent.click(
      await screen.findByRole('button', { name: /Email me a sign-in code instead/i }),
    );
    await userEvent.type(screen.getByLabelText('Email'), 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: /Email me a code/i }));

    await userEvent.type(await screen.findByLabelText('Your code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(/not valid/i)).toBeInTheDocument();
    // Still on the code step, so a second attempt does not mean starting over.
    expect(screen.getByLabelText('Your code')).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('moves an unverified password sign-in straight to the code step', async () => {
    // The password was right, so this is not a failure the reader can act on by
    // retyping it — the server has already emailed a code.
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      if (path.includes('/auth/login')) {
        return failure(403, 'EMAIL_NOT_VERIFIED', 'Check your email for a code.');
      }
      if (path.includes('/auth/otp/verify')) return envelope(SESSION, 'Signed in');
      if (path.includes('/auth/refresh')) return failure(401, 'UNAUTHENTICATED', 'No session');
      if (path.includes('/config')) return envelope({ googleAuthEnabled: false });
      return envelope({ ok: true }, init ? 'OK' : 'OK');
    });
    vi.stubGlobal('fetch', fetchMock);
    renderSignIn();

    await userEvent.type(await screen.findByLabelText('Email'), 'reader@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a-long-enough-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/has not been confirmed/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Your code'), '482913');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
  });

  it('goes back to the password form, and to a different address', async () => {
    vi.stubGlobal('fetch', api());
    renderSignIn();

    await userEvent.click(
      await screen.findByRole('button', { name: /Email me a sign-in code instead/i }),
    );
    await userEvent.type(screen.getByLabelText('Email'), 'typo@example.com');
    await userEvent.click(screen.getByRole('button', { name: /Email me a code/i }));

    await userEvent.click(await screen.findByRole('button', { name: /different address/i }));
    expect(screen.getByLabelText('Email')).toHaveValue('typo@example.com');

    await userEvent.click(screen.getByRole('button', { name: /password instead/i }));
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });
});
