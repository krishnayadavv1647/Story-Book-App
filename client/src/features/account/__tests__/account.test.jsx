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

function failure(status, code, message) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => ({ success: false, data: null, message, meta: {}, error: { code, details: null } }),
  };
}


const NOTIFICATIONS = [
  {
    _id: 'n1',
    type: 'book_ready',
    severity: 'success',
    title: '“Aarav” is fully illustrated',
    body: 'All 6 pages are ready.',
    actionPath: '/books/b1/editor',
    readAt: null,
    createdAt: '2026-09-02T10:00:00.000Z',
  },
  {
    _id: 'n2',
    type: 'export_failed',
    severity: 'error',
    title: 'PDF export failed',
    body: 'Nothing was saved.',
    actionPath: null,
    readAt: '2026-09-02T09:30:00.000Z',
    createdAt: '2026-09-02T09:00:00.000Z',
  },
];

function api({ overrides = {}, notifications = NOTIFICATIONS } = {}) {
  return vi.fn(async (url, init) => {
    const path = String(url);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : null;

    for (const [fragment, handler] of Object.entries(overrides)) {
      if (path.includes(fragment)) return handler(method, body);
    }
    if (path.includes('/notifications/read-all')) return envelope({ updated: 1 });
    if (path.includes('/read') && method === 'POST') return envelope({ readAt: 'now' });
    if (path.includes('/notifications')) {
      const unreadOnly = path.includes('unreadOnly=true');
      const items = unreadOnly ? notifications.filter((n) => !n.readAt) : notifications;
      return envelope(items, { pagination: { page: 1, limit: 50, total: items.length } });
    }
    if (path.includes('/users/me/password')) return envelope({ sessionsRevoked: 2 });
    if (path.includes('/users/me')) {
      return envelope({
        id: 'u1',
        name: 'Krishna Yadav',
        email: 'krishna@example.com',
        role: 'user',
        preferences: { theme: 'light', emailNotifications: true },
        credits: 420,
      });
    }
    if (path.includes('/credits')) {
      return envelope({
        balance: 420,
        signupGrant: 500,
        prices: { story_plan: 10, page_image: 5, character_image: 5, story_chat: 1 },
        recent: [],
      });
    }
    if (path.includes('/auth/session')) {
      return envelope({ user: { id: 'u1', name: 'Krishna Yadav' } });
    }

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

const callsTo = (mock, fragment, method) =>
  mock.mock.calls.filter(
    ([url, init]) =>
      String(url).includes(fragment) && (!method || (init?.method ?? 'GET') === method),
  );

beforeEach(() => {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u1', name: 'Krishna Yadav' },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('notifications', () => {
  it('lists them with unread marked, and marks one read', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/notifications');

    expect(
      await screen.findByRole('heading', { name: 'Notifications', level: 1 }),
    ).toBeInTheDocument();

    expect(await screen.findByText('“Aarav” is fully illustrated')).toBeInTheDocument();
    expect(screen.getByText('PDF export failed')).toBeInTheDocument();
    // Only the unread one carries the dot and a Mark read button.
    expect(screen.getByLabelText('Unread')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Mark read' }));
    await waitFor(() => expect(callsTo(fetchMock, '/notifications/n1/read', 'POST')).toHaveLength(1));
  });

  it('filters to unread', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/notifications');

    await screen.findByText('“Aarav” is fully illustrated');
    await userEvent.click(screen.getByRole('tab', { name: /Unread/ }));

    await waitFor(() => expect(callsTo(fetchMock, 'unreadOnly=true').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByText('PDF export failed')).not.toBeInTheDocument());
  });

  it('says plainly when there is nothing', async () => {
    vi.stubGlobal('fetch', api({ notifications: [] }));
    renderAt('/notifications');

    expect(await screen.findByText(/Nothing to report yet/i)).toBeInTheDocument();
  });
});

describe('settings', () => {
  it('saves a new name and refreshes the session behind the sidebar', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/settings');

    const name = await screen.findByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Krishna Y');
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(callsTo(fetchMock, '/users/me', 'PATCH')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/users/me', 'PATCH')[0][1].body)).toEqual({
      name: 'Krishna Y',
    });
    await waitFor(() => expect(callsTo(fetchMock, '/auth/session').length).toBeGreaterThan(0));
  });

  it('shows the credit balance and never offers to store a provider key', async () => {
    // Generation runs on the server's own keys now, so there is nothing here to
    // paste one into — what the screen owes the user instead is their balance.
    vi.stubGlobal('fetch', api());
    renderAt('/settings');

    expect(await screen.findByText('credits left')).toBeInTheDocument();
    // Twice: the sidebar row carries the balance as well as the card.
    expect(screen.getAllByText('420')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /went on/i })).toHaveAttribute('href', '/credits');
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
  });

  it('will not submit a password change without both fields', async () => {
    vi.stubGlobal('fetch', api());
    renderAt('/settings');

    await screen.findByLabelText('Name');
    expect(screen.getByRole('button', { name: /Change password/ })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Current password'), 'old-password-here');
    // Still too short to be a valid new password.
    await userEvent.type(screen.getByLabelText('New password'), 'short');
    expect(screen.getByRole('button', { name: /Change password/ })).toBeDisabled();
  });

  it('changes the password and says how many sessions were signed out', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/settings');

    await screen.findByLabelText('Name');
    await userEvent.type(screen.getByLabelText('Current password'), 'old-password-here');
    await userEvent.type(screen.getByLabelText('New password'), 'a-brand-new-passphrase');
    await userEvent.click(screen.getByRole('button', { name: /Change password/ }));

    await waitFor(() =>
      expect(callsTo(fetchMock, '/users/me/password', 'POST')).toHaveLength(1),
    );
    expect(await screen.findByText(/2 other sessions were signed out/i)).toBeInTheDocument();
  });

  it('reports a wrong current password without clearing the form', async () => {
    vi.stubGlobal(
      'fetch',
      api({
        overrides: {
          '/users/me/password': () =>
            failure(400, 'WRONG_PASSWORD', 'That is not your current password.'),
        },
      }),
    );
    renderAt('/settings');

    await screen.findByLabelText('Name');
    await userEvent.type(screen.getByLabelText('Current password'), 'wrong-password-x');
    await userEvent.type(screen.getByLabelText('New password'), 'a-brand-new-passphrase');
    await userEvent.click(screen.getByRole('button', { name: /Change password/ }));

    expect(await screen.findByText(/not your current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveValue('a-brand-new-passphrase');
  });
});

describe('admin', () => {
  const adminApi = () =>
    vi.fn(async (url) => {
      const path = String(url);
      if (path.includes('/admin/overview')) {
        return envelope({
          users: 12,
          books: 30,
          jobs: { succeeded: 40 },
          exports: {},
          failuresLast24h: 2,
          storage: { objects: 88, bytes: 1_000_000 },
          providers: {
            gemini: { configured: true, model: 'gemini-2.5-flash' },
            kie: { configured: false, model: 'nano-banana-pro' },
            storage: { driver: 'memory' },
          },
        });
      }
      if (path.includes('/admin/users')) {
        return envelope(
          [{ _id: 'u2', name: 'Someone', email: 'someone@example.com', role: 'user' }],
          { pagination: { page: 1, limit: 25, total: 1 } },
        );
      }
      if (path.includes('/admin/audit')) return envelope([]);
      return envelope({ ok: true });
    });

  it('sends an ordinary account away', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'u1', name: 'Krishna Yadav', role: 'user' },
    });
    vi.stubGlobal('fetch', adminApi());
    renderAt('/admin');

    // Redirected to the dashboard rather than shown a screen that would 403.
    await waitFor(() => expect(screen.queryByText('Audit trail')).not.toBeInTheDocument());
  });

  it('shows counts and provider state to an admin, without any key', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'u1', name: 'Krishna Yadav', role: 'admin' },
    });
    vi.stubGlobal('fetch', adminApi());
    renderAt('/admin');

    expect(await screen.findByRole('heading', { name: 'Admin', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('12')).toBeInTheDocument();
    // Kie and the memory storage driver are both unconfigured here.
    expect(screen.getAllByText('Not configured')).toHaveLength(2);
    expect(screen.getAllByText('Configured')).toHaveLength(1);
    // Model names are shown; keys never are.
    expect(screen.getByText('gemini-2.5-flash')).toBeInTheDocument();
  });
});
