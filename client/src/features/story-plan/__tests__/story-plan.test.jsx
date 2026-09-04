import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import AppRoutes from '../../../routes/AppRoutes.jsx';
import { createQueryClient } from '../../../lib/queryClient.js';
import { ToastProvider } from '../../../components/common/index.js';
import { useAuthStore } from '../../../store/authStore.js';

const CHARACTERS = [
  { _id: 'c1', name: 'Aarav', role: 'main', status: 'draft' },
  { _id: 'c2', name: 'Lumi', role: 'supporting', status: 'draft' },
];

const PAGES = [
  {
    _id: 'p1',
    order: 1,
    title: 'The Map Behind the Bookshelf',
    narration: 'Aarav loved stories more than anything.',
    sceneDescription: 'A cozy bedroom with bookshelves.',
    characterIds: ['c1'],
    location: 'Bedroom',
  },
  {
    _id: 'p2',
    order: 2,
    title: 'The Forest Gate',
    narration: 'The gate creaked open.',
    sceneDescription: 'A mossy stone gate.',
    characterIds: ['c1'],
    location: 'Whispering Forest',
  },
  {
    _id: 'p3',
    order: 3,
    title: 'The Frightened Firefly',
    narration: 'A small light trembled.',
    sceneDescription: 'A dark clearing.',
    characterIds: ['c1', 'c2'],
    location: 'Clearing',
  },
];

const BOOK = {
  _id: 'book-1',
  title: 'Aarav and the Whispering Forest',
  description: 'A curious explorer discovers a hidden forest.',
  ageGroup: '6-9',
  language: 'English',
  genre: 'Magical Adventure',
  artStyle: '3D Storybook',
  moral: 'Kindness and courage',
  pageCount: 3,
};

const ESTIMATE = { storyPages: 3, illustrations: 5, charactersToDesign: 2 };

function envelope(data) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ success: true, data, message: 'OK', meta: {}, error: null }),
  };
}

function api() {
  return vi.fn(async (url, init) => {
    const path = String(url);
    const method = init?.method ?? 'GET';

    if (path.includes('/books/book-1') && method === 'GET' && !path.includes('/pages')) {
      return envelope({ book: BOOK, pages: PAGES, characters: CHARACTERS, estimate: ESTIMATE });
    }
    return envelope({ ok: true });
  });
}

function renderPlan() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/books/book-1/plan']}>
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

describe('review your story plan', () => {
  it('renders the book information the planner produced', async () => {
    vi.stubGlobal('fetch', api());
    renderPlan();

    expect(await screen.findByRole('heading', { name: 'Review Your Story Plan' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Aarav and the Whispering Forest');
    expect(screen.getByLabelText('Age Group')).toHaveValue('6-9');
    expect(screen.getByLabelText('Genre')).toHaveValue('Magical Adventure');
    expect(screen.getByLabelText('Pages')).toHaveValue('3');
  });

  it('shows the summary rail, the cast and a real estimate', async () => {
    vi.stubGlobal('fetch', api());
    renderPlan();

    // "Aarav" also appears as a page tag, so scope to the labelled region.
    const cast = await screen.findByRole('region', { name: 'Characters Detected' });
    expect(within(cast).getByText('Aarav')).toBeInTheDocument();
    expect(within(cast).getByText('Main Character')).toBeInTheDocument();
    expect(within(cast).getAllByText('Needs Design')).toHaveLength(2);

    expect(screen.getByText('3 story pages')).toBeInTheDocument();
    expect(screen.getByText('5 illustrations including covers')).toBeInTheDocument();
  });

  it('opens the first page and leaves the rest collapsed', async () => {
    vi.stubGlobal('fetch', api());
    renderPlan();

    expect(await screen.findByLabelText('Narration')).toHaveValue(
      'Aarav loved stories more than anything.',
    );
    expect(screen.getByRole('button', { name: /Page 1 — The Map Behind/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: /Page 2 — The Forest Gate/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

describe('autosaving edits', () => {
  it('saves a book field without a save button', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPlan();

    const title = await screen.findByLabelText('Title');
    await userEvent.type(title, '!');

    await waitFor(
      () => {
        const patch = callsTo(fetchMock, '/books/book-1', 'PATCH');
        expect(patch.length).toBeGreaterThan(0);
        expect(JSON.parse(patch.at(-1)[1].body).title).toContain('Whispering Forest!');
      },
      { timeout: 3000 },
    );

    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
  });

  it('saves a page field to that page alone', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPlan();

    const narration = await screen.findByLabelText('Narration');
    await userEvent.type(narration, ' More.');

    await waitFor(
      () => {
        const patch = callsTo(fetchMock, '/books/book-1/pages/p1', 'PATCH');
        expect(patch.length).toBeGreaterThan(0);
        expect(JSON.parse(patch.at(-1)[1].body)).toEqual({
          narration: 'Aarav loved stories more than anything. More.',
        });
      },
      { timeout: 3000 },
    );

    // No other page was touched.
    expect(callsTo(fetchMock, '/pages/p2', 'PATCH')).toHaveLength(0);
  });
});

describe('outline structure', () => {
  it('adds a page', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPlan();

    await userEvent.click(await screen.findByRole('button', { name: 'Add Page' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, '/books/book-1/pages', 'POST')).toHaveLength(1),
    );
  });

  it('duplicates a page', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPlan();

    await userEvent.click(await screen.findByRole('button', { name: 'Duplicate page 2' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, '/pages/p2/duplicate', 'POST')).toHaveLength(1),
    );
  });

  it('confirms before deleting, and can be cancelled', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPlan();

    await userEvent.click(await screen.findByRole('button', { name: 'Delete page 2' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete page 2?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(callsTo(fetchMock, '/pages/p2', 'DELETE')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Delete page 2' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete page' }),
    );

    await waitFor(() => expect(callsTo(fetchMock, '/pages/p2', 'DELETE')).toHaveLength(1));
  });

  it('reorders from the keyboard, sending the complete new order', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPlan();

    const handle = await screen.findByRole('button', { name: /Reorder page 3/ });
    handle.focus();
    await userEvent.keyboard('{ArrowUp}');

    await waitFor(() => {
      const patch = callsTo(fetchMock, '/pages/reorder', 'PATCH');
      expect(patch).toHaveLength(1);
      // Page 3 moves above page 2; the whole list is sent, not a from/to pair.
      expect(JSON.parse(patch[0][1].body).order).toEqual(['p1', 'p3', 'p2']);
    });
  });

  it('offers reordering to keyboard users, not only to a mouse', async () => {
    vi.stubGlobal('fetch', api());
    renderPlan();

    const handles = await screen.findAllByRole('button', { name: /Reorder page/ });
    expect(handles).toHaveLength(3);
    for (const handle of handles) {
      expect(handle.tagName).toBe('BUTTON');
    }
  });
});

describe('tags', () => {
  it('removes a character from a page', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPlan();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Aarav from page 1' }),
    );

    await waitFor(
      () => {
        const patch = callsTo(fetchMock, '/pages/p1', 'PATCH');
        expect(JSON.parse(patch.at(-1)[1].body)).toEqual({ characterIds: [] });
      },
      { timeout: 3000 },
    );
  });

  it('adds a character that is not yet on the page', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPlan();

    await userEvent.selectOptions(
      await screen.findByLabelText('Add a character to page 1'),
      'c2',
    );

    await waitFor(
      () => {
        const patch = callsTo(fetchMock, '/pages/p1', 'PATCH');
        expect(JSON.parse(patch.at(-1)[1].body)).toEqual({ characterIds: ['c1', 'c2'] });
      },
      { timeout: 3000 },
    );
  });
});

describe('regenerating', () => {
  it('calls the regenerate endpoint for this book', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPlan();

    await userEvent.click(await screen.findByRole('button', { name: /Regenerate Plan/ }));

    await waitFor(() =>
      expect(callsTo(fetchMock, '/story/books/book-1/regenerate', 'POST')).toHaveLength(1),
    );
  });
});
