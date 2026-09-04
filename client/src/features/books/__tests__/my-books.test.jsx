import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import AppRoutes from '../../../routes/AppRoutes.jsx';
import { createQueryClient } from '../../../lib/queryClient.js';
import { ToastProvider } from '../../../components/common/index.js';
import { useAuthStore } from '../../../store/authStore.js';

const BOOKS = [
  { _id: 'b1', title: 'Aarav and the Whispering Forest', status: 'ready', pageCount: 10 },
  { _id: 'b2', title: 'The Shy Dragon', status: 'plan_ready', pageCount: 6 },
  { _id: 'b3', title: 'Little Moon Keeper', status: 'published', pageCount: 8 },
];

function envelope(data, meta = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ success: true, data, message: 'OK', meta, error: null }),
  };
}

function api({ books = BOOKS } = {}) {
  // A copy, so a delete in one test cannot leak into the next.
  let shelf = [...books];

  return vi.fn(async (url, init) => {
    const path = String(url);

    if ((init?.method ?? 'GET') === 'DELETE') {
      const id = path.split('/books/')[1];
      shelf = shelf.filter((book) => book._id !== id);
      return envelope({ deleted: true, pages: 1 });
    }

    if (path.includes('/books')) {
      const status = new URL(path, 'http://x').searchParams.get('status');
      const items = status ? shelf.filter((book) => book.status === status) : shelf;
      return envelope(items, { pagination: { page: 1, limit: 48, total: items.length } });
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

const callsTo = (mock, fragment) =>
  mock.mock.calls.filter(([url]) => String(url).includes(fragment));

beforeEach(() => {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u1', name: 'Krishna Yadav' },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('my books', () => {
  it('lists every book with the state it is in', async () => {
    vi.stubGlobal('fetch', api());
    renderAt('/books');

    expect(await screen.findByRole('heading', { name: 'My Books', level: 1 })).toBeInTheDocument();

    expect(await screen.findByText('Aarav and the Whispering Forest')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Plan ready')).toBeInTheDocument();
    expect(screen.getByText('10 pages')).toBeInTheDocument();
  });

  it('leaves a published book unchipped', async () => {
    vi.stubGlobal('fetch', api());
    renderAt('/books');

    // Published and failed carry no chip — the owner's rule, in
    // `UNBADGED_STATUSES`. The word still appears on the filter tab, so the
    // assertion has to be scoped to the card.
    const card = (await screen.findByText('Little Moon Keeper')).closest('li');
    expect(within(card).queryByText('Published')).not.toBeInTheDocument();
  });

  it('sends an unfinished book to the step it is actually at', async () => {
    vi.stubGlobal('fetch', api());
    renderAt('/books');

    await screen.findByRole('heading', { name: 'My Books', level: 1 });

    // A book whose plan is ready belongs on the plan screen, not the editor.
    expect(await screen.findByRole('link', { name: 'The Shy Dragon' })).toHaveAttribute(
      'href',
      '/books/b2/plan',
    );
    expect(screen.getByRole('link', { name: 'Aarav and the Whispering Forest' })).toHaveAttribute(
      'href',
      '/books/b1/editor',
    );
  });

  it('filters to published books', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/books');

    await screen.findByRole('heading', { name: 'My Books', level: 1 });
    await userEvent.click(screen.getByRole('tab', { name: /Published/ }));

    await waitFor(() =>
      expect(callsTo(fetchMock, 'status=published').length).toBeGreaterThan(0),
    );
  });

  it('says plainly when there is nothing published yet', async () => {
    vi.stubGlobal('fetch', api({ books: [] }));
    renderAt('/published');

    expect(
      await screen.findByRole('heading', { name: 'Published Books', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Nothing published yet/i)).toBeInTheDocument();
  });

  it('offers a retry when the library cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        headers: { get: () => null },
        json: async () => ({ success: false, data: null, message: 'boom', meta: {}, error: { code: 'INTERNAL_ERROR' } }),
      })),
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
          <MemoryRouter initialEntries={['/books']}>
            <AppRoutes />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/could not load your books/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('deletes a book, but only after saying what goes with it', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/books');

    const card = (await screen.findByText('The Shy Dragon')).closest('li');
    await userEvent.click(within(card).getByRole('button', { name: /Delete The Shy Dragon/ }));

    // The dialog says what is lost and what is not, because a delete that only
    // asks "are you sure?" is asking about nothing.
    expect(await screen.findByText(/Delete “The Shy Dragon”\?/)).toBeInTheDocument();
    expect(screen.getByText(/6 pages and illustrations go with it/)).toBeInTheDocument();
    expect(screen.getByText(/Characters stay in your library/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete this book' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, '/books/b2').length).toBeGreaterThan(0),
    );
    await waitFor(() => expect(screen.queryByText('The Shy Dragon')).not.toBeInTheDocument());

    // The rest of the shelf is untouched.
    expect(screen.getByText('Aarav and the Whispering Forest')).toBeInTheDocument();
  });

  it('leaves the book alone when the dialog is dismissed', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/books');

    const card = (await screen.findByText('The Shy Dragon')).closest('li');
    await userEvent.click(within(card).getByRole('button', { name: /Delete The Shy Dragon/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('The Shy Dragon')).toBeInTheDocument();
    expect(callsTo(fetchMock, '/books/b2')).toHaveLength(0);
  });
});
