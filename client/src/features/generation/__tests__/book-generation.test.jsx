import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import AppRoutes from '../../../routes/AppRoutes.jsx';
import { createQueryClient } from '../../../lib/queryClient.js';
import { ToastProvider } from '../../../components/common/index.js';
import { useAuthStore } from '../../../store/authStore.js';

function envelope(data) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ success: true, data, message: 'OK', meta: {}, error: null }),
  };
}

function failure(status, code, message, details = null) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => ({ success: false, data: null, message, meta: {}, error: { code, details } }),
  };
}

const page = (order, status, extra = {}) => ({
  pageId: `p${order}`,
  order,
  title: `Page ${order}`,
  status,
  error: null,
  imageUrl: status === 'ready' ? `/api/v1/media/m${order}?exp=1&sig=x` : null,
  ...extra,
});

/** Mirrors the server's own accounting, including `pending` vs `inFlight`. */
function progress(pages) {
  const count = (status) => pages.filter((p) => p.status === status).length;

  const ready = count('ready');
  const failed = count('failed');

  return {
    total: pages.length,
    ready,
    failed,
    pending: count('pending'),
    inFlight: count('queued') + count('generating'),
    percent: pages.length ? Math.round((ready / pages.length) * 100) : 0,
    // A book illustrated by hand is not on a run, so every stage field is off.
    // The autopilot cases are covered where the run itself is, in the server
    // suite and in the agent's own hand-off test.
    autopilot: { enabled: false, stage: null, isRunning: false, characterImages: null, error: null },
    characters: [],
    pages,
  };
}

function api({ pages, startResponse } = {}) {
  return vi.fn(async (url, init) => {
    const path = String(url);
    const method = init?.method ?? 'GET';

    if (path.includes('/progress')) return envelope(progress(pages));
    if (path.includes('/auth/session')) {
      return envelope({ user: { id: 'u1', name: 'Krishna Yadav' } });
    }
    if (path.includes('/images') && method === 'POST') {
      return startResponse ?? envelope({ started: pages.length });
    }
    return envelope({ ok: true });
  });
}

function renderGeneration() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/books/book-1/generate']}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const callsTo = (mock, fragment, method) =>
  mock.mock.calls.filter(
    ([url, init]) => String(url).includes(fragment) && (!method || (init?.method ?? 'GET') === method),
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

describe('illustrating a book', () => {
  it('shows each page with its own state', async () => {
    vi.stubGlobal(
      'fetch',
      api({ pages: [page(1, 'ready'), page(2, 'generating'), page(3, 'pending')] }),
    );
    renderGeneration();

    expect(await screen.findByRole('heading', { name: 'Illustrate Your Book' })).toBeInTheDocument();

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Illustrating')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    expect(screen.getByText('1 of 3 ready')).toBeInTheDocument();
  });

  it('renders the illustration a finished page produced', async () => {
    vi.stubGlobal('fetch', api({ pages: [page(1, 'ready')] }));
    renderGeneration();

    const image = await screen.findByRole('img', { name: 'Page 1: Page 1' });
    expect(image).toHaveAttribute('src', expect.stringContaining('/api/v1/media/m1'));
  });

  it('starts the whole book', async () => {
    const fetchMock = api({ pages: [page(1, 'pending'), page(2, 'pending')] });
    vi.stubGlobal('fetch', fetchMock);
    renderGeneration();

    await userEvent.click(await screen.findByRole('button', { name: /Illustrate all pages/ }));

    await waitFor(() =>
      expect(callsTo(fetchMock, '/generation/books/book-1/images', 'POST')).toHaveLength(1),
    );
  });

  it('shows a partial failure as partial — the successes stay visible', async () => {
    vi.stubGlobal(
      'fetch',
      api({
        pages: [
          page(1, 'ready'),
          page(2, 'failed', { error: 'provider said no' }),
          page(3, 'ready'),
        ],
      }),
    );
    renderGeneration();

    expect(await screen.findByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('provider said no')).toBeInTheDocument();
    // The two that worked are still shown, not hidden behind one error.
    expect(screen.getAllByText('Ready')).toHaveLength(2);
    expect(screen.getByText('2 of 3 ready · 1 failed')).toBeInTheDocument();
    expect(screen.getByText(/1 page needs another go/i)).toBeInTheDocument();
  });

  it('retries a single failed page without touching the others', async () => {
    const fetchMock = api({
      pages: [page(1, 'ready'), page(2, 'failed', { error: 'provider said no' })],
    });
    vi.stubGlobal('fetch', fetchMock);
    renderGeneration();

    await userEvent.click(await screen.findByRole('button', { name: 'Retry this page' }));

    await waitFor(() => {
      const retries = callsTo(fetchMock, '/books/book-1/pages/p2/image', 'POST');
      expect(retries).toHaveLength(1);
    });
    // Retrying one page must not restart the whole book.
    expect(callsTo(fetchMock, '/generation/books/book-1/images', 'POST')).toHaveLength(0);
  });

  it('reports completion and offers the editor', async () => {
    vi.stubGlobal('fetch', api({ pages: [page(1, 'ready'), page(2, 'ready')] }));
    renderGeneration();

    // The footer now names the finished thing rather than the next screen: the
    // book is the point, and reading it is what someone wants next.
    expect(await screen.findByText('Your book is ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Read your book/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit pages/ })).toBeInTheDocument();
    // Nothing left to do, so the primary action is spent.
    expect(screen.getByRole('button', { name: /Illustrate all pages/ })).toBeDisabled();
  });

  it('says plainly when nothing has been illustrated yet', async () => {
    vi.stubGlobal('fetch', api({ pages: [page(1, 'pending'), page(2, 'pending')] }));
    renderGeneration();

    expect(await screen.findByText(/nothing has been illustrated yet/i)).toBeInTheDocument();
  });

  it('offers a retry when the progress itself cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => failure(500, 'INTERNAL_ERROR', 'boom')),
    );
    render(
      <QueryClientProvider
        client={(() => {
          const client = createQueryClient();
          const defaults = client.getDefaultOptions();
          client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
          return client;
        })()}
      >
        <ToastProvider>
          <MemoryRouter initialEntries={['/books/book-1/generate']}>
            <AppRoutes />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load this book/i);
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
