import { create } from 'zustand';

/**
 * Whether the welcome video pop-up is open.
 *
 * Its own store rather than a flag on the pop-up, because two places open it:
 * the pop-up itself on someone's first visit, and Settings, when they want to
 * watch it again. Deliberately not persisted — whether somebody has SEEN the
 * video is remembered separately, per account.
 */
export const useWelcomeStore = create((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export default useWelcomeStore;
