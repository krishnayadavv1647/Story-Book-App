import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query and returns whether it currently matches.
 *
 * Used for the handful of places where layout has to branch in JavaScript rather
 * than in CSS — chiefly the sidebar, which is a static column on desktop but an
 * off-canvas drawer on small screens, a difference that changes what is rendered,
 * not just how it is styled. SSR-safe: returns `false` until mounted.
 */
export function useMediaQuery(query, defaultValue = false) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return defaultValue;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/**
 * True at Tailwind's `lg` breakpoint and up (≥1024px) — i.e. "desktop".
 * Defaults to desktop where `matchMedia` is unavailable (SSR, jsdom tests),
 * which matches the app's original desktop-only assumption.
 */
export function useIsDesktop() {
  return useMediaQuery('(min-width: 1024px)', true);
}

export default useMediaQuery;
