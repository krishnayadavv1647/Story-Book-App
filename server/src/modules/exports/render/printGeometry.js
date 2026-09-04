/**
 * Print geometry, computed from the chosen book size rather than hardcoded.
 *
 * Everything the print settings, the editor guides, the quality checker and the
 * print-ready exporter need — trim, bleed, safe area, spine and the full cover
 * spread — is derived here from inches and a DPI, so a new size or a new print
 * provider is a data change, not a rewrite. The worked example the spec pins
 * down (8×8 in at 300 DPI → 2400×2400 trim, ~2475 with 0.125 in bleed) falls
 * straight out of the arithmetic below.
 */

/** Physical trim sizes in inches. `custom` is supplied by the caller instead. */
export const BOOK_SIZES = {
  '8x8': { label: '8 × 8 in (square)', widthIn: 8, heightIn: 8 },
  '8.5x11': { label: '8.5 × 11 in', widthIn: 8.5, heightIn: 11 },
  a4: { label: 'A4 (8.27 × 11.69 in)', widthIn: 8.2677, heightIn: 11.6929 },
};

export const BOOK_SIZE_KEYS = [...Object.keys(BOOK_SIZES), 'custom'];

/**
 * Per-binding rules. Deliberately configurable: print providers disagree on the
 * minimum interior page count and on the sheet caliper that sets spine width, so
 * a caller (or a future provider profile) can override any of these.
 */
export const BINDING_RULES = {
  paperback: { label: 'Paperback', minPages: 24, multipleOf: 2, paperThicknessIn: 0.0032, coverBoardIn: 0 },
  hardcover: { label: 'Hardcover', minPages: 24, multipleOf: 2, paperThicknessIn: 0.0037, coverBoardIn: 0.12 },
  stapled: { label: 'Stapled booklet', minPages: 8, multipleOf: 4, paperThicknessIn: 0.0032, coverBoardIn: 0 },
};

/** The interior page structure a finished book targets: title + stories + ending. */
export const INTERIOR_STRUCTURE = { title: 1, ending: 1 };

const round = (n) => Math.round(n);
const clampPositive = (n) => Math.max(0, n);

/** Resolves size + orientation (+ custom dims) to a trim in inches. */
export function resolveTrimInches({ size = '8x8', orientation = 'square', widthIn, heightIn } = {}) {
  let w;
  let h;

  if (size === 'custom') {
    w = Number(widthIn) > 0 ? Number(widthIn) : 8;
    h = Number(heightIn) > 0 ? Number(heightIn) : 8;
  } else {
    const base = BOOK_SIZES[size] ?? BOOK_SIZES['8x8'];
    w = base.widthIn;
    h = base.heightIn;
  }

  // Orientation reshapes a size; `square` leaves it as authored.
  if (orientation === 'portrait') [w, h] = [Math.min(w, h), Math.max(w, h)];
  else if (orientation === 'landscape') [w, h] = [Math.max(w, h), Math.min(w, h)];

  return { widthIn: w, heightIn: h };
}

/**
 * Everything one interior page needs at print resolution.
 *
 * `full` is the sheet the printer receives (trim + bleed on every edge); `trim`
 * is the finished page after cutting; `safe` is the rectangle inside which text,
 * faces and anything that must not be trimmed has to stay. All three are given
 * in px (at the DPI), and trim additionally in PostScript points for PDF.
 */
export function pageGeometry({
  size = '8x8',
  orientation = 'square',
  dpi = 300,
  bleedIn = 0.125,
  safeIn = 0.25,
  widthIn,
  heightIn,
} = {}) {
  const trim = resolveTrimInches({ size, orientation, widthIn, heightIn });
  const pt = (inch) => inch * 72;

  const bleedPx = round(bleedIn * dpi);
  const safePx = round(safeIn * dpi);
  const trimW = round(trim.widthIn * dpi);
  const trimH = round(trim.heightIn * dpi);
  // Kept internally consistent — full is exactly trim plus a bleed each side —
  // which for 8×8 is 2476, i.e. the spec's "approximately 2475".
  const fullW = trimW + bleedPx * 2;
  const fullH = trimH + bleedPx * 2;

  return {
    dpi,
    trim: {
      widthIn: trim.widthIn,
      heightIn: trim.heightIn,
      widthPx: trimW,
      heightPx: trimH,
      widthPt: pt(trim.widthIn),
      heightPt: pt(trim.heightIn),
    },
    bleed: { inches: bleedIn, px: bleedPx },
    full: {
      widthPx: fullW,
      heightPx: fullH,
      widthPt: pt(trim.widthIn + bleedIn * 2),
      heightPt: pt(trim.heightIn + bleedIn * 2),
    },
    // A rectangle in the coordinate space of the full sheet: inset by the bleed
    // (to reach the trim) and then by the safe margin.
    safe: {
      inches: safeIn,
      px: safePx,
      x: bleedPx + safePx,
      y: bleedPx + safePx,
      width: clampPositive(fullW - 2 * (bleedPx + safePx)),
      height: clampPositive(fullH - 2 * (bleedPx + safePx)),
    },
  };
}

/**
 * Spine width in inches from the interior page count and the paper caliper.
 *
 * Sheets × caliper, plus a board allowance for a hardcover. Both come from the
 * binding rule and can be overridden for a specific provider's paper.
 */
export function spineWidthIn({ interiorPages = 0, binding = 'paperback', paperThicknessIn } = {}) {
  const rule = BINDING_RULES[binding] ?? BINDING_RULES.paperback;
  const caliper = paperThicknessIn ?? rule.paperThicknessIn;
  return clampPositive(interiorPages) * caliper + (rule.coverBoardIn ?? 0);
}

/**
 * The full wrap-around cover: back cover, spine and front cover in one sheet,
 * with bleed on the outer edges. Panels say where each piece is drawn.
 */
export function coverSpreadGeometry({
  size = '8x8',
  orientation = 'square',
  dpi = 300,
  bleedIn = 0.125,
  interiorPages = 8,
  binding = 'paperback',
  paperThicknessIn,
  widthIn,
  heightIn,
} = {}) {
  const one = pageGeometry({ size, orientation, dpi, bleedIn, widthIn, heightIn });
  const spineIn = spineWidthIn({ interiorPages, binding, paperThicknessIn });
  const spinePx = round(spineIn * dpi);
  const bleedPx = one.bleed.px;
  const coverW = one.trim.widthPx;

  return {
    dpi,
    bleed: one.bleed,
    spine: { inches: spineIn, px: spinePx },
    full: { widthPx: coverW * 2 + spinePx + bleedPx * 2, heightPx: one.full.heightPx },
    trimHeightPx: one.trim.heightPx,
    // x offsets within the full sheet, left to right, as the printer reads it.
    panels: {
      back: { x: bleedPx, width: coverW },
      spine: { x: bleedPx + coverW, width: spinePx },
      front: { x: bleedPx + coverW + spinePx, width: coverW },
    },
  };
}

/**
 * Whether an interior page count satisfies a binding, and the nearest count
 * that would — used by the quality checker to warn with a real number.
 */
export function validatePageCount({ interiorPages = 0, binding = 'paperback', minPages } = {}) {
  const rule = BINDING_RULES[binding] ?? BINDING_RULES.paperback;
  const floor = minPages ?? rule.minPages;
  const multiple = rule.multipleOf ?? 1;

  const meetsMin = interiorPages >= floor;
  const meetsMultiple = interiorPages % multiple === 0;

  let nextValid = Math.max(interiorPages, floor);
  if (multiple > 1) nextValid = Math.ceil(nextValid / multiple) * multiple;

  return { ok: meetsMin && meetsMultiple, minPages: floor, multipleOf: multiple, nextValid };
}

/**
 * A `pageBox`-shaped box (the shape the PDF renderer expects) in PostScript
 * points, from a book's print settings. Lets the print-ready PDF use the true
 * physical size and bleed without the renderer knowing about inches or DPI.
 */
export function pdfPrintBox({
  size = '8x8',
  orientation = 'square',
  bleedIn = 0.125,
  widthIn,
  heightIn,
} = {}) {
  const trim = resolveTrimInches({ size, orientation, widthIn, heightIn });
  const bleedPt = bleedIn * 72;
  const trimW = trim.widthIn * 72;
  const trimH = trim.heightIn * 72;

  return {
    width: trimW + bleedPt * 2,
    height: trimH + bleedPt * 2,
    bleed: bleedPt,
    trim: { x: bleedPt, y: bleedPt, width: trimW, height: trimH },
  };
}

/** The effective DPI an image of `pxWidth × pxHeight` actually prints at. */
export function effectiveDpi({ pxWidth, pxHeight, targetWidthIn, targetHeightIn }) {
  const across = targetWidthIn > 0 ? pxWidth / targetWidthIn : 0;
  const down = targetHeightIn > 0 ? pxHeight / targetHeightIn : 0;
  // The lower of the two axes is what actually limits print sharpness.
  return Math.floor(Math.min(across || Infinity, down || Infinity));
}

export default {
  BOOK_SIZES,
  BOOK_SIZE_KEYS,
  BINDING_RULES,
  INTERIOR_STRUCTURE,
  resolveTrimInches,
  pageGeometry,
  spineWidthIn,
  coverSpreadGeometry,
  validatePageCount,
  pdfPrintBox,
  effectiveDpi,
};
