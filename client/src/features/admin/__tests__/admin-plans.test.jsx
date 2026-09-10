import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

const ADMIN = { id: 'u1', name: 'Krishna Yadav', role: 'admin' };

const READER = {
  _id: 'u2',
  name: 'Reader',
  email: 'reader@example.com',
  role: 'user',
  status: 'active',
  credits: 120,
  plan: null,
};

const STARTER = {
  _id: 'p1',
  key: 'starter',
  name: 'Starter',
  description: 'A few books a month.',
  priceCents: 900,
  currency: 'USD',
  interval: 'month',
  creditsGranted: 400,
  features: ['Watermark-free exports'],
  limits: {},
  isActive: true,
  visibleToUsers: true,
};

const DRAFT = { ...STARTER, _id: 'p2', key: 'draft', name: 'Draft', visibleToUsers: false };

const OVERVIEW = {
  users: 2,
  books: 13,
  booksGenerated: 11,
  booksInProgress: 1,
  booksFailed: 1,
  jobs: {},
  exports: {},
  failuresLast24h: 0,
  storage: { objects: 0, bytes: 0 },
  providers: {
    gemini: { configured: true, model: 'gemini-2.5-flash' },
    kie: { configured: true, model: 'nano-banana-pro' },
    storage: { driver: 'memory' },
  },
};

function api({ users = [READER], plans = [STARTER, DRAFT] } = {}) {
  return vi.fn(async (url) => {
    const path = String(url);
    if (path.includes('/admin/users/u2/plan')) return envelope({ creditsGranted: 400 });
    if (path.includes('/admin/users/u2/credits')) return envelope({ balance: 620 });
    if (path.includes('/admin/users/u2')) return envelope({ ...READER, status: 'suspended' });
    if (path.includes('/admin/users')) {
      return envelope(users, { pagination: { page: 1, limit: 25, total: users.length } });
    }
    if (path.includes('/admin/plans')) return envelope(plans);
    if (path.includes('/admin/overview')) return envelope(OVERVIEW);
    if (path.includes('/admin/audit')) return envelope([]);
    if (path.includes('/auth/session')) return envelope({ user: ADMIN });
    return envelope({ ok: true });
  });
}

const callsTo = (mock, fragment, method) =>
  mock.mock.calls.filter(
    ([url, init]) => String(url).includes(fragment) && (init?.method ?? 'GET') === method,
  );

const bodyOf = (call) => JSON.parse(call[1].body);

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

const openTab = async (name) => userEvent.click(await screen.findByRole('tab', { name }));

beforeEach(() => {
  useAuthStore.setState({ status: 'authenticated', user: ADMIN });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the overview', () => {
  it('leads with the books actually generated, and says what the rest are', async () => {
    vi.stubGlobal('fetch', api());
    renderAdmin();

    expect(await screen.findByText('Books generated')).toBeInTheDocument();
    // The label renders before the numbers arrive, so wait for the value itself.
    expect(await screen.findByText('11')).toBeInTheDocument();
    expect(screen.getByText('13 created · 1 in progress · 1 failed')).toBeInTheDocument();
  });
});

describe('the plans tab', () => {
  it('says which plans readers can see and which are still drafts', async () => {
    vi.stubGlobal('fetch', api());
    renderAdmin();
    await openTab('Plans');

    expect(await screen.findByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Shown to users')).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    // The credits are on the row, because that is the part that does something.
    expect(screen.getAllByText('400').length).toBeGreaterThan(0);
  });

  it('creates a plan, turning the price into cents and the name into a key', async () => {
    const fetchMock = api({ plans: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderAdmin();
    await openTab('Plans');

    await userEvent.click(await screen.findByRole('button', { name: /New plan/ }));
    await userEvent.type(screen.getByLabelText('Name'), 'Pro Monthly');
    await userEvent.clear(screen.getByLabelText('Price'));
    await userEvent.type(screen.getByLabelText('Price'), '19.5');
    await userEvent.type(screen.getByLabelText('Credits'), '1200');
    await userEvent.click(screen.getByRole('button', { name: 'Create plan' }));

    await waitFor(() => expect(callsTo(fetchMock, '/admin/plans', 'POST')).toHaveLength(1));
    expect(bodyOf(callsTo(fetchMock, '/admin/plans', 'POST')[0])).toMatchObject({
      name: 'Pro Monthly',
      // Typed once, derived from the name — nobody should have to invent a slug.
      key: 'pro-monthly',
      priceCents: 1950,
      creditsGranted: 1200,
      visibleToUsers: false,
    });
  });

  it('warns that a plan in use is kept rather than deleted', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAdmin();
    await openTab('Plans');

    await userEvent.click((await screen.findAllByRole('button', { name: 'Withdraw' }))[0]);
    expect(await screen.findByText(/the plan is kept/i)).toBeInTheDocument();

    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(callsTo(fetchMock, '/admin/plans/p1', 'DELETE')).toHaveLength(1));
  });
});

describe('acting on an account', () => {
  it('puts an account on a plan, and says what that hands over', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAdmin();
    await openTab('Accounts');

    const select = await screen.findByLabelText('Plan for reader@example.com');
    // The option says what assigning it costs the house, not just its name.
    expect(screen.getByRole('option', { name: 'Give Starter (+400)' })).toBeInTheDocument();

    await userEvent.selectOptions(select, 'p1');

    await waitFor(() => expect(callsTo(fetchMock, '/admin/users/u2/plan', 'POST')).toHaveLength(1));
    expect(bodyOf(callsTo(fetchMock, '/admin/users/u2/plan', 'POST')[0])).toEqual({ planId: 'p1' });
  });

  it('suspends only after confirming, and says what suspension does', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAdmin();
    await openTab('Accounts');

    await userEvent.click(await screen.findByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText(/signed out everywhere/i)).toBeInTheDocument();
    // Nothing has been sent yet — the dialog is the decision point.
    expect(callsTo(fetchMock, '/admin/users/u2', 'PATCH')).toHaveLength(0);

    // Scoped to the dialog: while it is open the row behind it is inert, so the
    // matching button out there cannot be clicked at all.
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }));

    await waitFor(() => expect(callsTo(fetchMock, '/admin/users/u2', 'PATCH')).toHaveLength(1));
    expect(bodyOf(callsTo(fetchMock, '/admin/users/u2', 'PATCH')[0])).toEqual({
      status: 'suspended',
    });
  });

  it('promotes an account to admin', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAdmin();
    await openTab('Accounts');

    await userEvent.click(await screen.findByRole('button', { name: 'Make admin' }));

    await waitFor(() => expect(callsTo(fetchMock, '/admin/users/u2', 'PATCH')).toHaveLength(1));
    expect(bodyOf(callsTo(fetchMock, '/admin/users/u2', 'PATCH')[0])).toEqual({ role: 'admin' });
  });

  it('offers no suspend or role controls on your own row', async () => {
    // The server refuses it, so a button here would only ever produce an error.
    const me = { ...READER, _id: 'u1', name: 'Krishna Yadav', email: 'admin@example.com' };
    vi.stubGlobal('fetch', api({ users: [me] }));
    renderAdmin();
    await openTab('Accounts');

    expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make admin' })).not.toBeInTheDocument();
    // Credits are still adjustable on your own account — that locks nobody out.
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});
