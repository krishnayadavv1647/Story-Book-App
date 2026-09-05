import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import AppRoutes from '../../../routes/AppRoutes.jsx';
import { createQueryClient } from '../../../lib/queryClient.js';
import { ToastProvider } from '../../../components/common/index.js';
import { useAuthStore } from '../../../store/authStore.js';

const AARAV = {
  _id: 'c1',
  name: 'Aarav',
  role: 'main',
  age: '8 years',
  gender: 'Boy',
  appearance: 'A curious Indian boy with warm brown skin.',
  outfit: 'Forest-green hoodie and beige cargo shorts.',
  personality: 'Brave, kind and imaginative.',
  artStyle: '3D Storybook',
  status: 'draft',
  identity: { locked: false, consistencyPrompt: 'Aarav: 8-year-old Indian boy.' },
  previews: [],
};

const LUMI = {
  _id: 'c2',
  name: 'Lumi',
  role: 'supporting',
  status: 'ready',
  identity: { locked: false, consistencyPrompt: 'Lumi: a small firefly.' },
  previews: [],
};

const SPARE = { _id: 'c3', name: 'Old Friend', role: 'supporting', status: 'draft', identity: {} };

function envelope(data) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ success: true, data, message: 'OK', meta: {}, error: null }),
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

function api({ cast = [AARAV, LUMI], library = [AARAV, LUMI, SPARE], overrides = {} } = {}) {
  return vi.fn(async (url, init) => {
    const path = String(url);
    const method = init?.method ?? 'GET';

    if (path.includes('/characters?bookId=') || path.includes('bookId=book-1')) return envelope(cast);
    if (path.endsWith('/characters') && method === 'GET') return envelope(library);
    if (path.includes('/lock') && method === 'POST') return overrides.lock ?? envelope({ ...AARAV, identity: { ...AARAV.identity, locked: true } });
    if (method === 'POST' && path.endsWith('/characters')) return envelope({ ...AARAV, _id: 'new-1' });
    return envelope({ ok: true });
  });
}

function renderCharacters() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/books/book-1/characters']}>
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

describe('create your characters', () => {
  it('renders the header, the three modes and the book’s cast', async () => {
    vi.stubGlobal('fetch', api());
    renderCharacters();

    expect(await screen.findByRole('heading', { name: 'Create Your Characters' })).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: 'Select Existing' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Generate with AI' })).not.toBeDisabled();
    // All three modes are live now that the upload path exists.
    expect(screen.getByRole('tab', { name: 'Upload Character' })).not.toBeDisabled();

    expect(await screen.findByRole('heading', { name: 'Story Characters' })).toBeInTheDocument();
    // Two controls mention Aarav — the select card and its remove button.
    expect(await screen.findByRole('button', { name: /Aarav.*Main Character/s })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Aarav from this book' })).toBeInTheDocument();
  });

  it('takes the Upload Character mode to the reference control', async () => {
    vi.stubGlobal('fetch', api());
    renderCharacters();

    await screen.findByRole('heading', { name: 'Create Your Characters' });
    await userEvent.click(screen.getByRole('tab', { name: 'Upload Character' }));

    // The mode is selected and its control is on screen — not a tab that looks
    // like it did nothing.
    expect(screen.getByRole('tab', { name: 'Upload Character' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Reference Images')).toBeInTheDocument();
  });

  it('loads the first cast member into the details form', async () => {
    vi.stubGlobal('fetch', api());
    renderCharacters();

    await waitFor(() =>
      expect(screen.getByLabelText('Character Name')).toHaveValue('Aarav'),
    );
    expect(screen.getByLabelText('Age')).toHaveValue('8 years');
    expect(screen.getByLabelText('Appearance')).toHaveValue(
      'A curious Indian boy with warm brown skin.',
    );
    expect(screen.getByRole('button', { name: 'Main Character' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows each cast member’s design status', async () => {
    vi.stubGlobal('fetch', api());
    renderCharacters();

    expect(await screen.findByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Needs Design')).toBeInTheDocument();
  });

  it('offers illustration, and still gates what has no backing yet', async () => {
    vi.stubGlobal('fetch', api());
    renderCharacters();

    await screen.findByRole('heading', { name: 'Character Preview' });
    await waitFor(() => expect(screen.getByLabelText('Character Name')).toHaveValue('Aarav'));

    // Live now.
    expect(screen.getByRole('button', { name: 'Generate' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Regenerate' })).not.toBeDisabled();

    // Reference uploads are live too.
    expect(screen.getByRole('button', { name: 'Full sheet' })).not.toBeDisabled();
    expect(screen.getByLabelText('Upload a reference image')).toBeInTheDocument();

    // Still waiting on the book editor.
    expect(screen.getByRole('button', { name: 'Edit Details' })).toBeDisabled();
  });
});

describe('editing', () => {
  it('saves changes to the selected character', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderCharacters();

    const personality = await screen.findByLabelText('Personality');
    // Wait for the loaded character to populate the form before replacing it.
    await waitFor(() => expect(personality).toHaveValue('Brave, kind and imaginative.'));
    await userEvent.clear(personality);
    await userEvent.type(personality, 'Quieter than he looks.');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      const patch = callsTo(fetchMock, '/characters/c1', 'PATCH');
      expect(patch).toHaveLength(1);
      expect(JSON.parse(patch[0][1].body).personality).toBe('Quieter than he looks.');
    });
  });

  it('creates a new character and attaches it to this book', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderCharacters();

    await userEvent.click(await screen.findByRole('button', { name: /Add Character/ }));

    const name = screen.getByLabelText('Character Name');
    expect(name).toHaveValue('');
    await userEvent.type(name, 'Meera');
    await userEvent.click(screen.getByRole('button', { name: 'Create character' }));

    await waitFor(() => {
      expect(callsTo(fetchMock, '/characters', 'POST').length).toBeGreaterThan(0);
      // Created here means it belongs to this book straight away.
      expect(callsTo(fetchMock, '/books/book-1/characters', 'POST')).toHaveLength(1);
    });
  });

  it('adds an existing character from the library', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderCharacters();

    await userEvent.selectOptions(
      await screen.findByLabelText('Add an existing character to this book'),
      'c3',
    );

    await waitFor(() => {
      const post = callsTo(fetchMock, '/books/book-1/characters', 'POST');
      expect(JSON.parse(post[0][1].body)).toEqual({ characterId: 'c3' });
    });
  });

  it('removes a character from the book', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderCharacters();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Lumi from this book' }),
    );

    await waitFor(() =>
      expect(callsTo(fetchMock, '/books/book-1/characters/c2', 'DELETE')).toHaveLength(1),
    );
  });
});

describe('identity lock', () => {
  it('locks the look and disables the fields that would change it', async () => {
    const locked = { ...AARAV, identity: { ...AARAV.identity, locked: true } };
    const fetchMock = api({ cast: [locked, LUMI] });
    vi.stubGlobal('fetch', fetchMock);
    renderCharacters();

    expect(await screen.findByText(/look is locked/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Appearance')).toBeDisabled();
    expect(screen.getByLabelText('Outfit')).toBeDisabled();
    expect(screen.getByLabelText('Art Style')).toBeDisabled();
    expect(screen.getByLabelText('Consistency prompt')).toBeDisabled();

    // Everything that never reaches the image model stays editable.
    expect(screen.getByLabelText('Personality')).not.toBeDisabled();
    expect(screen.getByLabelText('Age')).not.toBeDisabled();
  });

  it('offers a lock action for an unlocked character', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderCharacters();

    await userEvent.click(await screen.findByRole('button', { name: 'Lock look' }));

    await waitFor(() => expect(callsTo(fetchMock, '/characters/c1/lock', 'POST')).toHaveLength(1));
  });

  it('explains a rejected edit rather than failing silently', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      if (method === 'PATCH') {
        return failure(409, 'IDENTITY_LOCKED', 'This character’s look is locked so it stays consistent.');
      }
      if (path.includes('bookId=book-1')) return envelope([AARAV, LUMI]);
      return envelope([AARAV, LUMI, SPARE]);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderCharacters();

    const field = await screen.findByLabelText('Personality');
    await waitFor(() => expect(field).toHaveValue('Brave, kind and imaginative.'));
    await userEvent.type(field, '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/look is locked/i);
  });
});

describe('navigation', () => {
  it('offers both a skip and a continue to the editor', async () => {
    vi.stubGlobal('fetch', api());
    renderCharacters();

    expect(await screen.findByRole('button', { name: 'Skip for now' })).toBeInTheDocument();
    // Illustration comes before the editor — there is nothing to edit until the
    // pages have pictures.
    expect(screen.getAllByRole('button', { name: /Illustrate the book/ })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Back to Story Plan' })).toHaveAttribute(
      'href',
      '/books/book-1/plan',
    );
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
  });
});

describe('illustrating a character', () => {
  /** Adds the generation endpoints to the base mock. */
  function apiWithGeneration({ jobStatuses = ['processing', 'succeeded'] } = {}) {
    const queue = [...jobStatuses];

    return vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? 'GET';

      if (path.includes('/generation/characters/') && method === 'POST') {
        return envelope({ jobId: 'job-1', status: 'queued', reused: false });
      }
      if (path.includes('/generation/jobs/job-1/cancel')) {
        return envelope({ status: 'cancelled', upstreamCancelled: false });
      }
      if (path.includes('/generation/jobs/job-1')) {
        const status = queue.length > 1 ? queue.shift() : queue[0];
        return envelope({
          jobId: 'job-1',
          status,
          progress: status === 'succeeded' ? 100 : 40,
          imageUrl: status === 'succeeded' ? 'http://localhost:5000/api/v1/media/m1?exp=1&sig=x' : null,
          error: null,
        });
      }
      if (path.includes('bookId=book-1')) return envelope([AARAV, LUMI]);
      if (path.endsWith('/characters') && method === 'GET') return envelope([AARAV, LUMI, SPARE]);
      return envelope({ ok: true });
    });
  }

  it('starts an illustration and shows it when it lands', async () => {
    const fetchMock = apiWithGeneration();
    vi.stubGlobal('fetch', fetchMock);
    renderCharacters();

    await waitFor(() => expect(screen.getByLabelText('Character Name')).toHaveValue('Aarav'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, '/generation/characters/c1/image', 'POST')).toHaveLength(1),
    );

    const image = await screen.findByRole('img', { name: /aarav, front/i }, { timeout: 6000 });
    expect(image).toHaveAttribute('src', expect.stringContaining('/api/v1/media/m1'));
  });

  it('reports progress and offers a cancel while it runs', async () => {
    vi.stubGlobal('fetch', apiWithGeneration({ jobStatuses: ['processing'] }));
    renderCharacters();

    await waitFor(() => expect(screen.getByLabelText('Character Name')).toHaveValue('Aarav'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText(/illustrating this character/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('says so when image generation is not configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        const path = String(url);
        if (path.includes('/generation/characters/')) {
          return failure(503, 'KIE_NOT_CONFIGURED', 'Image generation is not configured');
        }
        if (path.includes('bookId=book-1')) return envelope([AARAV, LUMI]);
        if (path.endsWith('/characters') && (init?.method ?? 'GET') === 'GET') {
          return envelope([AARAV, LUMI, SPARE]);
        }
        return envelope({ ok: true });
      }),
    );
    renderCharacters();

    await waitFor(() => expect(screen.getByLabelText('Character Name')).toHaveValue('Aarav'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/API key in Settings/i);
  });
});

describe('reference images', () => {
  const withReference = {
    ...AARAV,
    referenceImages: [{ assetId: 'a1', url: '/api/v1/media/a1?exp=1&sig=x' }],
  };

  function apiWith(cast) {
    return vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? 'GET';

      if (path.includes('/media/upload')) return envelope({ assetId: 'a2', url: '/api/v1/media/a2' });
      if (path.includes('/references')) return envelope(withReference);
      if (path.includes('bookId=book-1')) return envelope(cast);
      if (path.endsWith('/characters') && method === 'GET') return envelope([...cast, SPARE]);
      return envelope({ ok: true });
    });
  }

  it('uploads a chosen file and attaches it to the character', async () => {
    const fetchMock = apiWith([AARAV, LUMI]);
    vi.stubGlobal('fetch', fetchMock);
    renderCharacters();

    await waitFor(() => expect(screen.getByLabelText('Character Name')).toHaveValue('Aarav'));

    const input = screen.getByLabelText('Upload a reference image');
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'ref.png', { type: 'image/png' });
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(callsTo(fetchMock, '/media/upload', 'POST')).toHaveLength(1);
      expect(callsTo(fetchMock, '/characters/c1/references', 'POST')).toHaveLength(1);
    });

    // A multipart body must not have Content-Type set by hand.
    const [, init] = callsTo(fetchMock, '/media/upload', 'POST')[0];
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('shows existing references and offers to remove one', async () => {
    const fetchMock = apiWith([withReference, LUMI]);
    vi.stubGlobal('fetch', fetchMock);
    renderCharacters();

    await waitFor(() => expect(screen.getByLabelText('Character Name')).toHaveValue('Aarav'));

    await userEvent.click(screen.getByRole('button', { name: 'Remove this reference image' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, '/characters/c1/references/a1', 'DELETE')).toHaveLength(1),
    );
  });

  it('locks the reference set along with the rest of the look', async () => {
    const locked = {
      ...withReference,
      identity: { ...AARAV.identity, locked: true },
    };
    vi.stubGlobal('fetch', apiWith([locked, LUMI]));
    renderCharacters();

    await waitFor(() => expect(screen.getByLabelText('Character Name')).toHaveValue('Aarav'));

    expect(screen.getByText(/unlock this character to change what steers/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove this reference image' })).not.toBeInTheDocument();
  });
});

describe('full character sheet', () => {
  it('asks for all four poses at once', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? 'GET';

      if (path.includes('/sheet')) {
        return envelope({
          jobs: ['front', 'side', 'three_quarter', 'full_body'].map((pose, i) => ({
            pose,
            jobId: `job-${i}`,
          })),
            });
      }
      if (path.includes('/generation/jobs/')) {
        return envelope({ jobId: 'job-0', status: 'succeeded', progress: 100, imageUrl: null });
      }
      if (path.includes('bookId=book-1')) return envelope([AARAV, LUMI]);
      if (path.endsWith('/characters') && method === 'GET') return envelope([AARAV, LUMI, SPARE]);
      return envelope({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderCharacters();

    await waitFor(() => expect(screen.getByLabelText('Character Name')).toHaveValue('Aarav'));
    await userEvent.click(screen.getByRole('button', { name: 'Full sheet' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, '/generation/characters/c1/sheet', 'POST')).toHaveLength(1),
    );
  });
});
