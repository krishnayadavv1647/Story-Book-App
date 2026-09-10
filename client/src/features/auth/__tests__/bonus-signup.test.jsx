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
 * Arriving through a bonus link. The page says what the link offers before
 * anybody types, and sends the code with the sign-up — the server, not this
 * screen, decides whether it is honoured.
 */
function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

const envelope = (data) => jsonResponse({ success: true, data, message: 'OK' });
const failure = (status, code) =>
  jsonResponse(
    { success: false, data: null, message: 'No', meta: {}, error: { code, details: null } },
    { status },
  );

function api({ bonus = { valid: true, planName: 'Welcome Bonus', credits: 500 } } = {}) {
  return vi.fn(async (url) => {
    const path = String(url);
    if (path.includes('/auth/bonus/')) return envelope(bonus);
    if (path.includes('/auth/register')) {
      return envelope({ verificationRequired: true, email: 'reader@example.com' });
    }
    if (path.includes('/auth/refresh')) return failure(401, 'UNAUTHENTICATED');
    if (path.includes('/config')) return envelope({ googleAuthEnabled: false });
    return envelope({ ok: true });
  });
}

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

const callsTo = (mock, fragment) =>
  mock.mock.calls.filter(([url]) => String(url).includes(fragment));

beforeEach(() => {
  setAccessToken(null);
  useAuthStore.setState({ status: 'unauthenticated', user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('signing up through a bonus link', () => {
  it('says what the link offers, and sends its code with the sign-up', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/join/Zx9Ab3kQpL2mN8vR');

    expect(await screen.findByText(/You are claiming the/i)).toBeInTheDocument();
    expect(screen.getByText('Welcome Bonus')).toBeInTheDocument();
    expect(screen.getByText(/500 credits/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Name'), 'Reader');
    await userEvent.type(screen.getByLabelText('Email'), 'reader@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a-long-enough-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(callsTo(fetchMock, '/auth/register')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/auth/register')[0][1].body)).toMatchObject({
      email: 'reader@example.com',
      bonusCode: 'Zx9Ab3kQpL2mN8vR',
    });
  });

  it('says so when the link is no longer active, and still lets them sign up', async () => {
    vi.stubGlobal('fetch', api({ bonus: { valid: false } }));
    renderAt('/join/dead-link-code');

    expect(await screen.findByText(/no longer active/i)).toBeInTheDocument();
    expect(screen.queryByText(/You are claiming the/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  it('asks nothing of the server on an ordinary sign-up', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/sign-up');

    await screen.findByRole('button', { name: 'Create account' });
    expect(callsTo(fetchMock, '/auth/bonus/')).toHaveLength(0);
  });
});
