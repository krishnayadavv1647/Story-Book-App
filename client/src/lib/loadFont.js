/**
 * Loads a Google Font on demand.
 *
 * The editor offers a large catalogue of faces (see `googleFonts.js`), and
 * loading every one up front would fetch hundreds of files nobody asked for.
 * So a face is fetched the moment it is actually used — chosen in the picker, or
 * rendered on a page — and only ever once. Anything already in `index.html`
 * (the app's Inter and the default book face) is harmless to request again; the
 * browser dedups identical requests.
 */
const loaded = new Set();

/**
 * The real family inside a CSS font-family stack:
 *   '"Playfair Display", Georgia, serif' → 'Playfair Display'
 * Returns null for the default (`inherit` / `var(--font-book)`) and for bare
 * generic keywords, which are not Google families and must not be fetched.
 */
export function familyName(stack) {
  if (!stack || stack === 'inherit') return null;

  const first = String(stack).split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  if (
    !first ||
    first.startsWith('var(') ||
    /^(serif|sans-serif|system-ui|cursive|monospace|ui-monospace|-apple-system)$/i.test(first)
  ) {
    return null;
  }
  return first;
}

/** Injects the stylesheet for one family, once. A no-op on the server. */
export function loadFont(stack) {
  const family = familyName(stack);
  if (!family || typeof document === 'undefined') return;
  if (loaded.has(family)) return;
  loaded.add(family);

  // No explicit weights: asking for a weight a face does not have makes the
  // whole request fail, so the default set is requested and bold is synthesised
  // where a face lacks it. `display=swap` shows the fallback until it arrives.
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, '+')}&display=swap`;
  link.dataset.font = family;
  document.head.appendChild(link);
}

export default loadFont;
