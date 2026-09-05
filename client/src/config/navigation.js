import { Bell, BookMarked, BookOpen, Compass, Settings, SquarePen } from 'lucide-react';

/**
 * The sidebar, measured from Figma `H98QB4Tdo6iH2EaXCerUlv` frame 1:2 and
 * cross-checked against `eQzIIC5gfOmGE392HvA7aC` frame 1:2. Both approved Figma
 * screens draw exactly this list, in this order.
 *
 * The sources draw placeholder glyphs (▱, ♙, ⊕ …) rather than real icons, so the
 * Lucide icon for each row is chosen by meaning. Swap one here and it changes
 * everywhere — nothing else defines the navigation.
 *
 * Routes are added by the phase that builds them. A row whose screen does not
 * exist yet carries `arrives` — the phase that builds it. Those rows are shown
 * (the design draws them) but are not links: sending someone to a 404 from the
 * app's own navigation is worse than saying the screen is not built yet.
 */
export const PRIMARY_NAV = [
  { key: 'explore', label: 'Explore', icon: Compass, path: '/' },
  // Creating a storybook *is* the agent conversation. This points straight at
  // `/agent` rather than at the `/create` redirect, so the row lights up while
  // you are actually on that screen — with the Story Agent group gone, it is
  // the only row that marks it. `/create` still exists for older links.
  { key: 'create', label: 'Create Storybook', icon: SquarePen, path: '/agent' },
  { key: 'my-books', label: 'My Books', icon: BookOpen, path: '/books' },
  { key: 'published', label: 'Published Books', icon: BookMarked, path: '/published' },
];

/*
 * Removed at the user's request (2026-09-03): the "Character Design" row.
 *
 * Unlike the removals below, this one leaves a real screen with no way in from
 * the app: `/characters` is the account-wide character library, and the sidebar
 * was its only entry point. The route still resolves, so a bookmark or an old
 * link keeps working, but nothing in the UI points at it. Editing a character
 * was already done inside a book — `/books/:bookId/characters` — and that path
 * is untouched.
 */

/*
 * Removed at the user's request (2026-09-02): the "Book Preview" row. Previewing
 * needs a book chosen first, so it only ever redirected to `/books` — the same
 * screen "My Books" already opens. Two rows, one destination. The `/preview`
 * route still resolves, for any link that already used it.
 */

/*
 * Removed at the user's request (2026-09-02): Story Worlds, Series, Projects,
 * Team, Training and Bonuses. The approved Figma frames draw all six, but none
 * has a screen, a data model, or a place in the written scope — so rather than
 * six permanently inert rows, the navigation now lists only what exists.
 * Recorded as a deviation in references/design-source-map.md.
 */

/*
 * Removed at the user's request (2026-09-02): the bordered, collapsible "Story
 * Agent" group that sat below the primary nav.
 *
 * Nothing became unreachable. Its only built row was Story Book Agent at
 * `/agent`, and "Create Storybook" already goes there — `/create` redirects to
 * `/agent` — as do the Dashboard hero CTA and the Create Storybook action. Its
 * other three rows (Characters, Memory, Skills) had no screen and were inert.
 * The `/agent` route itself is untouched.
 *
 * Recorded as a deviation in references/design-source-map.md; the two approved
 * Figma frames both draw this group.
 */

/*
 * Removed at the user's request (2026-09-03): the "ALL FEATURES" row. It never
 * went anywhere — it carried an `arrives` marker rather than a route, so it was
 * drawn as a label for a screen that was never built.
 */

/*
 * Removed at the user's request (2026-09-03): the "Credits" row, along with the
 * whole credit system. Nothing is charged for any more, so there is no balance
 * to show and no ledger to read.
 */
export const SIDEBAR_FOOTER = {
  notifications: { key: 'notifications', label: 'Notifications', icon: Bell, path: '/notifications' },
  // Account settings — including each user's own API keys (BYOK). Added here
  // because the app had no way in to `/settings` at all; the route existed but
  // nothing pointed at it.
  settings: { key: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
};

/** Every row the sidebar draws, built or not. */
export const ALL_NAV_ITEMS = [
  ...PRIMARY_NAV,
  SIDEBAR_FOOTER.notifications,
  SIDEBAR_FOOTER.settings,
];

export const ALL_NAV_PATHS = ALL_NAV_ITEMS.map((item) => item.path);

/**
 * The rows that actually go somewhere. A route-coverage test asserts every one
 * of these resolves, so a link can never silently start 404ing again.
 */
export const BUILT_NAV_PATHS = ALL_NAV_ITEMS.filter((item) => !item.arrives).map(
  (item) => item.path,
);
