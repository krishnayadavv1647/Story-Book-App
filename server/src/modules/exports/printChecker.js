import mongoose from 'mongoose';

import { BookPage, MediaAsset } from '../../models/index.js';
import {
  pageGeometry,
  coverSpreadGeometry,
  validatePageCount,
  effectiveDpi,
} from './render/printGeometry.js';

/**
 * The automatic print-quality checker.
 *
 * It runs before a print-ready export and reports what would go wrong on paper:
 * missing pages, a broken order, images too soft for the page at 300 DPI,
 * missing artwork or media, and a page count the chosen binding will not accept.
 * Errors block a print-ready export; warnings are things the author can look at
 * and choose to accept; info lines state the exact dimensions the printer gets.
 *
 * It reports rather than repairs — it never mutates the book — and it leans on
 * the same `printGeometry` engine the exporter uses, so its numbers and the
 * exporter's numbers cannot disagree.
 */

// Genuine CMYK needs an ICC profile and a conversion pipeline, which are not
// configured, so every export is RGB — and is labelled RGB, never CMYK/PDF-X.
export const CMYK_ENABLED = false;

/** The saturation and lightness of a hex colour, or null if it is not a hex. */
function hexHsl(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return { s, l };
}

/** A very saturated mid-tone — a neon that print (CMYK) often cannot reproduce. */
function isVivid(hex) {
  const hsl = hexHsl(hex);
  return Boolean(hsl && hsl.s > 0.9 && hsl.l > 0.35 && hsl.l < 0.78);
}

/** Fills the print defaults for a book that predates the `print` sub-document. */
export function resolvePrint(print = {}) {
  return {
    size: print.size ?? '8x8',
    orientation: print.orientation ?? 'square',
    binding: print.binding ?? 'paperback',
    dpi: print.dpi ?? 300,
    bleedIn: print.bleedIn ?? 0.125,
    safeMarginIn: print.safeMarginIn ?? 0.25,
    customWidthIn: print.customWidthIn ?? null,
    customHeightIn: print.customHeightIn ?? null,
  };
}

/**
 * @param {object} input
 * @param {object} input.book    the Book (its `print` settings are read)
 * @param {Array}  input.pages   ordered page docs ({ _id, order, type, title, narration, mediaAssetId, status, layout })
 * @param {Map}    input.assetsById  assetId → { exists, width, height }
 * @param {object} [input.options]  overrides for the print settings (e.g. a preview size)
 */
export function checkPrintReadiness({ book, pages, assetsById, options = {} }) {
  const issues = [];
  const add = (severity, code, message, extra = {}) =>
    issues.push({ severity, code, message, ...extra });

  const print = { ...resolvePrint(book?.print), ...options };
  const geo = pageGeometry({
    size: print.size,
    orientation: print.orientation,
    dpi: print.dpi,
    bleedIn: print.bleedIn,
    safeIn: print.safeMarginIn,
    widthIn: print.customWidthIn,
    heightIn: print.customHeightIn,
  });

  const ordered = [...pages].sort((a, b) => a.order - b.order);
  const stories = ordered.filter((p) => (p.type ?? 'story') === 'story');

  // 1. Required pages. Missing structural pages are warnings, not errors: an
  //    older book without them still prints, and the editor offers to add them.
  if (!ordered.some((p) => p.type === 'title')) {
    add('warning', 'MISSING_TITLE_PAGE', 'This book has no title page — use “Generate Title Page” to add one.');
  }
  if (!ordered.some((p) => p.type === 'ending')) {
    add('warning', 'MISSING_ENDING_PAGE', 'This book has no ending page — use “Add Ending Page” to add one.');
  }
  if (stories.length === 0) {
    add('error', 'NO_STORY_PAGES', 'This book has no story pages to print.');
  }

  // 2. Order must be 1..n with no gaps or duplicates.
  const orders = ordered.map((p) => p.order);
  const contiguous = orders.every((o, i) => o === i + 1);
  if (!contiguous) {
    add('error', 'PAGE_ORDER_BROKEN', 'The page order has gaps or duplicates and would export out of sequence.');
  }

  // 3 & 6. Media presence and effective resolution, per page.
  for (const page of ordered) {
    const label = `Page ${page.order}`;
    const needsArt = (page.type ?? 'story') === 'story';

    if (page.mediaAssetId) {
      const asset = assetsById.get(String(page.mediaAssetId));
      if (!asset || !asset.exists) {
        add('error', 'MISSING_MEDIA', `${label}: its illustration file is missing from storage.`, {
          order: page.order,
          pageId: String(page._id),
        });
        continue;
      }
      if (asset.width && asset.height) {
        const eff = effectiveDpi({
          pxWidth: asset.width,
          pxHeight: asset.height,
          targetWidthIn: geo.trim.widthIn,
          targetHeightIn: geo.trim.heightIn,
        });
        if (eff < print.dpi) {
          add(
            'warning',
            'LOW_RESOLUTION',
            `${label}: the illustration is about ${eff} DPI at this size, below the ${print.dpi} DPI target — it may look soft in print.`,
            { order: page.order, pageId: String(page._id), effectiveDpi: eff },
          );
        }
      } else {
        add('info', 'UNKNOWN_RESOLUTION', `${label}: image resolution is unknown, so its print sharpness can’t be verified.`, {
          order: page.order,
        });
      }
    } else if (needsArt) {
      add('warning', 'NOT_ILLUSTRATED', `${label}: has no illustration yet.`, {
        order: page.order,
        pageId: String(page._id),
      });
    }
  }

  // Colour: flag very saturated colours that shift in print, and be honest that
  // the output is RGB rather than CMYK.
  const vivid = ordered.filter(
    (p) => isVivid(p.layout?.backgroundColor) || isVivid(p.typography?.color),
  );
  if (vivid.length > 0) {
    add(
      'warning',
      'HIGH_SATURATION',
      `${vivid.length} page${vivid.length === 1 ? '' : 's'} use very saturated colours (bright neons) that may shift when printed.`,
      { pages: vivid.map((p) => p.order) },
    );
  }
  add(
    'info',
    'COLOUR_MODE',
    'Colours export as high-resolution RGB; printed colours can differ from the screen. Genuine CMYK is off (no print profile configured).',
  );

  // 8. Interior page count against the binding's rule (configurable per provider).
  const interiorPages = ordered.length;
  const pc = validatePageCount({ interiorPages, binding: print.binding });
  if (!pc.ok) {
    add(
      'warning',
      'PAGE_COUNT',
      `A ${print.binding} usually needs at least ${pc.minPages} interior pages in multiples of ${pc.multipleOf}. This book has ${interiorPages}; the nearest accepted count is ${pc.nextValid}.`,
      { interiorPages, nextValid: pc.nextValid },
    );
  }

  // 9 & 10. The exact dimensions the printer receives — stated, not guessed.
  const spread = coverSpreadGeometry({
    size: print.size,
    orientation: print.orientation,
    dpi: print.dpi,
    bleedIn: print.bleedIn,
    interiorPages,
    binding: print.binding,
    widthIn: print.customWidthIn,
    heightIn: print.customHeightIn,
  });
  add('info', 'PAGE_SPEC', `Each page trims to ${geo.trim.widthPx}×${geo.trim.heightPx}px (${geo.full.widthPx}×${geo.full.heightPx}px with bleed) at ${print.dpi} DPI.`);
  add('info', 'COVER_SPEC', `The wrap-around cover is ${spread.full.widthPx}×${spread.full.heightPx}px with a ${spread.spine.px}px (${spread.spine.inches.toFixed(3)}in) spine.`);

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return {
    // A print-ready export is allowed only with no errors; warnings can be
    // acknowledged by the caller.
    ok: errors.length === 0,
    blocking: errors.length > 0,
    // Stated plainly so nothing downstream mislabels an RGB file as CMYK.
    colorMode: CMYK_ENABLED ? 'cmyk' : 'rgb',
    counts: { errors: errors.length, warnings: warnings.length, info: issues.length - errors.length - warnings.length },
    print,
    geometry: { page: geo, cover: spread, pageCount: pc },
    issues,
  };
}

/** Loads a book's pages and their image dimensions, then runs the checker. */
export async function runPrintCheck(book, options = {}) {
  const pages = await BookPage.find({ bookId: book._id })
    .select('order type title narration mediaAssetId status layout typography')
    .sort({ order: 1 })
    .lean();

  const assetIds = [...new Set(pages.map((p) => p.mediaAssetId).filter(Boolean).map(String))];
  const assets = assetIds.length
    ? await MediaAsset.find({ _id: { $in: assetIds.map((id) => new mongoose.Types.ObjectId(id)) } })
        .select('storage status')
        .lean()
    : [];

  const assetsById = new Map(
    assets.map((a) => [
      String(a._id),
      { exists: a.status !== 'deleted' && a.status !== 'failed', width: a.storage?.width ?? null, height: a.storage?.height ?? null },
    ]),
  );

  return checkPrintReadiness({ book, pages, assetsById, options });
}

export default { checkPrintReadiness, runPrintCheck, resolvePrint };
