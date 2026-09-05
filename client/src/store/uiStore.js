import { create } from 'zustand';

/**
 * Chrome-level UI state that outlives a single route.
 *
 * The collapsed sidebar is a **system-derived** state: the sources draw the
 * collapse control but no collapsed frame exists, so its appearance is designed
 * from the token scale rather than copied. See references/design-source-map.md.
 */
export const useUiStore = create((set) => ({
  sidebarCollapsed: false,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

  // On small screens the sidebar is an off-canvas drawer rather than a fixed
  // column. This tracks whether that drawer is open; it is meaningless on
  // desktop, where the sidebar is always in view.
  mobileNavOpen: false,
  openMobileNav: () => set({ mobileNavOpen: true }),
  closeMobileNav: () => set({ mobileNavOpen: false }),
}));

export default useUiStore;
