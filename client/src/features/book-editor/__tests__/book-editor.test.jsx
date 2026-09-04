import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import AppRoutes from '../../../routes/AppRoutes.jsx';
import { createQueryClient } from '../../../lib/queryClient.js';
import { ToastProvider } from '../../../components/common/index.js';
import { useAuthStore } from '../../../store/authStore.js';

const AARAV = { _id: 'c1', name: 'Aarav', role: 'main' };
const LUMI = { _id: 'c2', name: 'Lumi', role: 'supporting' };

const makePage = (order, extra = {}) => ({
  _id: `p${order}`,
  order,
  title: `Page ${order}`,
  narration: `Narration ${order}`,
  illustrationPrompt: `Scene ${order}`,
  characterIds: order === 1 ? ['c1'] : [],
  characterConsistency: true,
  layout: { preset: 'image-top', backgroundColor: '#FFFFFF' },
  typography: { fontSize: 18, lineHeight: 1.5, textAlign: 'left', color: '#111111' },
  imageUrl: order === 1 ? '/api/v1/media/m1?exp=1&sig=x' : null,
  ...extra,
});

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

function api({ pages = [makePage(1), makePage(2), makePage(3)], overrides = {} } = {}) {
  const state = pages.map((page) => ({ ...page }));

  return vi.fn(async (url, init) => {
    const path = String(url);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : null;

    for (const [fragment, handler] of Object.entries(overrides)) {
      if (path.includes(fragment)) return handler(method, body);
    }

    if (path.includes('/auth/session')) {
      return envelope({ user: { id: 'u1', name: 'Krishna Yadav' } });
    }

    const patch = path.match(/\/pages\/(p\d+)$/);
    if (patch && method === 'PATCH') {
      const page = state.find((p) => p._id === patch[1]);
      // Mirrors the server: nested keys merge rather than replace.
      for (const [key, value] of Object.entries(body)) {
        page[key] =
          value !== null && typeof value === 'object' && !Array.isArray(value)
            ? { ...page[key], ...value }
            : value;
      }
      return envelope(page);
    }

    if (path.includes('/magic-layout')) {
      const page = state.find((p) => path.includes(p._id));
      page.layout = { ...page.layout, preset: 'text-only' };
      return envelope({ page, preset: 'text-only', reason: 'This page has no illustration yet.' });
    }

    if (path.includes('/rewrite')) {
      const page = state.find((p) => path.includes(p._id));
      page.narration = 'A map that knew his name.';
      return envelope({ page });
    }

    if (path.match(/\/books\/[^/]+$/) && method === 'GET') {
      return envelope({
        book: { _id: 'book-1', title: 'Aarav and the Whispering Forest', status: 'draft' },
        pages: state,
        characters: [AARAV, LUMI],
        estimate: { storyPages: 3, illustrations: 5 },
      });
    }

    return envelope({ ok: true });
  });
}

function renderEditor() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/books/book-1/editor']}>
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

describe('the book editor', () => {
  it('shows the book, its pages and the selected page', async () => {
    vi.stubGlobal('fetch', api());
    renderEditor();

    expect(
      await screen.findByRole('heading', { name: 'Aarav and the Whispering Forest' }),
    ).toBeInTheDocument();

    // The rail lists every page; the first is selected by default.
    expect(screen.getByRole('button', { name: /Page 1 — Page 1/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: /Page 3 — Page 3/ })).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('saves an edit to the page text', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    await screen.findByRole('heading', { name: 'Aarav and the Whispering Forest' });
    await userEvent.click(screen.getByRole('tab', { name: 'Text' }));

    const title = await screen.findByLabelText('Page title');
    await userEvent.clear(title);
    await userEvent.type(title, 'The Map');

    await waitFor(
      () => expect(callsTo(fetchMock, '/pages/p1', 'PATCH')).not.toHaveLength(0),
      { timeout: 3000 },
    );

    const sent = JSON.parse(callsTo(fetchMock, '/pages/p1', 'PATCH').at(-1)[1].body);
    expect(sent.title).toBe('The Map');
  });

  it('writes a layout change straight away', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    await screen.findByRole('heading', { name: 'Aarav and the Whispering Forest' });
    // The layout swatches live in the Page tab; the inspector now opens on Text.
    await userEvent.click(screen.getByRole('tab', { name: 'Page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Illustration beside the text, on the left' }));

    await waitFor(() => expect(callsTo(fetchMock, '/pages/p1', 'PATCH')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/pages/p1', 'PATCH')[0][1].body)).toEqual({
      layout: { preset: 'image-left' },
    });
  });

  it('undoes a layout change back to what it was', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    await screen.findByRole('heading', { name: 'Aarav and the Whispering Forest' });
    // The layout swatches live in the Page tab; the inspector now opens on Text.
    await userEvent.click(screen.getByRole('tab', { name: 'Page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Illustration beside the text, on the left' }));

    const undo = screen.getByRole('button', { name: 'Undo' });
    await waitFor(() => expect(undo).not.toBeDisabled());
    await userEvent.click(undo);

    await waitFor(() => expect(callsTo(fetchMock, '/pages/p1', 'PATCH')).toHaveLength(2));
    // Undo puts back the value the page actually had, not a guess.
    expect(JSON.parse(callsTo(fetchMock, '/pages/p1', 'PATCH')[1][1].body)).toEqual({
      layout: { preset: 'image-top' },
    });
  });

  it('explains the layout the server picked', async () => {
    vi.stubGlobal('fetch', api());
    renderEditor();

    await screen.findByRole('heading', { name: 'Aarav and the Whispering Forest' });
    await userEvent.click(screen.getByRole('button', { name: /Magic Layout/ }));

    expect(await screen.findByText(/no illustration yet/i)).toBeInTheDocument();
  });

  it('rewrites a page with an instruction', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    await screen.findByRole('heading', { name: 'Aarav and the Whispering Forest' });
    await userEvent.click(screen.getByRole('button', { name: /Rewrite with AI/ }));

    await userEvent.type(
      await screen.findByLabelText('Rewrite instruction'),
      'Make it gentler',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Rewrite' }));

    await waitFor(() => expect(callsTo(fetchMock, '/rewrite', 'POST')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/rewrite', 'POST')[0][1].body).instruction).toBe(
      'Make it gentler',
    );
  });

  it('lets the author edit the page text by hand and keeps what they typed', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    await screen.findByRole('heading', { name: 'Aarav and the Whispering Forest' });

    const textarea = screen.getByLabelText('Page text');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'A brand new sentence.');

    // The words the author typed stay on screen — not reverted by the save.
    expect(textarea).toHaveValue('A brand new sentence.');

    // They are saved as a manual edit, never routed through the AI rewrite.
    await waitFor(
      () => {
        const call = callsTo(fetchMock, '/pages/p1', 'PATCH').at(-1);
        expect(call).toBeDefined();
        expect(JSON.parse(call[1].body).narration).toBe('A brand new sentence.');
      },
      { timeout: 2500 },
    );
    expect(callsTo(fetchMock, '/rewrite', 'POST')).toHaveLength(0);
  });

  it('changes the typeface without disturbing the other type settings', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    await screen.findByRole('heading', { name: 'Aarav and the Whispering Forest' });

    await userEvent.selectOptions(
      screen.getByLabelText('Typeface'),
      '"Poppins", system-ui, sans-serif',
    );

    await waitFor(() => {
      const call = callsTo(fetchMock, '/pages/p1', 'PATCH').at(-1);
      expect(call).toBeDefined();
      // Only the font changes; size, line height and colour are left alone.
      expect(JSON.parse(call[1].body)).toEqual({
        typography: { fontFamily: '"Poppins", system-ui, sans-serif' },
      });
    });
  });

  it('asks before deleting a page, and does not delete when refused', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    await screen.findByRole('heading', { name: 'Aarav and the Whispering Forest' });
    await userEvent.click(screen.getByRole('button', { name: /Delete Page/ }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Delete page 1\?/i)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(callsTo(fetchMock, '/pages/p1', 'DELETE')).toHaveLength(0);
  });

  it('turns character consistency off for one page', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();

    await screen.findByRole('heading', { name: 'Aarav and the Whispering Forest' });
    await userEvent.click(screen.getByRole('tab', { name: 'Image' }));

    const toggle = await screen.findByRole('switch', { name: 'Character consistency' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);

    await waitFor(() => expect(callsTo(fetchMock, '/pages/p1', 'PATCH')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/pages/p1', 'PATCH')[0][1].body)).toEqual({
      characterConsistency: false,
    });
  });

  it('moves between pages from the bottom bar', async () => {
    vi.stubGlobal('fetch', api());
    renderEditor();

    await screen.findByRole('heading', { name: 'Aarav and the Whispering Forest' });
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /Next Page/ }));
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).not.toBeDisabled();
  });

  it('offers a retry when the book cannot be loaded', async () => {
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
          <MemoryRouter initialEntries={['/books/book-1/editor']}>
            <AppRoutes />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/could not load this book/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
