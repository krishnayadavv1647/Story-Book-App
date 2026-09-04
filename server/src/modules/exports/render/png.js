import { createCanvas, loadImage } from '@napi-rs/canvas';
import { pageBox, frameFor, QUALITY_DPI } from './layout.js';

/**
 * Renders a book to PNG.
 *
 * Same geometry as the PDF renderer, so the two agree. Every page is drawn into
 * one tall image rather than a folder of files: an export has to arrive as a
 * single downloadable thing, and stacking is honest about what it contains
 * without pulling in a zip dependency to hide it.
 */
const WATERMARK = 'Made with StoryBook Studio';

/**
 * Canvas has no `sans-serif` alias: asking for one silently fell through to
 * whichever family happened to be first on the machine — a decorative script
 * font here — so every exported page came out in mangled lettering. Name real
 * families, and check at least one of them exists.
 */
const SANS = '"Segoe UI", Arial, Helvetica, Verdana, Tahoma';
const SERIF = 'Georgia, "Times New Roman", "Liberation Serif"';

const familyFor = (requested) =>
  requested && /serif/i.test(requested) && !/sans/i.test(requested) ? SERIF : SANS;

/** Wraps text to a width, since a canvas has no text flow of its own. */
function wrap(ctx, text, maxWidth) {
  const lines = [];

  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }

  return lines;
}

function drawParagraph(ctx, text, rect, { font, colour, align, lineHeight }) {
  ctx.font = font;
  ctx.fillStyle = colour;
  ctx.textBaseline = 'top';

  const lines = wrap(ctx, text, rect.width);
  const size = Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 16);
  let y = rect.y;

  for (const line of lines) {
    const width = ctx.measureText(line).width;
    const x =
      align === 'center'
        ? rect.x + (rect.width - width) / 2
        : align === 'right'
          ? rect.x + rect.width - width
          : rect.x;

    ctx.fillText(line, x, y);
    y += size * lineHeight;
  }

  return y;
}

function drawCover(ctx, image, rect) {
  if (!image) {
    ctx.fillStyle = '#EEEEEE';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    return;
  }

  // Cover-fit: fill the box and crop the overflow, never letterbox.
  const scale = Math.max(rect.width / image.width, rect.height / image.height);
  const sw = rect.width / scale;
  const sh = rect.height / scale;

  ctx.drawImage(
    image,
    (image.width - sw) / 2,
    (image.height - sh) / 2,
    sw,
    sh,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  );
}

/**
 * The words on a sheet, auto-fitted to `rect` and clipped to it.
 *
 * Auto-fit steps the size down together until the block fits, so a long page
 * (an adult one can run to a few hundred words) can never overflow into the
 * picture or the folio — the "overlayout" a fixed size produced. The clip cuts
 * a still-too-long last line at the edge rather than letting it spill.
 */
function drawWords(ctx, page, rect, { scale, overlay = false }) {
  const type = page.typography ?? {};
  const size = (type.fontSize ?? 18) * scale;
  const align = ['left', 'center', 'right'].includes(type.textAlign) ? type.textAlign : 'left';
  const family = familyFor(type.fontFamily);

  if (overlay) {
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(rect.x - 8 * scale, rect.y - 8 * scale, rect.width + 16 * scale, rect.height + 16 * scale);
  }

  const colour = overlay ? '#FFFFFF' : type.color || '#111111';
  const lineHeight = type.lineHeight ?? 1.5;

  const layout = (bodySize) => {
    const titleGap = bodySize * 0.6;
    const titleFont = `bold ${bodySize * 1.4}px ${family}`;
    const bodyFont = `${bodySize}px ${family}`;
    ctx.font = titleFont;
    const titleLines = page.title ? wrap(ctx, page.title, rect.width) : [];
    ctx.font = bodyFont;
    const bodyLines = page.narration ? wrap(ctx, page.narration, rect.width) : [];
    const blockHeight =
      titleLines.length * bodySize * 1.4 * 1.25 +
      (titleLines.length ? titleGap : 0) +
      bodyLines.length * bodySize * lineHeight;
    return { titleGap, titleFont, bodyFont, blockHeight };
  };

  const minSize = 8 * scale;
  let bodySize = size;
  let block = layout(bodySize);
  while (block.blockHeight > rect.height && bodySize > minSize) {
    bodySize = Math.max(minSize, bodySize - scale);
    block = layout(bodySize);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();

  let y = overlay ? rect.y : rect.y + Math.max(0, (rect.height - block.blockHeight) / 2);

  if (page.title) {
    y = drawParagraph(ctx, page.title, { ...rect, y }, {
      font: block.titleFont,
      colour,
      align,
      lineHeight: 1.25,
    });
    y += block.titleGap;
  }

  if (page.narration) {
    drawParagraph(ctx, page.narration, { ...rect, y }, {
      font: block.bodyFont,
      colour,
      align,
      lineHeight,
    });
  }

  ctx.restore();
}

/** The page number and the studio mark in the foot of a sheet. */
function drawFurniture(ctx, { order, overlay, sheetWidth, sheetHeight, scale, options }) {
  if (options.includePageNumbers !== false && order != null) {
    ctx.font = `${9 * scale}px ${SANS}`;
    ctx.fillStyle = overlay ? '#FFFFFF' : '#777777';
    const label = String(order);
    ctx.fillText(label, (sheetWidth - ctx.measureText(label).width) / 2, sheetHeight - 30 * scale);
  }

  if (options.includeWatermark !== false) {
    ctx.font = `${7 * scale}px ${SANS}`;
    ctx.fillStyle = overlay ? '#DDDDDD' : '#AAAAAA';
    ctx.fillText(
      WATERMARK,
      (sheetWidth - ctx.measureText(WATERMARK).width) / 2,
      sheetHeight - 16 * scale,
    );
  }
}

/**
 * Expands pages into the sheets they print as: a spread is an opening (its
 * illustration on one sheet, its words on the next) and every other preset is
 * a single sheet.
 */
function buildSheetList(pages) {
  const list = [];
  for (const [index, page] of pages.entries()) {
    const preset = page.layout?.preset ?? 'spread';
    const order = page.order ?? index + 1;
    if (preset === 'spread') {
      list.push({ kind: 'art', page, order });
      list.push({ kind: 'text', page, order });
    } else {
      list.push({ kind: 'single', page, order, preset });
    }
  }
  return list;
}

/** The sheet dimensions and geometry for a set of export options. */
function sheetDims(options) {
  const box = pageBox({ ...options, bleedMm: 0 });
  const scale = (QUALITY_DPI[options.quality] ?? QUALITY_DPI.standard) / 72;
  const sheetWidth = Math.round(box.width * scale);
  const sheetHeight = Math.round(box.height * scale);
  const trim = {
    x: box.trim.x * scale,
    y: box.trim.y * scale,
    width: box.trim.width * scale,
    height: box.trim.height * scale,
  };
  return { scale, sheetWidth, sheetHeight, gap: Math.round(16 * scale), trim, full: { x: 0, y: 0, width: sheetWidth, height: sheetHeight } };
}

/** Paints one sheet into `ctx` at the current origin. */
async function paintSheet(ctx, sheet, { scale, sheetWidth, sheetHeight, trim, full, options }) {
  const { page } = sheet;

  ctx.fillStyle = page.layout?.backgroundColor || '#FFFFFF';
  ctx.fillRect(0, 0, sheetWidth, sheetHeight);

  if (sheet.kind === 'art') {
    const image = page.image ? await loadImage(page.image).catch(() => null) : null;
    drawCover(ctx, image, full);
    // The illustration leaf carries no folio, matching the PDF and reference.
  } else if (sheet.kind === 'text') {
    const textRect = {
      x: trim.x + trim.width * 0.14,
      y: trim.y + trim.height * 0.12,
      width: trim.width * 0.72,
      height: trim.height * 0.76,
    };
    drawWords(ctx, page, textRect, { scale });
    drawFurniture(ctx, { order: sheet.order, overlay: false, sheetWidth, sheetHeight, scale, options });
  } else {
    const frame = frameFor(sheet.preset, trim);
    if (frame.image) {
      const image = page.image ? await loadImage(page.image).catch(() => null) : null;
      drawCover(ctx, image, frame.image);
    }
    if (frame.text) drawWords(ctx, page, frame.text, { scale, overlay: frame.overlay });
    drawFurniture(ctx, { order: sheet.order, overlay: frame.overlay, sheetWidth, sheetHeight, scale, options });
  }
}

/**
 * @param {object} input
 * @param {Array}  input.pages    ordered pages, each optionally carrying `image` (a Buffer)
 * @param {object} input.options  pageSize, orientation, quality, includePageNumbers, includeWatermark
 * @returns {Promise<{ buffer: Buffer, pageCount: number, width: number, height: number }>}
 */
export async function renderBookPng({ pages, options = {} }) {
  const dims = sheetDims(options);
  const { sheetWidth, sheetHeight, gap } = dims;
  const sheetList = buildSheetList(pages);

  const canvas = createCanvas(
    sheetWidth,
    sheetHeight * sheetList.length + gap * Math.max(0, sheetList.length - 1),
  );
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#E9E9E9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const [at, sheet] of sheetList.entries()) {
    ctx.save();
    ctx.translate(0, at * (sheetHeight + gap));
    await paintSheet(ctx, sheet, { ...dims, options });
    ctx.restore();
  }

  return {
    buffer: canvas.toBuffer('image/png'),
    pageCount: sheetList.length,
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Every sheet as its own PNG file — the input to the individual-pages zip.
 * @returns {Promise<{ files: Array<{ name: string, data: Buffer }>, pageCount: number }>}
 */
export async function renderBookPngSheets({ pages, options = {} }) {
  const dims = sheetDims(options);
  const { sheetWidth, sheetHeight } = dims;
  const sheetList = buildSheetList(pages);

  const files = [];
  for (const [at, sheet] of sheetList.entries()) {
    const canvas = createCanvas(sheetWidth, sheetHeight);
    const ctx = canvas.getContext('2d');
    await paintSheet(ctx, sheet, { ...dims, options });
    const number = String(at + 1).padStart(2, '0');
    files.push({ name: `page-${number}-${sheet.kind}.png`, data: canvas.toBuffer('image/png') });
  }

  return { files, pageCount: sheetList.length };
}

export default { renderBookPng, renderBookPngSheets };
