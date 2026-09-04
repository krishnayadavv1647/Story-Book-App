/**
 * Where the illustration and the text sit on a printed page.
 *
 * This is the single source of geometry for both renderers, so a PDF and a PNG
 * of the same book are the same book — and the presets are the same six the
 * editor offers, so what someone arranged on screen is what gets printed.
 */

/** Page sizes in PostScript points (72 per inch), the unit PDFs use. */
export const PAGE_SIZES = {
  a4: { width: 595.28, height: 841.89, label: 'A4' },
  letter: { width: 612, height: 792, label: 'US Letter' },
  '8x10in': { width: 576, height: 720, label: '8 × 10 in' },
  '8x8in': { width: 576, height: 576, label: '8 × 8 in square' },
  a5: { width: 419.53, height: 595.28, label: 'A5' },
};

export const PAGE_SIZE_KEYS = Object.keys(PAGE_SIZES);

/** Dots per inch each quality renders at. Points are 1/72in, so scale = dpi/72. */
export const QUALITY_DPI = { standard: 96, high: 150, print: 300 };

const MM_PER_POINT = 25.4 / 72;

/** Millimetres of bleed as points. */
export const bleedPoints = (mm) => (mm ?? 0) / MM_PER_POINT;

/**
 * The page box for a size and orientation, including any bleed.
 *
 * Bleed is extra paper on every edge that a trimmer cuts away, so the artwork
 * runs past the fold instead of leaving a white sliver.
 */
export function pageBox({ pageSize = 'a4', orientation = 'portrait', bleedMm = 0 }) {
  const size = PAGE_SIZES[pageSize] ?? PAGE_SIZES.a4;
  const bleed = bleedPoints(bleedMm);

  const [width, height] =
    orientation === 'landscape'
      ? [Math.max(size.width, size.height), Math.min(size.width, size.height)]
      : [Math.min(size.width, size.height), Math.max(size.width, size.height)];

  return {
    width: width + bleed * 2,
    height: height + bleed * 2,
    bleed,
    // The trim box is the finished page; everything outside it is cut off.
    trim: { x: bleed, y: bleed, width, height },
  };
}

/**
 * Splits a page's trim box into an illustration rect and a text rect.
 *
 * Returns `null` for either when the preset has no room for it. `full-bleed`
 * puts the text over the image, which the renderers handle by drawing a scrim.
 */
export function frameFor(preset, box, { margin = 0.06 } = {}) {
  const inset = Math.min(box.width, box.height) * margin;
  const inner = {
    x: box.x + inset,
    y: box.y + inset,
    width: box.width - inset * 2,
    height: box.height - inset * 2,
  };

  /**
   * A picture book is mostly picture. An even split left the text floating at
   * the top of a half-empty page; the art takes the larger share and the text
   * gets a band sized to it.
   */
  const ART_SHARE = 0.58;

  const split = (rect, axis, artFirst) => {
    const size = axis === 'y' ? rect.height : rect.width;
    const artSize = size * ART_SHARE;
    const textSize = size - artSize;

    if (axis === 'y') {
      return artFirst
        ? [
            { ...rect, height: artSize },
            { ...rect, y: rect.y + artSize, height: textSize },
          ]
        : [
            { ...rect, y: rect.y + textSize, height: artSize },
            { ...rect, height: textSize },
          ];
    }

    return artFirst
      ? [
          { ...rect, width: artSize },
          { ...rect, x: rect.x + artSize, width: textSize },
        ]
      : [
          { ...rect, x: rect.x + textSize, width: artSize },
          { ...rect, width: textSize },
        ];
  };

  const framed = (axis, artFirst) => {
    const [image, text] = split(inner, axis, artFirst);
    // Breathing room between the art and the words.
    const gap = inset * 0.5;

    return axis === 'y'
      ? {
          image,
          text: { ...text, y: text.y + gap, height: Math.max(0, text.height - gap) },
          overlay: false,
        }
      : {
          image,
          text: artFirst
            ? { ...text, x: text.x + gap, width: Math.max(0, text.width - gap) }
            : { ...text, width: Math.max(0, text.width - gap) },
          overlay: false,
        };
  };

  switch (preset) {
    case 'image-bottom':
      return framed('y', false);
    case 'image-left':
      return framed('x', true);
    case 'image-right':
      return framed('x', false);
    case 'text-only':
      return { image: null, text: inner, overlay: false };
    case 'full-bleed':
      // Deliberately the full box, not the inset one: full bleed means the art
      // runs to the paper's edge.
      return {
        image: { ...box },
        text: { x: inner.x, y: box.y + box.height * 0.68, width: inner.width, height: box.height * 0.28 },
        overlay: true,
      };
    case 'image-top':
    default:
      return framed('y', true);
  }
}

/**
 * Scales a source image to cover a rect without distorting it, and returns the
 * crop that keeps the middle. "Cover" rather than "contain" because a letterboxed
 * illustration on a picture-book page looks like a mistake.
 */
export function coverRect(source, target) {
  if (!source?.width || !source?.height) return { ...target, sx: 0, sy: 0, sw: 0, sh: 0 };

  const scale = Math.max(target.width / source.width, target.height / source.height);
  const drawnWidth = source.width * scale;
  const drawnHeight = source.height * scale;

  return {
    ...target,
    // Source rectangle to sample, centred.
    sx: (drawnWidth - target.width) / 2 / scale,
    sy: (drawnHeight - target.height) / 2 / scale,
    sw: target.width / scale,
    sh: target.height / scale,
  };
}

export default { PAGE_SIZES, PAGE_SIZE_KEYS, QUALITY_DPI, pageBox, frameFor, coverRect, bleedPoints };
