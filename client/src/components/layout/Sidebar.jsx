import { NavLink } from 'react-router-dom';
import { LogOut, PanelLeft, X } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { useIsDesktop } from '../../lib/useMediaQuery.js';
import { useUiStore } from '../../store/uiStore.js';
import { useAuthStore } from '../../store/authStore.js';
import { Avatar } from '../common/Avatar.jsx';
import { IconButton } from '../common/IconButton.jsx';
import { PRIMARY_NAV, SIDEBAR_FOOTER } from '../../config/navigation.js';

/**
 * Measured from Figma `H98QB4Tdo6iH2EaXCerUlv` frame 1:2.
 *
 *   sidebar 274 · rows inset 10 left / 16 right (248 wide) · icon at x20 · label at x50
 *   brand row y14–48 · primary nav starts y78 · pitch 37
 *   Story Agent header is a bordered 40px row; its sub-items sit BELOW that
 *   border, indented to x28, at 34px pitch.
 *
 * Verified against the frame by measuring the rendered geometry — see the
 * fidelity note in references/design-source-map.md.
 */

/**
 * A row whose screen is not built yet. Drawn exactly like a real row so the
 * measured layout is unchanged, but it is not a link and says why.
 */
function UnbuiltRow({ item, collapsed, height, indented }) {
  const Icon = item.icon;
  const note = `${item.label} — arrives with ${item.arrives}`;

  return (
    <li>
      <span
        aria-disabled="true"
        title={note}
        className={cn(
          'flex cursor-not-allowed items-center rounded text-ink-muted',
          indented ? 'pl-3 text-sm' : 'pl-2.5 text-base',
          height,
          collapsed && 'justify-center pl-0',
        )}
      >
        <Icon
          className={cn('shrink-0', indented ? 'h-3.5 w-3.5' : 'h-[15px] w-[15px]')}
          aria-hidden="true"
        />
        {!collapsed && (
          <>
            <span className={cn('truncate', indented ? 'ml-4' : 'ml-[15px]')}>{item.label}</span>
            <span className="sr-only"> — arrives with {item.arrives}</span>
          </>
        )}
      </span>
    </li>
  );
}

/**
 * A footer card. The three of them share a shape but not a size, so the classes
 * come from the caller; what is shared is that a built destination is a link and
 * an unbuilt one is inert.
 */
function FooterCard({ item, className, children, onNavigate }) {
  if (item.arrives) {
    return (
      <span
        aria-disabled="true"
        title={`${item.label} — arrives with ${item.arrives}`}
        className={cn(className, 'cursor-not-allowed text-ink-muted')}
      >
        {children}
      </span>
    );
  }

  return (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      className={cn(className, 'text-ink hover:bg-surface-hover')}
    >
      {children}
    </NavLink>
  );
}

function NavRow({ item, collapsed, height = 'h-[37px]', onNavigate }) {
  const Icon = item.icon;

  if (item.arrives) return <UnbuiltRow item={item} collapsed={collapsed} height={height} />;

  return (
    <li>
      <NavLink
        to={item.path}
        end={item.path === '/'}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          cn(
            'flex items-center rounded pl-2.5 text-base transition-colors',
            height,
            collapsed && 'justify-center pl-0',
            // The selected row is the same gold gradient as the primary CTA,
            // sourced from the same place so the two cannot drift apart. Only
            // the current row is filled — everything else stays dark.
            isActive
              ? 'surface-gold-nav border text-ink-on-gold font-semibold'
              : 'text-ink hover:bg-surface-hover',
          )
        }
      >
        <Icon className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
        {!collapsed && <span className="ml-[15px] truncate">{item.label}</span>}
      </NavLink>
    </li>
  );
}

export function Sidebar() {
  const collapsedPref = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const closeMobileNav = useUiStore((s) => s.closeMobileNav);
  const isDesktop = useIsDesktop();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const NotificationsIcon = SIDEBAR_FOOTER.notifications.icon;
  const SettingsIcon = SIDEBAR_FOOTER.settings.icon;

  // Collapse is a desktop-only affordance; on mobile the drawer is always full.
  const collapsed = isDesktop && collapsedPref;
  const gutter = collapsed ? 'px-3' : 'pl-2.5 pr-4';

  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        'surface-sidebar flex h-full shrink-0 flex-col border-r border-hairline',
        // Desktop: a static column that animates its width when collapsed.
        'lg:static lg:z-auto lg:translate-x-0 lg:transition-[width]',
        collapsed ? 'lg:w-[72px]' : 'lg:w-sidebar',
        // Mobile: an off-canvas drawer sliding in over the content.
        'fixed inset-y-0 left-0 z-50 w-sidebar transition-transform duration-200',
        mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
    >
      {/* Brand row. `mt` not `pt`: padding inside a fixed height would shrink the
          content box and pull everything below it upward. Tall enough to hold the
          4rem brand lockup without cramping it against the top edge. */}
      <div
        className={cn(
          'mt-[14px] flex h-16 shrink-0 items-center',
          collapsed ? 'justify-center' : 'justify-between pl-[18px] pr-4',
        )}
      >
        {!collapsed && (
          <img src="/logo.png" alt="StoryBook Studio" className="-ml-[6px] h-16 w-auto shrink-0" />
        )}
        {/* Desktop: collapse the column. Mobile: close the drawer. */}
        <IconButton
          icon={isDesktop ? PanelLeft : X}
          label={isDesktop ? (collapsed ? 'Expand sidebar' : 'Collapse sidebar') : 'Close menu'}
          onClick={isDesktop ? toggleSidebar : closeMobileNav}
          className="rounded-lg"
        />
      </div>

      {/* Scrolls independently so the account block stays reachable when short. */}
      <div className={cn('mt-[30px] min-h-0 flex-1 overflow-y-auto', gutter)}>
        <ul>
          {PRIMARY_NAV.map((item) => (
            <NavRow key={item.key} item={item} collapsed={collapsed} onNavigate={closeMobileNav} />
          ))}
        </ul>

      </div>

      {/*
        Footer block. The design draws it in flow (y744–994 on a 1080 frame),
        but the two approved Figma frames disagree on the trailing gap — 86px on
        Review Story Plan, 60px on Dashboard — so it is pinned to the bottom
        instead. A deliberate deviation, recorded in the design source map.
      */}
      <div className={cn('shrink-0 space-y-2 pb-4 pt-3', gutter)}>
        <FooterCard
          item={SIDEBAR_FOOTER.notifications}
          onNavigate={closeMobileNav}
          className={cn(
            'flex h-11 items-center rounded-lg border border-hairline bg-surface text-base',
            collapsed ? 'justify-center' : 'pl-2.5',
          )}
        >
          <NotificationsIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span className="ml-[15px]">{SIDEBAR_FOOTER.notifications.label}</span>}
        </FooterCard>

        <FooterCard
          item={SIDEBAR_FOOTER.settings}
          onNavigate={closeMobileNav}
          className={cn(
            'flex h-11 items-center rounded-lg border border-hairline bg-surface text-base',
            collapsed ? 'justify-center' : 'pl-2.5',
          )}
        >
          <SettingsIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span className="ml-[15px]">{SIDEBAR_FOOTER.settings.label}</span>}
        </FooterCard>

        <div
          className={cn(
            'flex items-center rounded-lg border border-hairline bg-surface',
            collapsed ? 'h-11 justify-center' : 'h-[72px] pl-3',
          )}
        >
          <Avatar name={user?.name ?? 'Guest'} tone="accent" size="sm" />
          {!collapsed && (
            <>
              <div className="ml-3 min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{user?.name ?? 'Guest'}</p>
              </div>
              {/* System-derived: the frame draws avatar and name only, but an
                  app with no way to sign out is not shippable. */}
              <IconButton
                icon={LogOut}
                label="Sign out"
                size="sm"
                onClick={signOut}
                className="ml-auto mr-3 border-transparent"
              />
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Sidebar;
