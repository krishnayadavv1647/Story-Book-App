import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import AppRoutes from '../../../routes/AppRoutes.jsx';
import { createQueryClient } from '../../../lib/queryClient.js';
import { ToastProvider } from '../../../components/common/index.js';
import { useAuthStore } from '../../../store/authStore.js';

const BOOKS = [
  { _id: 'b1', title: 'Aarav and the Whispering Forest', status: 'ready', pageCount: 10, genre: 'Magical Adventure' },
  { _id: 'b2', title: 'Little Moon Keeper', status: 'generating', pageCount: 8 },
];

function envelope(data, meta = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ success: true, data, message: 'OK', meta, error: null }),
  };
}

function serverError() {
  return {
    ok: false,
    status: 500,
    headers: { get: () => null },
    json: async () => ({
      success: false,
      data: null,
      message: 'Something went wrong',
      meta: {},
      error: { code: 'INTERNAL_ERROR', details: null },
    }),
  };
}

/** Routes the mock by path so each section gets its own shape. */
function api({ books = BOOKS, failBooks = false } = {}) {
  return vi.fn(async (url) => {
    const path = String(url);
    if (path.includes('/books/summary')) return envelope({ total: books.length, byStatus: {} });
    if (failBooks) return serverError();
    return envelope(books, { pagination: { page: 1, limit: 12, total: books.length, totalPages: 1 } });
  });
}

/**
 * `retry: false` is for the failure case only. The real policy retries a 5xx
 * twice with backoff, which is correct in production but would leave the error
 * UI unsettled for seconds here — and it is the error UI under test, not the
 * retry policy.
 */
function renderDashboard({ retry } = {}) {
  const client = createQueryClient();
  if (retry !== undefined) {
    const defaults = client.getDefaultOptions();
    client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry } });
  }

  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u1', name: 'Krishna Yadav' },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dashboard', () => {
  it('renders the hero and its CTA', async () => {
    vi.stubGlobal('fetch', api());
    renderDashboard();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('STORYBOOK');
    expect(screen.getByText('Create Beautiful Illustrated Books In Minutes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create book/i })).toBeInTheDocument();
  });

  it('shows real books under the hero, and no invented ones', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderDashboard();

    // The library is the first thing below the hero now: the tab strip of six
    // hard-coded "templates" that used to sit here was not real content.
    await screen.findByRole('link', { name: /aarav and the whispering forest/i });

    expect(screen.queryByRole('tab', { name: 'Templates' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Genre' })).not.toBeInTheDocument();
    expect(screen.queryByText(/the map behind the bookshelf/i)).not.toBeInTheDocument();

    // And nothing asks the server for a catalogue any more.
    const asked = fetchMock.mock.calls.map(([url]) => String(url));
    expect(asked.some((url) => /\/books\/(templates|genres)/.test(url))).toBe(false);
  });

  it('shows the library count and the books themselves', async () => {
    vi.stubGlobal('fetch', api());
    renderDashboard();

    const heading = await screen.findByRole('heading', { name: 'Your Storybooks' });
    expect(heading).toBeInTheDocument();
    expect(await screen.findByText('2')).toBeInTheDocument();

    const ready = await screen.findByRole('link', { name: /aarav and the whispering forest/i });
    expect(ready).toHaveAttribute('href', '/books/b1');
    expect(within(ready).getByText('10 pages • Magical Adventure')).toBeInTheDocument();
  });

  it('flags a book that is not finished, and leaves a ready one unbadged', async () => {
    vi.stubGlobal('fetch', api());
    renderDashboard();

    // Scoped to the card, not to its link: the status chip sits on the cover but
    // outside the link, so that a book changing state does not rename the link.
    const generating = (await screen.findByRole('link', { name: /little moon keeper/i })).closest(
      'li',
    );
    expect(within(generating).getByText('Generating')).toBeInTheDocument();

    const ready = screen.getByRole('link', { name: /aarav and the whispering forest/i }).closest('li');
    expect(within(ready).queryByText('Ready')).not.toBeInTheDocument();
  });

  it('prints the title once, on the cover, with no caption band beneath it', async () => {
    vi.stubGlobal('fetch', api());
    renderDashboard();

    const link = await screen.findByRole('link', { name: /aarav and the whispering forest/i });

    // The white label that used to repeat the title under every cover is gone —
    // the cover carries it now, so a second copy would say everything twice.
    expect(screen.getAllByText('Aarav and the Whispering Forest')).toHaveLength(1);
    expect(link).toContainElement(screen.getByText('Aarav and the Whispering Forest'));

    // Off the paint, still announced.
    expect(within(link).getByText('10 pages • Magical Adventure')).toHaveClass('sr-only');
  });

  it('lets a generated cover carry the title, rather than drawing one', async () => {
    vi.stubGlobal(
      'fetch',
      api({
        books: [
          { ...BOOKS[0], coverUrl: 'https://cdn/cover.png', coverSource: 'generated' },
        ],
      }),
    );
    renderDashboard();

    // The title is inside the artwork, so it reaches a screen reader as the
    // image's own description and is not set in type a second time.
    const cover = await screen.findByRole('img', { name: 'Aarav and the Whispering Forest' });
    expect(cover).toHaveAttribute('src', 'https://cdn/cover.png');
    expect(screen.queryByText('Aarav and the Whispering Forest')).not.toBeInTheDocument();
  });

  it('still names a book whose thumbnail is only a page standing in', async () => {
    vi.stubGlobal(
      'fetch',
      api({ books: [{ ...BOOKS[0], coverUrl: 'https://cdn/page-1.png', coverSource: 'page' }] }),
    );
    renderDashboard();

    // A page illustration has no lettering, so dropping the caption band would
    // otherwise leave the book with no title anywhere. The card sets it over
    // the artwork instead, and the image goes back to being decoration.
    expect(await screen.findByText('Aarav and the Whispering Forest')).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Aarav and the Whispering Forest' }),
    ).not.toBeInTheDocument();
  });

  it('offers a way in when the library is empty', async () => {
    vi.stubGlobal('fetch', api({ books: [] }));
    renderDashboard();

    expect(await screen.findByText('No storybooks yet')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create your first storybook/i }),
    ).toBeInTheDocument();
  });

  it('reports a failed library load and offers a retry', async () => {
    vi.stubGlobal('fetch', api({ failBooks: true }));
    renderDashboard({ retry: false });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load your storybooks');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    // The section failing must not take the rest of the page down.
    expect(screen.getByRole('heading', { name: 'Your Storybooks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create book/i })).toBeInTheDocument();
  });

  it('starts a story from the section action', async () => {
    vi.stubGlobal('fetch', api());
    renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: /create storybook/i }));
    expect(await screen.findByLabelText(/what story would you like to create/i)).toBeInTheDocument();
  });

});
