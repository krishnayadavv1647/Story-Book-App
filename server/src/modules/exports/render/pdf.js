import PDFDocument from 'pdfkit';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { pageBox, frameFor, coverRect, PAGE_SIZES, QUALITY_DPI } from './layout.js';

/**
 * Renders a book to a print-ready PDF.
 *
 * Everything is drawn from the stored page data, not from a screenshot of the
 * editor: the same layout presets, the same typography, the same background.
 * The document is built in memory and returned as one buffer — books are tens
 * of pages, not thousands, and a buffer is far easier to store and checksum
 * than a stream that has to stay open across an await.
 */
const WATERMARK = 'Made with StoryBook Studio';

function drawImage(doc, buffer, rect) {
  if (!buffer) return;

  try {
    // `cover` scales the image to fill the box, but pdfkit does not crop what
    // that leaves over — the surplus is drawn outside the rect. A 4:3 picture in
    // a squarer box therefore ran 35pt into each margin, and the cover ran clean
    // off the paper. Clip to the rect so "cover" means what the PNG renderer
    // does with a source crop: fill the box, discard the rest.
    doc.save();
    try {
      doc.rect(rect.x, rect.y, rect.width, rect.height).clip();
      doc.image(buffer, rect.x, rect.y, {
        cover: [rect.width, rect.height],
        align: 'center',
        valign: 'center',
      });
    } finally {
      // Restore even when the image throws, or the clip would stay in force and
      // swallow the text drawn after it.
      doc.restore();
    }
  } catch {
    // A corrupt or unsupported image must not take the whole export down; the
    // page is still worth producing without it.
    doc.rect(rect.x, rect.y, rect.width, rect.height).fill('#EEEEEE');
  }
}

/**
 * Shrinks an illustration to the resolution the page actually needs.
 *
 * The image models return very large pictures — a ten-page book embedded them
 * at full size and came out hundreds of megabytes, which chokes the viewer that
 * has to open it. This resamples each one to just cover its rect at the export
 * DPI and re-encodes it as JPEG, which is what turns a 296MB file back into a
 * few. It never upscales, and an image it cannot decode is handed back
 * untouched so the page still gets its art.
 */
async function fitImage(buffer, rect, dpi) {
  if (!buffer) return null;

  try {
    const image = await loadImage(buffer);
    // Pixels needed to cover the rect at this DPI (a point is 1/72 inch).
    const targetW = (rect.width / 72) * dpi;
    const targetH = (rect.height / 72) * dpi;
    const scale = Math.max(targetW / image.width, targetH / image.height);
    if (scale >= 1) return buffer; // already small enough — no needless re-encode

    const w = Math.max(1, Math.round(image.width * scale));
    const h = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(w, h);
    canvas.getContext('2d').drawImage(image, 0, 0, w, h);
    return canvas.toBuffer('image/jpeg', 82);
  } catch {
    return buffer;
  }
}

/**
 * Draws the title and narration inside `rect` and never outside it.
 *
 * Two things keep it from spilling into the picture above or the page number
 * below — the "overlayout" a long page used to produce. First it auto-fits:
 * the block is measured at the requested size and the whole thing is stepped
 * down together until it fits the band (an adult page can run to a few hundred
 * words). Second it clips to the band, so even at the floor size nothing is
 * ever painted beyond it.
 */
function drawText(doc, page, rect, { overlay = false } = {}) {
  const type = page.typography ?? {};
  const align = ['left', 'center', 'right', 'justify'].includes(type.textAlign)
    ? type.textAlign
    : 'left';

  if (overlay) {
    // Text over artwork needs its own ground or it is unreadable.
    doc.save();
    doc.rect(rect.x - 8, rect.y - 8, rect.width + 16, rect.height + 16).fillOpacity(0.72).fill('#000000');
    doc.restore();
  }

  const colour = overlay ? '#FFFFFF' : type.color || '#111111';
  const requested = type.fontSize ?? 18;
  const lineFactor = type.lineHeight ?? 1.5;
  const MIN_SIZE = 8;

  const measure = (bodySize) => {
    const titleSize = Math.max(12, bodySize * 1.4);
    const lineGap = (lineFactor - 1) * bodySize;
    const titleGap = bodySize * 0.6;
    const titleHeight = page.title
      ? doc.font('Helvetica-Bold').fontSize(titleSize).heightOfString(page.title, { width: rect.width })
      : 0;
    const bodyHeight = page.narration
      ? doc.font('Helvetica').fontSize(bodySize).heightOfString(page.narration, { width: rect.width, lineGap })
      : 0;
    const blockHeight = titleHeight + (page.title ? titleGap : 0) + bodyHeight;
    return { titleSize, lineGap, titleGap, blockHeight };
  };

  // Step the whole block down together until it fits the band.
  let bodySize = requested;
  let m = measure(bodySize);
  while (m.blockHeight > rect.height && bodySize > MIN_SIZE) {
    bodySize = Math.max(MIN_SIZE, bodySize - 1);
    m = measure(bodySize);
  }

  // Clip to the band: the last line of a still-too-long page is cut at the
  // edge rather than drawn over the picture or the folio.
  doc.save();
  doc.rect(rect.x, rect.y, rect.width, rect.height).clip();

  let cursor = overlay ? rect.y : rect.y + Math.max(0, (rect.height - m.blockHeight) / 2);

  if (page.title) {
    doc
      .font('Helvetica-Bold')
      .fontSize(m.titleSize)
      .fillColor(colour)
      .text(page.title, rect.x, cursor, { width: rect.width, align });
    cursor = doc.y + m.titleGap;
  }

  if (page.narration) {
    doc
      .font('Helvetica')
      .fontSize(bodySize)
      .fillColor(colour)
      .text(page.narration, rect.x, cursor, {
        width: rect.width,
        align,
        lineGap: m.lineGap,
        // A hard height stops pdfkit flowing an overlong paragraph onto a new
        // page of its own.
        height: Math.max(0, rect.y + rect.height - cursor),
      });
  }

  doc.restore();
}

/** Crop marks at the four corners, showing a trimmer where to cut. */
function drawBleedMarks(doc, box) {
  if (!box.bleed) return;

  const { trim, bleed } = box;
  const len = Math.min(bleed, 12);

  doc.save().lineWidth(0.5).strokeColor('#000000');
  for (const [x, y, dx, dy] of [
    [trim.x, trim.y, -1, -1],
    [trim.x + trim.width, trim.y, 1, -1],
    [trim.x, trim.y + trim.height, -1, 1],
    [trim.x + trim.width, trim.y + trim.height, 1, 1],
  ]) {
    doc.moveTo(x + dx * 2, y).lineTo(x + dx * (2 + len), y);
    doc.moveTo(x, y + dy * 2).lineTo(x, y + dy * (2 + len));
  }
  doc.stroke().restore();
}

function drawCover(doc, book, box, coverImage) {
  const { trim } = box;

  doc.rect(0, 0, box.width, box.height).fill('#FFFFFF');
  if (coverImage) drawImage(doc, coverImage, { ...trim, height: trim.height * 0.62 });

  const textTop = trim.y + trim.height * 0.68;
  doc
    .font('Helvetica-Bold')
    .fontSize(30)
    .fillColor('#111111')
    .text(book.title || 'Untitled', trim.x + 24, textTop, {
      width: trim.width - 48,
      align: 'center',
    });

  if (book.description) {
    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#555555')
      .text(book.description, trim.x + 24, doc.y + 10, { width: trim.width - 48, align: 'center' });
  }
}

function drawBackCover(doc, book, box) {
  const { trim } = box;
  doc.rect(0, 0, box.width, box.height).fill('#111111');

  doc
    .font('Helvetica')
    .fontSize(12)
    .fillColor('#FFFFFF')
    .text(book.moral ? `“${book.moral}”` : 'The End', trim.x + 40, trim.y + trim.height / 2 - 20, {
      width: trim.width - 80,
      align: 'center',
    });
}

/**
 * @param {object} input
 * @param {object} input.book
 * @param {Array}  input.pages     ordered pages, each optionally carrying `image` (a Buffer)
 * @param {object} input.options   pageSize, orientation, bleedMm, includeCover,
 *                                 includeBackCover, includePageNumbers, includeWatermark
 * @returns {Promise<{ buffer: Buffer, pageCount: number }>}
 */
export async function renderBookPdf({ book, pages, options = {} }) {
  // A caller may hand in a precomputed box (the print-ready export passes the
  // true physical size in points from `pdfPrintBox`); the digital path passes
  // none and gets the page-size preset exactly as before.
  const box = options.box ?? pageBox(options);
  // The DPI images are embedded at. PDF geometry is vector points, but the
  // pictures are raster, so this is what decides both their sharpness and the
  // file's weight.
  const dpi = QUALITY_DPI[options.quality] ?? QUALITY_DPI.high;

  const doc = new PDFDocument({
    size: [box.width, box.height],
    margin: 0,
    autoFirstPage: false,
    info: {
      Title: book.title || 'Untitled',
      Author: 'StoryBook Studio',
      Creator: 'StoryBook Studio',
    },
  });

  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  /**
   * Where each leaf of the book lands on paper.
   *
   * Normally one leaf per sheet. With `spreads`, two leaves share a
   * double-width sheet so the file reads like an open book — the cover alone on
   * the right of the first sheet, exactly as a book opens, and every pair after
   * it side by side. Nothing about how a leaf is drawn changes: the origin is
   * moved to its half and the same drawing code runs against `box` as before.
   *
   * `/PageLayout /TwoPageRight` would ask a viewer to do this without touching
   * the pages, and Acrobat obliges — but Chrome ignores it entirely, which is
   * where most readers open a file. So the pairing is done in the geometry,
   * where no viewer can decline it.
   */
  const spreads = Boolean(options.spreads);
  const sheetSize = spreads ? [box.width * 2, box.height] : [box.width, box.height];

  let sheets = 0;
  let leaves = 0;
  let leafOpen = false;

  const newSheet = () => {
    if (leafOpen) {
      doc.restore();
      leafOpen = false;
    }

    // A new sheet for every leaf normally; when pairing, for the cover and then
    // for each odd leaf, which is the one that opens a spread on the left.
    if (!spreads || leaves === 0 || leaves % 2 === 1) {
      doc.addPage({ size: sheetSize, margin: 0 });
      sheets += 1;
    }

    if (spreads) {
      const onRight = leaves === 0 || leaves % 2 === 0;
      doc.save();
      doc.translate(onRight ? box.width : 0, 0);
      leafOpen = true;
    }

    leaves += 1;
  };

  if (options.includeCover !== false) {
    newSheet();
    const coverSource = pages.find((page) => page.image)?.image ?? null;
    // The cover art fills the top 62% of the trim (see drawCover), so fit to
    // that rather than to the whole page.
    const coverArtRect = { ...box.trim, height: box.trim.height * 0.62 };
    drawCover(doc, book, box, await fitImage(coverSource, coverArtRect, dpi));
    if (options.bleedMm || options.cropMarks) drawBleedMarks(doc, box);
  }

  // The page number and the studio mark, in the foot of the trim.
  const drawFurniture = (order, overlay) => {
    if (options.includePageNumbers !== false) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(overlay ? '#FFFFFF' : '#777777')
        .text(String(order), box.trim.x, box.trim.y + box.trim.height - 22, {
          width: box.trim.width,
          align: 'center',
        });
    }

    if (options.includeWatermark !== false) {
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(overlay ? '#DDDDDD' : '#AAAAAA')
        .text(WATERMARK, box.trim.x, box.trim.y + box.trim.height - 11, {
          width: box.trim.width,
          align: 'center',
        });
    }
  };

  // A full-bleed illustration runs to the paper's edge, bleed included.
  const full = { x: 0, y: 0, width: box.width, height: box.height };

  for (const [index, page] of pages.entries()) {
    const preset = page.layout?.preset ?? 'spread';
    const background = page.layout?.backgroundColor || '#FFFFFF';
    const order = page.order ?? index + 1;

    if (preset === 'spread') {
      // The opening the preview and the reader draw: a full-bleed illustration
      // on one leaf, and the words with a whole leaf to themselves on the next,
      // so the text is never squeezed into a strip beside the picture. The
      // illustration leaf carries no folio, exactly as the reference book sets it.
      newSheet();
      doc.rect(0, 0, box.width, box.height).fill(background);
      drawImage(doc, await fitImage(page.image, full, dpi), full);
      if (options.bleedMm || options.cropMarks) drawBleedMarks(doc, box);

      newSheet();
      doc.rect(0, 0, box.width, box.height).fill(background);
      const textRect = {
        x: box.trim.x + box.trim.width * 0.14,
        y: box.trim.y + box.trim.height * 0.12,
        width: box.trim.width * 0.72,
        height: box.trim.height * 0.76,
      };
      drawText(doc, page, textRect, { overlay: false });
      drawFurniture(order, false);
      if (options.bleedMm || options.cropMarks) drawBleedMarks(doc, box);
      continue;
    }

    // Legacy single-leaf presets: the picture and the words share one page.
    newSheet();
    doc.rect(0, 0, box.width, box.height).fill(background);
    const frame = frameFor(preset, box.trim);
    if (frame.image) drawImage(doc, await fitImage(page.image, frame.image, dpi), frame.image);
    if (frame.text) drawText(doc, page, frame.text, { overlay: frame.overlay });
    drawFurniture(order, frame.overlay);
    if (options.bleedMm || options.cropMarks) drawBleedMarks(doc, box);
  }

  if (options.includeBackCover !== false) {
    newSheet();
    drawBackCover(doc, book, box);
    if (options.bleedMm || options.cropMarks) drawBleedMarks(doc, box);
  }

  if (leafOpen) doc.restore();

  doc.end();
  await finished;

  // `pageCount` is what the reader will page through, so it counts sheets — in
  // a spread file that is half the number of leaves, which is the point.
  return { buffer: Buffer.concat(chunks), pageCount: sheets, leafCount: leaves };
}

export { PAGE_SIZES, coverRect };
export default { renderBookPdf };
