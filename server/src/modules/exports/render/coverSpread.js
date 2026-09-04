import { createCanvas, loadImage } from '@napi-rs/canvas';
import { coverSpreadGeometry, pageGeometry } from './printGeometry.js';

/**
 * The full wrap-around cover as one print-ready image: back cover, spine and
 * front cover in a single sheet, sized and laid out by `coverSpreadGeometry` so
 * the spine width matches the page count. The front carries the book's cover
 * artwork; the spine carries the title; the back carries the blurb. Bleed runs
 * to every outer edge.
 */
const SANS = '"Segoe UI", Arial, Helvetica, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

const WATERMARK = 'Made with StoryBook Studio';

/** Minimal word wrap for the canvas, which has no text flow of its own. */
function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCentredBlock(ctx, text, { x, width, top, size, font, colour, lineHeight = 1.4 }) {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = colour;
  const lines = wrap(ctx, text, width);
  let y = top;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    ctx.fillText(line, x + (width - w) / 2, y);
    y += size * lineHeight;
  }
  return y;
}

export async function renderCoverSpread({ book = {}, coverImage = null, interiorPages = 8, options = {} }) {
  const print = book.print ?? {};
  const spread = coverSpreadGeometry({
    size: options.size ?? print.size ?? '8x8',
    orientation: options.orientation ?? print.orientation ?? 'square',
    dpi: options.dpi ?? print.dpi ?? 300,
    bleedIn: options.bleedIn ?? print.bleedIn ?? 0.125,
    binding: options.binding ?? print.binding ?? 'paperback',
    interiorPages,
    widthIn: print.customWidthIn,
    heightIn: print.customHeightIn,
  });

  const canvas = createCanvas(spread.full.widthPx, spread.full.heightPx);
  const ctx = canvas.getContext('2d');
  const h = spread.full.heightPx;
  const scale = spread.dpi / 72; // px per point, for type sizes

  // Ground behind everything — the cover's own dark teal, so a gap never flashes white.
  ctx.fillStyle = '#142e2e';
  ctx.fillRect(0, 0, spread.full.widthPx, h);

  const { back, spine, front } = spread.panels;

  // Front panel: the cover artwork, cover-fit (fill and crop), or the title.
  if (coverImage) {
    const image = await loadImage(coverImage).catch(() => null);
    if (image) {
      const s = Math.max(front.width / image.width, h / image.height);
      const sw = front.width / s;
      const sh = h / s;
      ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, front.x, 0, front.width, h);
    }
  } else {
    drawCentredBlock(ctx, book.title || 'Untitled', {
      x: front.x,
      width: front.width,
      top: h * 0.42,
      size: 34 * scale,
      font: SERIF,
      colour: '#f4ead4',
    });
  }

  // Spine: a darker strip with the title running up it, if it is wide enough.
  ctx.fillStyle = '#0b1a1a';
  ctx.fillRect(spine.x, 0, spine.width, h);
  if (spine.width > 24 * scale && book.title) {
    ctx.save();
    ctx.translate(spine.x + spine.width / 2, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = `${Math.min(spine.width * 0.5, 20 * scale)}px ${SERIF}`;
    ctx.fillStyle = '#f4ead4';
    ctx.textBaseline = 'middle';
    const label = book.title.length > 42 ? `${book.title.slice(0, 40)}…` : book.title;
    ctx.fillText(label, -ctx.measureText(label).width / 2, 0);
    ctx.restore();
  }

  // Back panel: the blurb (description, else moral) and the studio line.
  const blurb = book.description || (book.moral ? `“${book.moral}”` : '');
  if (blurb) {
    drawCentredBlock(ctx, blurb, {
      x: back.x + back.width * 0.12,
      width: back.width * 0.76,
      top: h * 0.3,
      size: 16 * scale,
      font: SERIF,
      colour: '#e9e2d0',
      lineHeight: 1.6,
    });
  }
  ctx.font = `${9 * scale}px ${SANS}`;
  ctx.fillStyle = '#8aa0a0';
  const mark = WATERMARK;
  ctx.fillText(mark, back.x + (back.width - ctx.measureText(mark).width) / 2, h - spread.bleed.px - 24 * scale);

  return {
    buffer: canvas.toBuffer('image/png'),
    pageCount: 1,
    width: canvas.width,
    height: canvas.height,
    spinePx: spread.spine.px,
  };
}

/**
 * A single cover panel — front or back — as its own print-ready image at the
 * page's trim + bleed. The front is the cover artwork (or the title if there is
 * none); the back is the blurb.
 */
export async function renderCoverPanel({ book = {}, side = 'front', coverImage = null, options = {} }) {
  const print = book.print ?? {};
  const geo = pageGeometry({
    size: options.size ?? print.size ?? '8x8',
    orientation: options.orientation ?? print.orientation ?? 'square',
    dpi: options.dpi ?? print.dpi ?? 300,
    bleedIn: options.bleedIn ?? print.bleedIn ?? 0.125,
    safeIn: print.safeMarginIn ?? 0.25,
    widthIn: print.customWidthIn,
    heightIn: print.customHeightIn,
  });

  const w = geo.full.widthPx;
  const h = geo.full.heightPx;
  const scale = geo.dpi / 72;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#142e2e';
  ctx.fillRect(0, 0, w, h);

  if (side === 'front') {
    if (coverImage) {
      const image = await loadImage(coverImage).catch(() => null);
      if (image) {
        const s = Math.max(w / image.width, h / image.height);
        const sw = w / s;
        const sh = h / s;
        ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, 0, 0, w, h);
      }
    } else {
      drawCentredBlock(ctx, book.title || 'Untitled', {
        x: 0,
        width: w,
        top: h * 0.42,
        size: 34 * scale,
        font: SERIF,
        colour: '#f4ead4',
      });
    }
  } else {
    const blurb = book.description || (book.moral ? `“${book.moral}”` : '');
    if (blurb) {
      drawCentredBlock(ctx, blurb, {
        x: w * 0.12,
        width: w * 0.76,
        top: h * 0.3,
        size: 16 * scale,
        font: SERIF,
        colour: '#e9e2d0',
        lineHeight: 1.6,
      });
    }
    ctx.font = `${9 * scale}px ${SANS}`;
    ctx.fillStyle = '#8aa0a0';
    ctx.fillText(WATERMARK, (w - ctx.measureText(WATERMARK).width) / 2, h - geo.bleed.px - 24 * scale);
  }

  return { buffer: canvas.toBuffer('image/png'), pageCount: 1, width: w, height: h };
}

export default { renderCoverSpread, renderCoverPanel };
