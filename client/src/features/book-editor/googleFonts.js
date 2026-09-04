/**
 * A broad catalogue of Google Fonts for the page-type picker.
 *
 * Not literally all ~1700 Google families — a dropdown of that many is unusable,
 * and enumerating them needs an API key. This is a large, hand-picked spread
 * across every category a book might want. Each face is fetched on demand the
 * first time it is used (see `lib/loadFont.js`), so the list can be long without
 * costing anything up front.
 *
 * `value` is the CSS font-family stack stored on the page and set by
 * `PageRender`; `label` is the family's name. The default (EB Garamond, kept in
 * `index.html`) is offered separately as "inherit".
 */

/** The generic fallback appended after each family, by category. */
const FALLBACK = {
  Serif: 'Georgia, "Times New Roman", serif',
  'Sans-serif': 'system-ui, sans-serif',
  Display: 'system-ui, sans-serif',
  Handwriting: 'cursive',
  'Comic & fun': 'cursive',
  Monospace: 'ui-monospace, monospace',
};

const FAMILIES = {
  Serif: [
    'Lora', 'Merriweather', 'Playfair Display', 'PT Serif', 'Noto Serif', 'Source Serif 4',
    'Bitter', 'Crimson Text', 'Cormorant Garamond', 'Libre Baskerville', 'Zilla Slab', 'Domine',
    'Spectral', 'Vollkorn', 'Frank Ruhl Libre', 'Alegreya', 'Cardo', 'Old Standard TT',
    'Bree Serif', 'Slabo 27px', 'Roboto Slab', 'Faustina', 'Newsreader', 'Petrona',
  ],
  'Sans-serif': [
    'Nunito', 'Nunito Sans', 'Poppins', 'Quicksand', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
    'Raleway', 'Work Sans', 'Rubik', 'Mulish', 'Karla', 'DM Sans', 'Manrope', 'Josefin Sans',
    'Cabin', 'Oxygen', 'Fira Sans', 'Barlow', 'Assistant', 'Hind', 'Overpass', 'Signika',
    'Comfortaa', 'Varela Round', 'Jost', 'Sora', 'Outfit', 'Figtree', 'Schibsted Grotesk',
  ],
  Display: [
    'Baloo 2', 'Fredoka', 'Lobster', 'Pacifico', 'Bangers', 'Righteous', 'Chewy', 'Luckiest Guy',
    'Bungee', 'Titan One', 'Sigmar One', 'Alfa Slab One', 'Concert One', 'Passion One', 'Boogaloo',
    'Shrikhand', 'Modak', 'Paytone One', 'Ultra', 'Chango', 'Fugaz One', 'Bowlby One SC',
  ],
  Handwriting: [
    'Patrick Hand', 'Caveat', 'Dancing Script', 'Shadows Into Light', 'Indie Flower', 'Satisfy',
    'Amatic SC', 'Permanent Marker', 'Kaushan Script', 'Gloria Hallelujah', 'Sacramento',
    'Great Vibes', 'Courgette', 'Handlee', 'Coming Soon', 'Architects Daughter', 'Neucha',
    'Schoolbell', 'Rock Salt', 'Gochi Hand',
  ],
  'Comic & fun': [
    'Comic Neue', 'Grandstander', 'Chelsea Market', 'Fredericka the Great', 'Mansalva', 'Delius',
  ],
  Monospace: [
    'Roboto Mono', 'Source Code Pro', 'JetBrains Mono', 'Space Mono', 'Inconsolata',
    'IBM Plex Mono', 'Fira Code',
  ],
};

/** `[{ group, fonts: [{ value, label }] }]`, ready to render as `<optgroup>`s. */
export const FONT_GROUPS = Object.entries(FAMILIES).map(([group, names]) => ({
  group,
  fonts: names.map((name) => ({ value: `"${name}", ${FALLBACK[group]}`, label: name })),
}));

export default FONT_GROUPS;
