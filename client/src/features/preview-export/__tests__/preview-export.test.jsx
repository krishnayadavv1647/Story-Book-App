import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import AppRoutes from '../../../routes/AppRoutes.jsx';
import { createQueryClient } from '../../../lib/queryClient.js';
import { ToastProvider } from '../../../components/common/index.js';
import { useAuthStore } from '../../../store/authStore.js';

const page = (order, extra = {}) => ({
  _id: `p${order}`,
  order,
  title: `Page ${order}`,
  narration: `Narration ${order}`,
  layout: { preset: 'image-top', backgroundColor: '#FFFFFF' },
  typography: { fontSize: 18, lineHeight: 1.5, textAlign: 'left', color: '#111111' },
  imageUrl: `/api/v1/media/m${order}?exp=1&sig=x`,
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

const OK_REPORT = {
  ok: true,
  blocking: false,
  counts: { errors: 0, warnings: 0, info: 1 },
  issues: [],
};

// jsdom implements neither, and saving a blob needs both.
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();
});

function api({ pages = [page(1), page(2), page(3)], readiness, printReport, overrides = {} } = {}) {
  const state = { status: 'ready' };

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

    // The download is a real fetch now: the response is checked before anything
    // is written to disk, so the test has to answer with a file.
    if (path.includes('/api/v1/media/')) {
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name) => (name.toLowerCase() === 'content-type' ? 'application/pdf' : null),
        },
        blob: async () => new Blob(['%PDF-1.3'], { type: 'application/pdf' }),
      };
    }

    if (path.includes('/print-check')) {
      return envelope(printReport ?? OK_REPORT);
    }

    if (path.match(/\/books\/[^/]+$/) && method === 'PATCH') {
      return envelope({ _id: 'book-1', ...body });
    }

    if (path.includes('/export/options')) {
      return envelope({
        readiness: readiness ?? { total: 3, missingArt: [], missingText: [], ready: true },
        pageSizes: [
          { value: 'a4', label: 'A4' },
          { value: '8x10in', label: '8 × 10 in' },
        ],
        filename: {
          pdf: 'Aarav.pdf',
          png: 'Aarav.png',
          html: 'Aarav.html',
          print_pdf: 'Aarav.pdf',
          cover_spread: 'Aarav.png',
          cover_front: 'Aarav.png',
          cover_back: 'Aarav.png',
          png_pages: 'Aarav.zip',
        },
        estimatedSizeBytes: {
          pdf: 2_700_000,
          png: 4_200_000,
          html: 5_700_000,
          print_pdf: 9_900_000,
          cover_spread: 6_600_000,
          cover_front: 6_600_000,
          cover_back: 6_600_000,
          png_pages: 8_800_000,
        },
      });
    }

    if (path.includes('/export') && method === 'POST') {
      return envelope({
        _id: 'job-1',
        status: 'succeeded',
        pageCount: 5,
        downloadUrl: '/api/v1/media/export-1?exp=1&sig=x',
      });
    }

    if (path.includes('/publish') && method === 'POST') {
      state.status = body.published ? 'published' : 'ready';
      return envelope({ _id: 'book-1', status: state.status });
    }

    if (path.includes('/exports')) return envelope([]);

    if (path.match(/\/books\/[^/]+$/) && method === 'GET') {
      return envelope({
        book: { _id: 'book-1', title: 'Aarav and the Whispering Forest', status: state.status },
        pages,
        characters: [],
        estimate: {},
      });
    }

    return envelope({ ok: true });
  });
}

function renderPreview() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/books/book-1/preview']}>
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

describe('preview and export', () => {
  it('shows the book as a spread with the export panel beside it', async () => {
    vi.stubGlobal('fetch', api());
    renderPreview();

    expect(
      await screen.findByRole('heading', { name: 'Preview & Export Your Book' }),
    ).toBeInTheDocument();

    expect(screen.getByText('Pages 1–2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'PDF' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Aarav.pdf')).toBeInTheDocument();
    expect(screen.getByText('2.7 MB')).toBeInTheDocument();
    expect(screen.getByText(/All pages look good/i)).toBeInTheDocument();
  });

  it('says exactly which pages are unfinished, and still allows an export', async () => {
    vi.stubGlobal(
      'fetch',
      api({ readiness: { total: 3, missingArt: [2, 3], missingText: [], ready: false } }),
    );
    renderPreview();

    await screen.findByRole('heading', { name: 'Preview & Export Your Book' });

    expect(screen.getByText(/No illustration on pages 2, 3/i)).toBeInTheDocument();
    expect(screen.getByText(/those pages will simply be blank/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export & Download/ })).not.toBeDisabled();
  });

  it('saves the file as soon as the export finishes, without a second click', async () => {
    vi.stubGlobal('fetch', api());

    // The file is fetched and checked, then saved from a blob — so the proof is
    // the request for it plus the name the anchor was given.
    const clicked = [];
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function capture() {
      clicked.push({ href: this.getAttribute('href'), download: this.getAttribute('download') });
    };

    try {
      renderPreview();
      await screen.findByRole('heading', { name: 'Preview & Export Your Book' });
      await userEvent.click(screen.getByRole('button', { name: /Export & Download/ }));

      await waitFor(() => expect(clicked).toHaveLength(1));
      expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/v1/media/export-1'))).toBe(
        true,
      );
      expect(clicked[0].href).toBe('blob:mock-url');
      expect(clicked[0].download).toBe('Aarav.pdf');
    } finally {
      HTMLAnchorElement.prototype.click = realClick;
    }
  });

  it('refuses to save a download that did not come back as a file', async () => {
    // The bug this guards: an expired signed link answers with JSON, and a dev
    // server whose API is restarting answers with the app's own index.html.
    // Saving either under a .pdf name only fails later, when it is opened.
    vi.stubGlobal(
      'fetch',
      api({
        overrides: {
          '/api/v1/media/': () => ({
            ok: false,
            status: 403,
            headers: { get: () => 'application/json' },
            blob: async () => new Blob(['{}']),
          }),
        },
      }),
    );

    const clicked = [];
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function capture() {
      clicked.push(this.getAttribute('download'));
    };

    try {
      renderPreview();
      await screen.findByRole('heading', { name: 'Preview & Export Your Book' });
      await userEvent.click(screen.getByRole('button', { name: /Export & Download/ }));

      expect(await screen.findByText(/link has expired/i)).toBeInTheDocument();
      // Nothing was written to disk under a name that promises a PDF.
      expect(clicked).toHaveLength(0);
    } finally {
      HTMLAnchorElement.prototype.click = realClick;
    }
  });

  it('still leaves the link on screen, for a browser that blocked the save', async () => {
    vi.stubGlobal('fetch', api());
    renderPreview();

    await screen.findByRole('heading', { name: 'Preview & Export Your Book' });
    await userEvent.click(screen.getByRole('button', { name: /Export & Download/ }));

    expect(await screen.findByRole('button', { name: /Download Aarav.pdf/ })).toBeInTheDocument();
  });

  it('sends the chosen settings and offers the finished file', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPreview();

    await screen.findByRole('heading', { name: 'Preview & Export Your Book' });

    await userEvent.click(screen.getByRole('radio', { name: 'Images' }));
    await userEvent.selectOptions(screen.getByLabelText('Page Size'), '8x10in');
    await userEvent.click(screen.getByLabelText('Add Bleed Marks'));
    await userEvent.click(screen.getByRole('button', { name: /Export & Download/ }));

    await waitFor(() => expect(callsTo(fetchMock, '/books/book-1/export', 'POST')).toHaveLength(1));

    const sent = JSON.parse(callsTo(fetchMock, '/books/book-1/export', 'POST')[0][1].body);
    expect(sent.format).toBe('png');
    expect(sent.options.pageSize).toBe('8x10in');
    expect(sent.options.bleedMm).toBe(3);

    // The file is offered as a download, not just announced. It is a button
    // rather than a link because the response is checked before it is saved.
    const save = await screen.findByRole('button', { name: /Download Aarav.png/ });
    expect(save).toBeEnabled();
  });

  it('does not offer EPUB as though it worked', async () => {
    vi.stubGlobal('fetch', api());
    renderPreview();

    await screen.findByRole('heading', { name: 'Preview & Export Your Book' });
    expect(screen.getByRole('radio', { name: 'eBook' })).toBeDisabled();
  });

  it('exports a print-ready PDF', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPreview();

    await screen.findByRole('heading', { name: 'Preview & Export Your Book' });

    await userEvent.click(screen.getByRole('radio', { name: 'Print-Ready PDF' }));
    await userEvent.click(screen.getByRole('button', { name: /Export & Download/ }));

    await waitFor(() => expect(callsTo(fetchMock, '/books/book-1/export', 'POST')).toHaveLength(1));
    const sent = JSON.parse(callsTo(fetchMock, '/books/book-1/export', 'POST')[0][1].body);
    expect(sent.format).toBe('print_pdf');
  });

  it('exports a full cover spread', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPreview();

    await screen.findByRole('heading', { name: 'Preview & Export Your Book' });

    await userEvent.click(screen.getByRole('radio', { name: 'Cover spread' }));
    await userEvent.click(screen.getByRole('button', { name: /Export & Download/ }));

    await waitFor(() => expect(callsTo(fetchMock, '/books/book-1/export', 'POST')).toHaveLength(1));
    const sent = JSON.parse(callsTo(fetchMock, '/books/book-1/export', 'POST')[0][1].body);
    expect(sent.format).toBe('cover_spread');
  });

  it('saves a print setting to the book', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPreview();

    await screen.findByRole('heading', { name: 'Preview & Export Your Book' });
    await userEvent.click(screen.getByRole('tab', { name: 'Print' }));
    await userEvent.selectOptions(screen.getByLabelText('Book size'), '8.5x11');

    await waitFor(() => {
      const call = callsTo(fetchMock, '/books/book-1', 'PATCH').at(-1);
      expect(call).toBeDefined();
      expect(JSON.parse(call[1].body)).toEqual({ print: { size: '8.5x11' } });
    });
  });

  it('blocks a print-ready export while the checker reports errors', async () => {
    const report = {
      ok: false,
      blocking: true,
      counts: { errors: 1, warnings: 0, info: 0 },
      issues: [
        {
          severity: 'error',
          code: 'MISSING_MEDIA',
          message: 'Page 2: its illustration file is missing.',
        },
      ],
    };
    vi.stubGlobal('fetch', api({ printReport: report }));
    renderPreview();

    await screen.findByRole('heading', { name: 'Preview & Export Your Book' });
    await userEvent.click(screen.getByRole('radio', { name: 'Print-Ready PDF' }));

    // The export button is disabled until the errors are fixed.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Export & Download/ })).toBeDisabled(),
    );

    // And the error is spelled out on the Print tab.
    await userEvent.click(screen.getByRole('tab', { name: 'Print' }));
    expect(await screen.findByText(/illustration file is missing/i)).toBeInTheDocument();
  });

  it('offers to add missing title and ending pages, and does so', async () => {
    const report = {
      ok: true,
      blocking: false,
      counts: { errors: 0, warnings: 2, info: 0 },
      issues: [
        {
          severity: 'warning',
          code: 'MISSING_TITLE_PAGE',
          message: 'This book has no title page.',
        },
        {
          severity: 'warning',
          code: 'MISSING_ENDING_PAGE',
          message: 'This book has no ending page.',
        },
      ],
    };
    const fetchMock = api({ printReport: report });
    vi.stubGlobal('fetch', fetchMock);
    renderPreview();

    await screen.findByRole('heading', { name: 'Preview & Export Your Book' });
    await userEvent.click(screen.getByRole('tab', { name: 'Print' }));
    await userEvent.click(await screen.findByRole('button', { name: /Add the missing title/i }));

    await waitFor(() => expect(callsTo(fetchMock, '/pages/prepare-print', 'POST')).toHaveLength(1));
  });

  it('exports the interactive flipbook as an .html download', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPreview();

    await screen.findByRole('heading', { name: 'Preview & Export Your Book' });

    await userEvent.click(screen.getByRole('radio', { name: 'Flipbook' }));
    await userEvent.click(screen.getByRole('button', { name: /Export & Download/ }));

    await waitFor(() => expect(callsTo(fetchMock, '/books/book-1/export', 'POST')).toHaveLength(1));

    const sent = JSON.parse(callsTo(fetchMock, '/books/book-1/export', 'POST')[0][1].body);
    expect(sent.format).toBe('html');

    const save = await screen.findByRole('button', { name: /Download Aarav\.html/ });
    expect(save).toBeEnabled();
  });

  it('overlays the safe-area guide when print guides are turned on', async () => {
    vi.stubGlobal('fetch', api());
    renderPreview();

    await screen.findByRole('heading', { name: 'Preview & Export Your Book' });
    expect(screen.queryAllByTestId('safe-area-guide')).toHaveLength(0);

    await userEvent.click(screen.getByRole('switch', { name: 'Show print guides' }));
    expect(screen.getAllByTestId('safe-area-guide').length).toBeGreaterThan(0);
  });

  it('switches to thumbnails and opens a page from one', async () => {
    vi.stubGlobal('fetch', api());
    renderPreview();

    await screen.findByRole('heading', { name: 'Preview & Export Your Book' });
    await userEvent.click(screen.getByRole('tab', { name: /Thumbnails/ }));

    await userEvent.click(await screen.findByRole('button', { name: 'Open page 3' }));
    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument();
  });

  it('publishes the book and says so', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderPreview();

    await screen.findByRole('heading', { name: 'Preview & Export Your Book' });
    await userEvent.click(screen.getByRole('button', { name: 'Publish Book' }));

    await waitFor(() => expect(callsTo(fetchMock, '/publish', 'POST')).toHaveLength(1));
    expect(JSON.parse(callsTo(fetchMock, '/publish', 'POST')[0][1].body)).toEqual({
      published: true,
    });
    expect(await screen.findByRole('button', { name: /Published/ })).toBeInTheDocument();
  });
});
