import { Menu } from 'lucide-react';

import { cn } from '../../lib/cn.js';
import { useUiStore } from '../../store/uiStore.js';
import { IconButton } from '../common/IconButton.jsx';
import { Sidebar } from './Sidebar.jsx';

/**
 * The application chrome every authenticated screen sits inside.
 *
 * Desktop (lg+): a static sidebar column beside a scrolling content column.
 * Content inset is 28px from the sidebar edge, 30px from the right of the frame;
 * only the content column scrolls, so a sticky action bar stays meaningful on a
 * short viewport.
 *
 * Small screens: the sidebar becomes an off-canvas drawer (see `Sidebar`), and a
 * slim top bar carries a hamburger and the brand mark. Tapping the hamburger
 * slides the drawer in over a dimmed backdrop; tapping the backdrop, a nav item,
 * or the close button dismisses it. The content column then has the full width.
 *
 * No background of its own: the ground is the body's fixed theme gradient.
 */
export function AppShell({ children, className, contentClassName }) {
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const openMobileNav = useUiStore((s) => s.openMobileNav);
  const closeMobileNav = useUiStore((s) => s.closeMobileNav);

  return (
    <div className={cn('flex h-full overflow-hidden', className)}>
      <Sidebar />

      {/* Dims the content behind the mobile drawer; desktop never sees it. */}
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={closeMobileNav}
          className="fixed inset-0 z-40 bg-scrim lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-only top bar: hamburger + brand. */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-3 lg:hidden">
          <IconButton icon={Menu} label="Open menu" onClick={openMobileNav} className="rounded-lg" />
          <img src="/logo.png" alt="StoryBook Studio" className="h-8 w-auto" />
        </div>

        <main
          className={cn(
            'min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4',
            'lg:pl-7 lg:pr-[30px] lg:pt-[22px]',
            contentClassName,
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppShell;
