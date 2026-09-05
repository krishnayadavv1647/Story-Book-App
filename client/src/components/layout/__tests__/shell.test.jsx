import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { AppShell, StickyActionBar, PageHeader } from '../index.js';
import { useAuthStore } from '../../../store/authStore.js';
import { useUiStore } from '../../../store/uiStore.js';
import { PRIMARY_NAV } from '../../../config/navigation.js';

function renderShell(ui = <p>Body</p>, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppShell>{ui}</AppShell>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useUiStore.setState({ sidebarCollapsed: false, agentGroupOpen: true });
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: '1', name: 'Krishna Yadav' },
  });
});

describe('Sidebar navigation (Shell B)', () => {
  it('renders every destination the approved Figma frames draw', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });

    // Every drawn row is present. Only the ones with a screen behind them are
    // links — the rest would otherwise send the user to the not-found page.
    for (const item of PRIMARY_NAV) {
      expect(
        within(nav).getByText(item.label),
        `${item.label} is missing from the sidebar`,
      ).toBeInTheDocument();

      if (!item.arrives) {
        expect(within(nav).getByRole('link', { name: item.label })).toBeInTheDocument();
      } else {
        expect(within(nav).queryByRole('link', { name: item.label })).not.toBeInTheDocument();
      }
    }

    // The footer carries the account settings link (Notifications was removed).
    expect(within(nav).getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('lists only destinations that exist', () => {
    // Shell B draws eight primary rows. Story Worlds and Series were removed at
    // the user's request because neither has a screen or a data model behind it
    // — see the deviation note in references/design-source-map.md.
    expect(PRIMARY_NAV.map((i) => i.label)).toEqual([
      'Explore',
      'Create Storybook',
      'My Books',
      // No "Book Preview" row: it only redirected to `/books`, which "My Books"
      // already opens. Two rows for one screen, so it was removed.
      // No "Character Design" row either — removed at the user's request; its
      // route still resolves, but the sidebar no longer offers it.
      'Published Books',
    ]);

    // And every one of them goes somewhere.
    expect(PRIMARY_NAV.filter((item) => item.arrives)).toEqual([]);
  });

  it('marks the current route as the active destination', () => {
    renderShell(<p>Body</p>, { route: '/agent' });

    // Creating a storybook is the agent conversation, so this is the row that
    // marks `/agent` now that the Story Agent group is gone.
    expect(screen.getByRole('link', { name: 'Create Storybook' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Explore' })).not.toHaveAttribute('aria-current');
  });

  // The collapsible "Story Agent" group was removed at the owner's request.
  // Nothing became unreachable: its one built row was the agent at `/agent`,
  // and "Create Storybook" already goes there.
  it('no longer draws the Story Agent group, and still reaches the agent', () => {
    renderShell();

    expect(screen.queryByRole('button', { name: /story agent/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Memory')).not.toBeInTheDocument();
    expect(screen.queryByText('Skills')).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Create Storybook' })).toHaveAttribute(
      'href',
      '/agent',
    );
  });

  it('collapses the sidebar to icons and keeps every destination reachable', async () => {
    renderShell();

    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    // Labels are hidden, but the accessible name survives via the title attribute.
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    // Collapsed rows keep their accessible name — links via `title`, unbuilt
    // rows via the same tooltip that names the phase they arrive in.
    expect(screen.getByRole('link', { name: 'My Books' })).toBeInTheDocument();
    expect(screen.queryByText('Krishna Yadav')).not.toBeInTheDocument();
  });
});

describe('AppShell', () => {
  // The 64px "STORY_BOOK_STUDIO • <SCREEN> ACTIVE" strip the Figma frames draw
  // across the content column was removed at the owner's request: identical on
  // every screen, no control in it, and it restated a context each screen's own
  // PageHeader already gives. This keeps it from drifting back in.
  it('draws no context strip above the content', () => {
    renderShell();

    expect(screen.queryByText('STORY_BOOK_STUDIO')).not.toBeInTheDocument();
    expect(screen.queryByText(/ACTIVE$/)).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});

describe('PageHeader', () => {
  it('renders the back link, title, subtitle and actions', () => {
    render(
      <MemoryRouter>
        <PageHeader
          backTo="/agent"
          backLabel="Back to Chat"
          title="Review Your Story Plan"
          subtitle="Edit the details before generating illustrations."
          actions={<button type="button">Regenerate Plan</button>}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Back to Chat' })).toHaveAttribute('href', '/agent');
    expect(screen.getByRole('heading', { name: 'Review Your Story Plan' })).toBeInTheDocument();
    expect(screen.getByText(/edit the details/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate Plan' })).toBeInTheDocument();
  });
});

describe('StickyActionBar', () => {
  it('announces autosave state politely and renders its actions', () => {
    render(
      <StickyActionBar
        status="All changes saved"
        step="Step 2 of 3"
        actions={<button type="button">Continue to Characters</button>}
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('All changes saved');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to Characters' })).toBeInTheDocument();
  });
});
