import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { useAuthStore } from '../store/authStore.js';

const initialAuthState = useAuthStore.getState();

// jsdom implements neither of these, and Radix overlays touch both.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!globalThis.matchMedia) {
  // The suite renders at the desktop layout the screens were designed for, so a
  // `min-width` breakpoint query (e.g. the sidebar's `min-width: 1024px`) matches.
  globalThis.matchMedia = (query) => ({
    matches: /min-width/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// jsdom ships no Pointer Capture API. Radix's swipe-to-dismiss reaches for it on
// every pointer event, which surfaces as an unhandled TypeError rather than a
// test failure — so it has to be stubbed, not ignored.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

beforeEach(() => {
  // Every test starts from a known session state.
  useAuthStore.setState({ ...initialAuthState, status: 'unknown', user: null }, true);
});

afterEach(() => {
  cleanup();
});
