import { describe, it, expect } from 'vitest';

import {
  pageGeometry,
  resolveTrimInches,
  spineWidthIn,
  coverSpreadGeometry,
  validatePageCount,
  effectiveDpi,
  BOOK_SIZES,
} from '../render/printGeometry.js';

describe('pageGeometry', () => {
  it('turns the 8×8 in book into the spec dimensions at 300 DPI', () => {
    const g = pageGeometry({ size: '8x8', dpi: 300, bleedIn: 0.125, safeIn: 0.25 });

    // Trim: 8 in × 300 = 2400 px, both axes.
    expect(g.trim.widthPx).toBe(2400);
    expect(g.trim.heightPx).toBe(2400);
    // Trim in points for the PDF (8 in × 72).
    expect(g.trim.widthPt).toBeCloseTo(576, 5);

    // Bleed 0.125 in × 300 = 37.5 → 38 px each edge.
    expect(g.bleed.px).toBe(38);
    // Full sheet is trim + a bleed each side — the spec's "approximately 2475".
    expect(g.full.widthPx).toBeGreaterThanOrEqual(2475);
    expect(g.full.widthPx).toBeLessThanOrEqual(2476);
    expect(g.full.heightPx).toBe(g.full.widthPx);

    // Safe area is inset from the full sheet by bleed + safe margin on each side.
    const inset = g.bleed.px + g.safe.px; // 38 + 75
    expect(g.safe.x).toBe(inset);
    expect(g.safe.width).toBe(g.full.widthPx - 2 * inset);
  });

  it('computes every size programmatically, not just one', () => {
    const letter = pageGeometry({ size: '8.5x11', dpi: 300 });
    expect(letter.trim.widthPx).toBe(Math.round(8.5 * 300)); // 2550
    expect(letter.trim.heightPx).toBe(Math.round(11 * 300)); // 3300

    const a4 = pageGeometry({ size: 'a4', dpi: 300 });
    expect(a4.trim.widthPx).toBe(Math.round(BOOK_SIZES.a4.widthIn * 300));
    expect(a4.trim.heightPx).toBe(Math.round(BOOK_SIZES.a4.heightIn * 300));

    // DPI scales linearly.
    const g150 = pageGeometry({ size: '8x8', dpi: 150 });
    expect(g150.trim.widthPx).toBe(1200);
  });

  it('honours a custom size and orientation', () => {
    const custom = pageGeometry({ size: 'custom', widthIn: 6, heightIn: 9, dpi: 300 });
    expect(custom.trim.widthPx).toBe(1800);
    expect(custom.trim.heightPx).toBe(2700);

    // A landscape 8.5×11 swaps its axes; portrait keeps the tall shape.
    expect(resolveTrimInches({ size: '8.5x11', orientation: 'landscape' })).toEqual({
      widthIn: 11,
      heightIn: 8.5,
    });
    expect(resolveTrimInches({ size: '8.5x11', orientation: 'portrait' })).toEqual({
      widthIn: 8.5,
      heightIn: 11,
    });
  });
});

describe('spine and cover spread', () => {
  it('grows the spine with the page count and the binding', () => {
    const thin = spineWidthIn({ interiorPages: 8, binding: 'paperback' });
    const thick = spineWidthIn({ interiorPages: 40, binding: 'paperback' });
    expect(thick).toBeGreaterThan(thin);

    // A hardcover of the same page count is thicker — it carries board.
    expect(spineWidthIn({ interiorPages: 40, binding: 'hardcover' })).toBeGreaterThan(
      spineWidthIn({ interiorPages: 40, binding: 'paperback' }),
    );
  });

  it('lays a full cover out as back | spine | front with bleed', () => {
    const spread = coverSpreadGeometry({ size: '8x8', dpi: 300, interiorPages: 8 });

    // Two covers + a spine + a bleed each outer edge.
    const expectedWidth = 2400 * 2 + spread.spine.px + spread.bleed.px * 2;
    expect(spread.full.widthPx).toBe(expectedWidth);
    expect(spread.full.heightPx).toBe(2400 + spread.bleed.px * 2);

    // Panels are laid left to right and do not overlap.
    expect(spread.panels.back.x).toBe(spread.bleed.px);
    expect(spread.panels.spine.x).toBe(spread.bleed.px + 2400);
    expect(spread.panels.front.x).toBe(spread.bleed.px + 2400 + spread.spine.px);
  });
});

describe('validatePageCount', () => {
  it('accepts a stapled booklet at 8 interior pages', () => {
    const r = validatePageCount({ interiorPages: 8, binding: 'stapled' });
    expect(r.ok).toBe(true);
  });

  it('flags a paperback below its minimum and names the next valid count', () => {
    const r = validatePageCount({ interiorPages: 8, binding: 'paperback' });
    expect(r.ok).toBe(false);
    expect(r.minPages).toBe(24);
    expect(r.nextValid).toBe(24);
  });

  it('is configurable — a provider can demand more pages', () => {
    const r = validatePageCount({ interiorPages: 30, binding: 'paperback', minPages: 32 });
    expect(r.ok).toBe(false);
    expect(r.nextValid).toBe(32);
  });
});

describe('effectiveDpi', () => {
  it('reports the DPI an image actually prints at, limited by its worse axis', () => {
    // A 2400×1800 image on an 8×8 page prints at 300 across but only 225 down.
    expect(effectiveDpi({ pxWidth: 2400, pxHeight: 1800, targetWidthIn: 8, targetHeightIn: 8 })).toBe(
      225,
    );
    // A full-resolution image clears 300.
    expect(effectiveDpi({ pxWidth: 2475, pxHeight: 2475, targetWidthIn: 8, targetHeightIn: 8 })).toBeGreaterThanOrEqual(
      300,
    );
  });
});
