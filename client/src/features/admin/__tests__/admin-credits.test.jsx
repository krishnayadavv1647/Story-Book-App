import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import AppRoutes from '../../../routes/AppRoutes.jsx';
import { createQueryClient } from '../../../lib/queryClient.js';
import { ToastProvider } from '../../../components/common/index.js';
import { useAuthStore } from '../../../store/authStore.js';

/**
 * Topping an account up is the only way credits are handed out after signup, so
 * a control that silently does nothing would leave every account that runs out
 * stuck for good.
 */
function envelope(data, meta = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ success: true, data, message: 'OK', meta, error: null }),
  };
}

const READER = {
  _id: 'u2',
  name: 'Reader',
  email: 'reader@example.com',
  role: 'user',
  credits: 120,
};

function api() {
  return vi.fn(async (url) => {
    const path = String(url);
    if (path.includes('/admin/users/u2/credits')) return envelope({ balance: 620, adjusted: 500 });
    if (path.includes('/admin/users')) {
      return envelope([READER], { pagination: { page: 1, limit: 25, total: 1 } });
    }
    if (path.includes('/admin/overview')) {
      return envelope({
        users: 1,
        books: 0,
        jobs: {},
        exports: {},
        failuresLast24h: 0,
        storage: { objects: 0, bytes: 0 },
        providers: {
          gemini: { configured: true, model: 'gemini-2.5-flash' },
          kie: { configured: true, model: 'nano-banana-pro' },
          storage: { driver: 'memory' },
        },
      });
    }
    if (path.includes('/admin/plans')) return envelope([]);
    if (path.includes('/admin/bonus-links')) return envelope([]);
    if (path.includes('/admin/audit')) return envelope([]);
    if (path.includes('/credits')) {
      return envelope({ balance: 500, signupGrant: 500, prices: {}, recent: [] });
    }
    return envelope({ ok: true });
  });
}

const callsTo = (mock, fragment, method) =>
  mock.mock.calls.filter(
    ([url, init]) => String(url).includes(fragment) && (init?.method ?? 'GET') === method,
  );

/** The accounts list lives behind its own tab now. */
async function openAccounts() {
  await userEvent.click(await screen.findByRole('tab', { name: 'Accounts' }));
}

function renderAdmin() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u1', name: 'Krishna Yadav', role: 'admin' },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('admin credit adjustments', () => {
  it('shows each account’s balance', async () => {
    vi.stubGlobal('fetch', api());
    renderAdmin();
    await openAccounts();

    expect(await screen.findByText('120')).toBeInTheDocument();
  });

  it('adds credits, and takes them away with the same amount negated', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAdmin();
    await openAccounts();

    const amount = await screen.findByLabelText('Credits to adjust for reader@example.com');
    await userEvent.type(amount, '500');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, '/admin/users/u2/credits', 'POST')).toHaveLength(1),
    );
    expect(
      JSON.parse(callsTo(fetchMock, '/admin/users/u2/credits', 'POST')[0][1].body),
    ).toMatchObject({
      amount: 500,
    });

    // The field clears on success, so the next adjustment starts from empty.
    await waitFor(() => expect(amount).toHaveValue(''));

    await userEvent.type(amount, '50');
    await userEvent.click(screen.getByRole('button', { name: 'Take' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, '/admin/users/u2/credits', 'POST')).toHaveLength(2),
    );
    expect(
      JSON.parse(callsTo(fetchMock, '/admin/users/u2/credits', 'POST')[1][1].body),
    ).toMatchObject({
      amount: -50,
    });
  });

  it('will not send an empty or nonsense amount', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAdmin();
    await openAccounts();

    const add = await screen.findByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Credits to adjust for reader@example.com'), 'lots');
    expect(add).toBeDisabled();
    expect(callsTo(fetchMock, '/admin/users/u2/credits', 'POST')).toHaveLength(0);
  });
});
