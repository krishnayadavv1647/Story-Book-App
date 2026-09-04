import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../lib/queryClient.js';
import { useAuthStore } from '../../store/authStore.js';
import AppRoutes from '../AppRoutes.jsx';
import { ALL_NAV_ITEMS, BUILT_NAV_PATHS } from '../../config/navigation.js';

function renderAt(path) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// The dashboard behind `/` fetches on mount. These tests are about routing, so
// the network is stubbed out rather than exercised.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ success: true, data: [], message: 'OK', meta: {}, error: null }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('protected routing', () => {
  it('sends an unauthenticated visitor to sign-in', () => {
    useAuthStore.setState({ status: 'unauthenticated', user: null });

    renderAt('/');

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('waits instead of redirecting while the session is still resolving', () => {
    useAuthStore.setState({ status: 'unknown', user: null });

    renderAt('/');

    expect(screen.getByRole('status')).toHaveTextContent(/loading your workspace/i);
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument();
  });

  it('renders the workspace inside the app shell for an authenticated session', () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: '1', name: 'Krishna Yadav' },
    });

    renderAt('/');

    // The shell is what proves the route rendered, not the placeholder body.
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore' })).toBeInTheDocument();
    expect(screen.getByText('Krishna Yadav')).toBeInTheDocument();
  });

  it('renders the not-found page for an unknown path', () => {
    useAuthStore.setState({ status: 'authenticated', user: { id: '1' } });

    renderAt('/no-such-page');

    expect(screen.getByRole('heading', { name: /does not exist/i })).toBeInTheDocument();
  });
});

describe('navigation route coverage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'u1', name: 'Krishna Yadav' },
    });
  });

  // Every sidebar row used to be a link, and all but two of them landed on the
  // not-found page. Anything the sidebar links to has to resolve.
  it.each(BUILT_NAV_PATHS)('%s is a real route, not the not-found page', async (path) => {
    renderAt(path);

    expect(await screen.findByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.queryByText('That page does not exist')).not.toBeInTheDocument();
  });

  it('draws the unbuilt destinations without linking to them', async () => {
    renderAt('/');

    await screen.findByRole('navigation', { name: 'Main navigation' });

    for (const item of ALL_NAV_ITEMS.filter((i) => i.arrives)) {
      expect(screen.queryByRole('link', { name: item.label })).not.toBeInTheDocument();
    }
  });
});
