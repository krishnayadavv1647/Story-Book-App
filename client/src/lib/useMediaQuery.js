import { useEffect, useState } from 'react';

/**
 * Whether a CSS media query currently matches.
 *
 * Used where a layout is a different *shape* rather than a different size — a
 * book opens to two pages on a desktop and one on a phone, and that is a
 * decision about how many pages exist on screen, not something a breakpoint
 * class can express.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const list = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);

    setMatches(list.matches);
    // `addEventListener` on a MediaQueryList is the modern spelling; Safari
    // before 14 only has `addListener`.
    if (list.addEventListener) list.addEventListener('change', onChange);
    else list.addListener(onChange);

    return () => {
      if (list.removeEventListener) list.removeEventListener('change', onChange);
      else list.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

export default useMediaQuery;
