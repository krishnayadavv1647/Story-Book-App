import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

function failure(status, code, message) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => ({ success: false, data: null, message, meta: {}, error: { code, details: null } }),
  };
}

const ENGINES = { writer: { configured: true, model: 'gemini-2.5-flash' }, image: { configured: false, model: null } };

/** Routes by path; `overrides` replaces the reply for a given endpoint. */
function api(overrides = {}) {
  return vi.fn(async (url) => {
    const path = String(url);
    if (path.includes('/story/engines')) return overrides.engines ?? envelope(ENGINES);
    if (path.includes('/story/plan')) return overrides.plan ?? envelope({ bookId: 'book-1', jobId: 'job-1' });
    if (path.includes('/story/chat')) {
      return overrides.chat ?? envelope({ message: { role: 'assistant', content: 'Who is it about?' } });
    }
    // The run the agent starts as soon as the plan lands, and the screen it
    // hands off to.
    if (path.includes('/autopilot')) {
      return overrides.autopilot ?? envelope({ started: true, stage: 'characters' });
    }
    if (path.includes('/generation/books/book-1/progress')) {
      return envelope({
        total: 1,
        ready: 0,
        failed: 0,
        pending: 1,
        inFlight: 0,
        percent: 0,
        autopilot: {
          enabled: true,
          stage: 'characters',
          isRunning: true,
          characterImages: 'generate',
          error: null,
        },
        characters: [
          { characterId: 'c1', name: 'Aarav', role: 'main', status: 'generating', error: null, imageUrl: null },
        ],
        pages: [{ pageId: 'p1', order: 1, title: 'One', status: 'pending', error: null, imageUrl: null }],
      });
    }
    if (path.includes('/generation/books/book-1/cover')) {
      return envelope({
        title: 'A Story',
        subtitle: '',
        coverUrl: null,
        source: null,
        isGenerated: false,
        job: null,
        inFlight: false,
      });
    }
    // The plan screen, still reachable — the run just no longer stops there.
    if (path.includes('/books/book-1')) {
      return envelope({
        book: { _id: 'book-1', title: 'A Story', pageCount: 1, ageGroup: '6-9', language: 'English' },
        pages: [{ _id: 'p1', order: 1, title: 'One', narration: '', sceneDescription: '', characterIds: [] }],
        characters: [],
        estimate: { storyPages: 1, illustrations: 3, charactersToDesign: 0 },
      });
    }
    return envelope([]);
  });
}

function renderAgent() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/agent']}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const IDEA = 'A curious boy finds a forest where every tree remembers a story';

/**
 * Sending an idea is two steps now: the arrow, then the one question a run asks
 * before it spends anything. Every test that sends an idea goes through both.
 */
async function sendIdea(idea = IDEA) {
  await userEvent.type(screen.getByLabelText(/what story/i), idea);
  await userEvent.click(screen.getByRole('button', { name: /create the story plan/i }));
  await userEvent.click(await screen.findByRole('button', { name: /create my book/i }));
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

describe('story agent screen', () => {
  it('greets the user and offers the six starters from the design', async () => {
    vi.stubGlobal('fetch', api());
    renderAgent();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Krishna/);
    expect(screen.getByLabelText(/what story would you like to create/i)).toBeInTheDocument();

    for (const label of [
      'Create a magical bedtime story',
      'Write an adventure about friendship',
      'Make a personalized birthday book',
      'Create an educational animal story',
      'Turn my idea into a 10-page book',
      'Upload and illustrate my story',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('reports engine status from the server rather than decoration', async () => {
    vi.stubGlobal('fetch', api());
    renderAgent();

    expect(await screen.findByLabelText(/AI Writer: ready, gemini-2\.5-flash/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Image Engine: add your API key in Settings/i)).toBeInTheDocument();
  });

  it('warns when story generation is not configured', async () => {
    vi.stubGlobal(
      'fetch',
      api({ engines: envelope({ writer: { configured: false }, image: { configured: false } }) }),
    );
    renderAgent();

    expect(await screen.findByRole('status')).toHaveTextContent(/Add key in Settings/i);
  });
});

describe('creating a plan', () => {
  it('sends the idea with the chosen settings and moves to the review screen', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAgent();

    await sendIdea();

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/story/plan'));
      expect(call).toBeDefined();
      expect(JSON.parse(call[1].body)).toEqual({
        prompt: IDEA,
        settings: {
          ageGroup: '6-9',
          language: 'English',
          genre: 'Magical Adventure',
          artStyle: '3D Storybook',
          pageCount: 10,
          moral: '',
        },
      });
    });

    // And the plan is not the end of it: the run starts on its own, and the
    // agent hands off to the screen that watches it rather than to a review
    // step nobody asked for.
    await waitFor(() => {
      const started = fetchMock.mock.calls.find(([url]) => String(url).includes('/autopilot'));
      expect(started).toBeDefined();
      expect(JSON.parse(started[1].body)).toEqual({
        characterImages: 'generate',
        referenceAssetIds: [],
      });
    });

    expect(await screen.findByRole('heading', { name: 'Making Your Book' })).toBeInTheDocument();
  });

  it('keeps the idea in the box when the question is dismissed', async () => {
    vi.stubGlobal('fetch', api());
    renderAgent();

    await userEvent.type(screen.getByLabelText(/what story/i), IDEA);
    await userEvent.click(screen.getByRole('button', { name: /create the story plan/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    // Backing out of the question must not cost the author their paragraph.
    expect(screen.getByLabelText(/what story/i)).toHaveValue(IDEA);
  });

  it('submits on Enter but not on Shift+Enter', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAgent();

    const input = screen.getByLabelText(/what story/i);
    await userEvent.type(input, IDEA);
    await userEvent.type(input, '{Shift>}{Enter}{/Shift}');

    expect(screen.queryByRole('button', { name: /create my book/i })).not.toBeInTheDocument();

    await userEvent.type(input, '{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: /create my book/i }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/story/plan'))).toBe(true),
    );
  });

  it('offers a cancel while the plan is being generated', async () => {
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).includes('/story/plan')) {
          await pending;
          return envelope({ bookId: 'book-1', jobId: 'job-1' });
        }
        return envelope(ENGINES);
      }),
    );
    renderAgent();

    await sendIdea();

    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByText(/writing your story/i)).toBeInTheDocument();

    release();
  });
});

describe('failure handling', () => {
  it('says the plan could not be produced and to try rewording it', async () => {
    vi.stubGlobal(
      'fetch',
      api({ plan: failure(502, 'STORY_PLAN_INVALID', 'The story planner could not produce a usable plan.') }),
    );
    renderAgent();

    await sendIdea();

    expect(await screen.findByRole('alert')).toHaveTextContent(/try rewording the idea/i);
  });

  it('passes a content block straight through', async () => {
    vi.stubGlobal(
      'fetch',
      api({ plan: failure(400, 'CONTENT_BLOCKED', 'That idea cannot be turned into a children’s book.') }),
    );
    renderAgent();

    await sendIdea();

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot be turned into/i);
  });
});

describe('conversation', () => {
  it('keeps a transcript when the user asks first', async () => {
    vi.stubGlobal('fetch', api());
    renderAgent();

    await userEvent.type(screen.getByLabelText(/what story/i), IDEA);
    await userEvent.click(screen.getByRole('button', { name: 'Ask first' }));

    expect(await screen.findByText('Who is it about?')).toBeInTheDocument();
    expect(screen.getByText(IDEA)).toBeInTheDocument();
    // Starters give way to the conversation once one has begun.
    expect(
      screen.queryByRole('button', { name: 'Create a magical bedtime story' }),
    ).not.toBeInTheDocument();
  });
});

describe('templates', () => {
  it('reveals the templates only once the author starts typing', async () => {
    vi.stubGlobal('fetch', api());
    renderAgent();

    // Nothing typed yet: the starters are offered and the shelf is held back.
    expect(
      screen.getByRole('button', { name: 'Create a magical bedtime story' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start a Bedtime Wonder book' }),
    ).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/what story/i), 'A dragon afraid of fire');

    // Typing swaps the starters (and the engine meters) out for the shelf.
    expect(
      await screen.findByRole('heading', { name: /start from a template/i }),
    ).toBeInTheDocument();
    for (const title of [
      'Bedtime Wonder',
      'Brave Friends',
      'Birthday Surprise',
      'Animal Explorers',
      'Magical Kingdom',
      'Little Learner',
    ]) {
      expect(screen.getByRole('button', { name: `Start a ${title} book` })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('button', { name: 'Create a magical bedtime story' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/AI Writer/i)).not.toBeInTheDocument();
  });

  it('styles the typed idea with the chosen template and starts the run', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAgent();

    await userEvent.type(screen.getByLabelText(/what story/i), 'A dragon afraid of fire');
    await userEvent.click(await screen.findByRole('button', { name: 'Start a Magical Kingdom book' }));
    await userEvent.click(await screen.findByRole('button', { name: /create my book/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/story/plan'));
      expect(call).toBeDefined();
      const body = JSON.parse(call[1].body);
      // The author's words are the idea; the template supplied the style.
      expect(body.prompt).toBe('A dragon afraid of fire');
      expect(body.settings).toMatchObject({
        genre: 'Magical Adventure',
        artStyle: '3D Storybook',
        ageGroup: '9-12',
        pageCount: 16,
      });
    });
  });
});

describe('book settings', () => {
  it('applies changed settings to the next plan request', async () => {
    const fetchMock = api();
    vi.stubGlobal('fetch', fetchMock);
    renderAgent();

    await userEvent.click(screen.getByRole('button', { name: /book settings/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Book settings' });
    await userEvent.selectOptions(screen.getByLabelText('Age group'), '3-5');
    await userEvent.selectOptions(screen.getByLabelText('Pages'), '16');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());

    await sendIdea();

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/story/plan'));
      const body = JSON.parse(call[1].body);
      expect(body.settings.ageGroup).toBe('3-5');
      expect(body.settings.pageCount).toBe(16);
    });
  });
});
