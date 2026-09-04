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

const PAGES = [
  {
    _id: 'p1',
    order: 1,
    title: 'The Map Behind the Bookshelf',
    narration: 'Aarav found an old map tucked inside a book.',
    imageUrl: '/api/v1/media/m1?exp=1&sig=x',
    layout: { preset: 'spread' },
  },
  {
    _id: 'p2',
    order: 2,
    title: 'The Forest Gate',
    narration: 'The gate creaked open before he could knock.',
    imageUrl: null,
    layout: { preset: 'spread' },
  },
];

function api({ coverUrl = '/api/v1/media/cover?exp=1&sig=y', preset } = {}) {
  return vi.fn(async (url) => {
    const path = String(url);

    if (path.includes('/generation/books/b1/cover')) {
      return envelope({
        title: 'Aarav and the Whispering Forest',
        subtitle: 'A Magical Adventure',
        coverUrl,
        source: coverUrl ? 'generated' : null,
        isGenerated: Boolean(coverUrl),
        job: null,
        inFlight: false,
      });
    }

    if (path.includes('/books/b1')) {
      return envelope({
        book: {
          _id: 'b1',
          title: 'Aarav and the Whispering Forest',
          author: 'Krishna Yadav',
          description: 'A boy, a firefly, and a forest that remembers.',
          pageCount: 2,
        },
        pages: preset ? PAGES.map((p) => ({ ...p, layout: { preset } })) : PAGES,
        characters: [],
        estimate: { storyPages: 2, illustrations: 4, charactersToDesign: 0 },
      });
    }

    return envelope([]);
  });
}

/** Waits out a page turn: settled means exactly one copy of the page is left. */
const settled = (text) => waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());

function renderReader() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/books/b1/read']}>
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

describe('reading a book in the browser', () => {
  it('opens on the cover and shows nothing but the book', async () => {
    vi.stubGlobal('fetch', api());
    renderReader();

    expect(
      await screen.findByRole('heading', { name: 'Aarav and the Whispering Forest', level: 1 }),
    ).toBeInTheDocument();
    // The cover is the same object the library cards draw, so the artwork names
    // itself the same way there and here: the title is inside the picture.
    expect(screen.getByAltText('Aarav and the Whispering Forest')).toBeInTheDocument();
    expect(screen.getByText('Cover')).toBeInTheDocument();

    // The app is not around it: a book being read is not a screen of the app.
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  });

  it('turns a page at a time, forwards and back', async () => {
    vi.stubGlobal('fetch', api());
    renderReader();

    await screen.findByText('Cover');

    // On a phone an opening is two turns: the illustration, then the words. The
    // rhythm of the book survives; only the fold is missing.
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Page 1 of 2 · illustration')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

    // A turning leaf carries the page it is turning to, so for the length of the
    // turn that page is on screen twice — `getByText` refusing two of them is
    // exactly the condition to wait on.
    await settled('The Map Behind the Bookshelf');
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(await screen.findByText('Page 1 of 2 · illustration')).toBeInTheDocument();
  });

  it('runs to the back board and stops there', async () => {
    vi.stubGlobal('fetch', api());
    renderReader();

    await screen.findByText('Cover');

    // Cover, two leaves per page, then the back board: six for a two-page book.
    for (let turn = 0; turn < 5; turn += 1) {
      await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    }

    expect(await screen.findByText('Back cover')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('turns pages with the arrow keys, the way a book is read', async () => {
    vi.stubGlobal('fetch', api());
    renderReader();

    await screen.findByText('Cover');

    // Cover, then the picture, then the words — two turns to the first page.
    await userEvent.keyboard('{ArrowRight}');
    expect(await screen.findByText('Page 1 of 2 · illustration')).toBeInTheDocument();

    await userEvent.keyboard('{ArrowRight}');
    await settled('The Map Behind the Bookshelf');

    await userEvent.keyboard('{ArrowLeft}');
    await userEvent.keyboard('{ArrowLeft}');
    expect(await screen.findByText('Cover')).toBeInTheDocument();
  });

  it('starts on page one when the book has no cover yet', async () => {
    vi.stubGlobal('fetch', api({ coverUrl: null }));
    renderReader();

    // No blank leaf in front of the book: the first thing is page one's picture.
    expect(await screen.findByText('Page 1 of 2 · illustration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });

  it('lays a page out as the reference does: the picture on one leaf, the words on the next', async () => {
    vi.stubGlobal('fetch', api());
    renderReader();

    await screen.findByText('Cover');

    // The illustration is a leaf of its own, full bleed and with no text on it.
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Page 1 of 2 · illustration')).toBeInTheDocument();
    // `getByAltText` rather than `getByRole('img')`: a leaf that is not showing
    // is hidden by the flipbook, and role queries only see the accessibility
    // tree. That is the right behaviour — a closed page should not be announced.
    expect(screen.getByAltText('Page 1: The Map Behind the Bookshelf')).toBeInTheDocument();

    // Its words are the leaf that faces it, with the furniture the reference
    // prints in the outer margin: the author above, the folio below.
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await settled('The Map Behind the Bookshelf');

    // Every leaf of words carries the running head, so the assertion has to name
    // the leaf: this is page one's, and it wears page one's folio.
    const leaf = screen.getByText('The Map Behind the Bookshelf').closest('[data-density]');
    expect(within(leaf).getByText('Krishna Yadav')).toBeInTheDocument();
    expect(within(leaf).getByText('1')).toBeInTheDocument();
  });

  it('carries a back board with the book on it', async () => {
    vi.stubGlobal('fetch', api());
    renderReader();

    await screen.findByText('Cover');
    for (let turn = 0; turn < 5; turn += 1) {
      await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    }

    // A real back cover carries the blurb, so this one carries the description
    // the book already has rather than something invented for it.
    expect(await screen.findByText('Back cover')).toBeInTheDocument();
    expect(screen.getByText('A boy, a firefly, and a forest that remembers.')).toBeInTheDocument();
  });

  it('gives a single-leaf layout one leaf, not the same page on both sides', async () => {
    // The bug as reported: every page was handed two leaves, and a preset that
    // puts the picture and the words on one leaf ignores which half it was asked
    // for — so it drew itself twice, and the book opened on two copies of the
    // same page. How many leaves a page needs is its layout's decision.
    vi.stubGlobal('fetch', api({ preset: 'image-top' }));
    renderReader();

    await screen.findByText('Cover');

    // Every leaf is in the document at once, so a page drawn twice is two.
    expect(await screen.findAllByText('The Map Behind the Bookshelf')).toHaveLength(1);
    expect(screen.getAllByText('The Forest Gate')).toHaveLength(1);
  });

  it('closes back to the screen it was opened from', async () => {
    vi.stubGlobal('fetch', api());
    renderReader();

    await screen.findByText('Cover');
    await userEvent.click(screen.getByRole('button', { name: 'Close the book' }));

    expect(
      await screen.findByRole('heading', { name: 'Preview & Export Your Book' }),
    ).toBeInTheDocument();
  });
});
