import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import AppRoutes from '../../../routes/AppRoutes.jsx';
import { createQueryClient } from '../../../lib/queryClient.js';
import { ToastProvider } from '../../../components/common/index.js';
import { useAuthStore } from '../../../store/authStore.js';

function envelope(data, meta = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ success: true, data, message: 'OK', meta, error: null }),
  };
}

const PLAN = {
  _id: 'p1',
  key: 'bonus',
  name: 'Welcome Bonus',
  priceCents: 0,
  currency: 'USD',
  interval: 'lifetime',
  creditsGranted: 500,
  features: [],
  limits: {},
  isActive: true,
  visibleToUsers: true,
};

const LINK = {
  _id: 'l1',
  code: 'Zx9Ab3kQpL2mN8vR',
  label: 'Cinema Studio buyers',
  planId: { _id: 'p1', name: 'Welcome Bonus', creditsGranted: 500, isActive: true },
  isActive: true,
  uses: 7,
};

const OVERVIEW = {
  users: 1,
  books: 0,
  booksGenerated: 0,
  jobs: {},
  exports: {},
  failuresLast24h: 0,
  storage: { objects: 0, bytes: 0 },
  providers: { gemini: {}, kie: {}, storage: { driver: 'memory' } },
};

function api() {
  return vi.fn(async (url, init) => {
    const path = String(url);
    const method = init?.method ?? 'GET';
    if (path.includes('/admin/bonus-links')) {
      if (method === 'GET') return envelope([LINK]);
      return envelope({ ...LINK, ...JSON.parse(init.body) });
    }
    if (path.includes('/admin/plans')) return envelope([PLAN]);
    if (path.includes('/admin/users')) {
      return envelope([], { pagination: { page: 1, limit: 25, total: 0 } });
    }
    if (path.includes('/admin/overview')) return envelope(OVERVIEW);
    if (path.includes('/admin/audit')) return envelope([]);
    return envelope({ ok: true });
  });
}

const callsTo = (mock, fragment, method) =>
  mock.mock.calls.filter(
    ([url, init]) => String(url).includes(fragment) && (init?.method ?? 'GET') === method,
  );

function renderPlansTab() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return screen.findByRole('tab', { name: 'Plans' }).then((tab) => userEvent.click(tab));
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

describe('bonus links in the admin panel', () => {
  it('shows each link as the URL to hand out, with how often it was redeemed', async () => {
    vi.stubGlobal('fetch', api());
    await renderPlansTab();

    expect(await screen.findByText('Cinema Studio buyers')).toBeInTheDocument();
    expect(screen.getByText(/\/join\/Zx9Ab3kQpL2mN8vR$/)).toBeInTheDocument();
    expect(screen.getByText('redeemed')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('creates a link for the chosen plan', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    await renderPlansTab();

    await userEvent.type(await screen.findByLabelText('Link name'), 'September promo');
    await userEvent.selectOptions(screen.getByLabelText('Plan it grants'), 'p1');
    await userEvent.click(screen.getByRole('button', { name: /Create link/ }));

    await waitFor(() => expect(callsTo(fetchMock, '/admin/bonus-links', 'POST')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/admin/bonus-links', 'POST')[0][1].body)).toEqual({
      label: 'September promo',
      planId: 'p1',
    });
  });

  it('switches a link off without deleting it', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    await renderPlansTab();

    await userEvent.click(
      await screen.findByRole('switch', { name: 'Cinema Studio buyers is active' }),
    );

    await waitFor(() =>
      expect(callsTo(fetchMock, '/admin/bonus-links/l1', 'PATCH')).toHaveLength(1),
    );
    expect(JSON.parse(callsTo(fetchMock, '/admin/bonus-links/l1', 'PATCH')[0][1].body)).toEqual({
      isActive: false,
    });
    expect(callsTo(fetchMock, '/admin/bonus-links', 'DELETE')).toHaveLength(0);
  });
});
