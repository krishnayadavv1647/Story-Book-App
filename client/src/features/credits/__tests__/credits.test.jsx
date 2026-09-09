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

const BALANCE = {
  balance: 320,
  signupGrant: 500,
  prices: { story_plan: 10, page_image: 5, character_image: 5, story_chat: 1 },
  recent: [],
};

/** Two pages of ledger rows, so the pager has something to page through. */
function ledgerPage(page) {
  const rows =
    page === 1
      ? [
          {
            _id: 'l1',
            amount: -70,
            balanceAfter: 320,
            type: 'debit',
            reason: 'Illustration for page 3',
            createdAt: '2026-09-08T10:00:00.000Z',
          },
          {
            _id: 'l2',
            amount: 500,
            balanceAfter: 500,
            type: 'signup_grant',
            reason: 'Welcome credits',
            createdAt: '2026-09-01T10:00:00.000Z',
          },
        ]
      : [
          {
            _id: 'l3',
            amount: -10,
            balanceAfter: 390,
            type: 'debit',
            reason: 'Story plan',
            createdAt: '2026-08-30T10:00:00.000Z',
          },
        ];

  return envelope({ items: rows, total: 3, page, limit: 2 });
}

const STARTER = {
  id: 'p1',
  key: 'starter',
  name: 'Starter',
  description: 'A few books a month.',
  priceCents: 900,
  currency: 'USD',
  interval: 'month',
  creditsGranted: 400,
  features: ['Watermark-free exports'],
};

function api({ plans = [STARTER], current = null } = {}) {
  return vi.fn(async (url) => {
    const path = String(url);
    if (path.includes('/credits/history')) {
      return ledgerPage(path.includes('page=2') ? 2 : 1);
    }
    if (path.includes('/plans')) return envelope({ plans, current });
    if (path.includes('/credits')) return envelope(BALANCE);
    if (path.includes('/auth/session')) {
      return envelope({ user: { id: 'u1', name: 'Krishna Yadav' } });
    }
    return envelope({ ok: true });
  });
}

function renderCredits() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/credits']}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ status: 'authenticated', user: { id: 'u1', name: 'Krishna Yadav' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the credits screen', () => {
  it('leads with the balance, then says what things cost', async () => {
    vi.stubGlobal('fetch', api());
    renderCredits();

    expect(await screen.findByText('credits left')).toBeInTheDocument();
    // The sidebar row carries it too, which is the point of restoring that row.
    await waitFor(() => expect(screen.getAllByText('320').length).toBeGreaterThanOrEqual(2));

    expect(screen.getByText('One illustration')).toBeInTheDocument();
    expect(screen.getByText('Writing a story')).toBeInTheDocument();
  });

  it('shows what was spent, and what it left behind', async () => {
    vi.stubGlobal('fetch', api());
    renderCredits();

    expect(await screen.findByText('Illustration for page 3')).toBeInTheDocument();
    expect(screen.getByText('-70')).toBeInTheDocument();
    // A grant reads as an addition, not just another number in a column.
    expect(screen.getByText('+500')).toBeInTheDocument();
    expect(screen.getByText('320 left')).toBeInTheDocument();
  });

  it('pages through a longer history', async () => {
    vi.stubGlobal('fetch', api());
    renderCredits();

    await screen.findByText('Illustration for page 3');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(screen.getByText('Story plan')).toBeInTheDocument());
    expect(screen.queryByText('Illustration for page 3')).not.toBeInTheDocument();
  });
});

describe('plans on the credits screen', () => {
  it('shows what each plan hands over, and never a buy button', async () => {
    // There is no checkout, so a button that looked like one would be a lie.
    vi.stubGlobal('fetch', api());
    renderCredits();

    expect(await screen.findByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Watermark-free exports')).toBeInTheDocument();
    expect(screen.getByText('400')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /buy|subscribe|upgrade/i })).not.toBeInTheDocument();
  });

  it('marks the plan the reader is already on', async () => {
    vi.stubGlobal(
      'fetch',
      api({ current: { status: 'active', plan: STARTER, currentPeriodEnd: null } }),
    );
    renderCredits();

    expect(await screen.findByText('You are on this plan')).toBeInTheDocument();
    expect(screen.getByText(/Starter plan/)).toBeInTheDocument();
  });

  it('draws no plans section when an admin has published none', async () => {
    vi.stubGlobal('fetch', api({ plans: [] }));
    renderCredits();

    await screen.findByText('credits left');
    expect(screen.queryByText('Plans')).not.toBeInTheDocument();
  });
});
