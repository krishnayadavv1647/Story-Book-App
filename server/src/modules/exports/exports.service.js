import { BookPage, ExportJob, MediaAsset } from '../../models/index.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { requestHash as buildRequestHash } from '../../utils/requestHash.js';
import { ingestBuffer, signAssetUrl, storage } from '../../providers/storage/index.js';
import { notify } from '../notifications/notifications.service.js';
import { renderBookPdf } from './render/pdf.js';
import { renderBookPng, renderBookPngSheets } from './render/png.js';
import { renderBookHtml } from './render/html.js';
import { renderCoverSpread, renderCoverPanel } from './render/coverSpread.js';
import { pdfPrintBox } from './render/printGeometry.js';
import { resolvePrint } from './printChecker.js';
import { zipStore } from '../../utils/zip.js';
import { PAGE_SIZES } from './render/layout.js';

/** The extension each export format saves as. */
const FORMAT_EXT = {
  pdf: 'pdf',
  print_pdf: 'pdf',
  png: 'png',
  cover_spread: 'png',
  cover_front: 'png',
  cover_back: 'png',
  png_pages: 'zip',
  html: 'html',
};

/** The stored MIME for each export format. */
const CONTENT_TYPE = {
  pdf: 'application/pdf',
  print_pdf: 'application/pdf',
  html: 'text/html; charset=utf-8',
  png_pages: 'application/zip',
};

/** The cover artwork's bytes, if the book has one — for the cover spread. */
async function loadCoverImage(book) {
  if (!book.coverMediaId) return null;
  const asset = await MediaAsset.findById(book.coverMediaId);
  if (!asset?.storage?.key) return null;
  const stored = await storage.get(asset.storage.key).catch(() => null);
  return stored?.body ?? null;
}


/** How long a finished export stays downloadable. */
const DOWNLOAD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const FILENAME_SAFE = /[^a-zA-Z0-9]+/g;

export function suggestFilename(book, format) {
  const stem =
    (book.title || 'storybook')
      .trim()
      .replace(FILENAME_SAFE, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'storybook';

  return `${stem}.${FORMAT_EXT[format] ?? format}`;
}

/**
 * A rough size before anything is rendered, so the screen can say what to
 * expect. Deliberately labelled an estimate everywhere it is shown — the real
 * size is only known once the file exists.
 */
export function estimateSize({ pageCount, format, quality }) {
  // Rough bytes per page by format: the flipbook inlines images as base64
  // (~1.37x), and the print-ready PDF embeds full 300-DPI art, so both run
  // heavier than the on-screen PDF. The cover spread is a single large image.
  const perPage =
    format === 'cover_spread' || format === 'cover_front' || format === 'cover_back'
      ? 3_000_000
      : format === 'print_pdf'
        ? 2_500_000
        : format === 'png_pages'
          ? 2_200_000
          : format === 'pdf'
            ? 900_000
            : format === 'html'
              ? 1_900_000
              : 1_400_000;
  const qualityFactor = quality === 'print' ? 2.2 : quality === 'high' ? 1.4 : 1;
  return Math.round(Math.max(pageCount, 1) * perPage * qualityFactor);
}

/**
 * The pages of a book, each with its illustration's bytes loaded.
 *
 * The storage key lives at `asset.storage.key`, not on the asset root — reading
 * the wrong path here silently produced books with no pictures in them.
 */
export async function loadPages(bookId) {
  const pages = await BookPage.find({ bookId }).sort({ order: 1 }).lean();
  const assetIds = [...new Set(pages.map((p) => p.mediaAssetId).filter(Boolean).map(String))];

  const assets = assetIds.length ? await MediaAsset.find({ _id: { $in: assetIds } }) : [];
  const byId = new Map(assets.map((asset) => [String(asset._id), asset]));

  return Promise.all(
    pages.map(async (page) => {
      const asset = page.mediaAssetId ? byId.get(String(page.mediaAssetId)) : null;
      if (!asset?.storage?.key) return { ...page, image: null };

      const stored = await storage.get(asset.storage.key).catch(() => null);
      return { ...page, image: stored?.body ?? null };
    }),
  );
}

/**
 * Starts an export.
 *
 * Rendering happens inline rather than on a queue — a ten-page book takes well
 * under a second, and a job the caller can watch is simpler to reason about than
 * one that has to survive a broker.
 */
export async function requestExport({ user, book, format, quality, options = {} }) {
  const pageCount = await BookPage.countDocuments({ bookId: book._id });
  if (pageCount === 0) {
    throw ApiError.badRequest('This book has no pages to export.', { code: 'NOTHING_TO_EXPORT' });
  }

  const resolved = {
    pageSize: options.pageSize ?? 'a4',
    orientation: options.orientation ?? 'portrait',
    bleedMm: options.bleedMm ?? 0,
    includeCover: options.includeCover ?? true,
    includeBackCover: options.includeBackCover ?? true,
    includePageNumbers: options.includePageNumbers ?? true,
    includeWatermark: options.includeWatermark ?? true,
    filename: options.filename ?? suggestFilename(book, format),
  };

  if (!PAGE_SIZES[resolved.pageSize]) {
    throw ApiError.badRequest('That page size is not available.', { code: 'BAD_PAGE_SIZE' });
  }

  const hash = buildRequestHash({
    kind: 'export',
    bookId: String(book._id),
    format,
    quality,
    options: resolved,
    // A book edited since the last export is a different request.
    revision: book.updatedAt,
  });

  // The same export asked for twice returns the file already paid for.
  const existing = await ExportJob.findOne({ ownerId: user._id, requestHash: hash });
  if (existing?.status === 'succeeded' && existing.outputAssetId) {
    return { job: existing, reused: true };
  }
  if (existing && ['queued', 'processing'].includes(existing.status)) {
    throw ApiError.conflict('That export is already running.', {
      code: 'EXPORT_IN_PROGRESS',
      details: { jobId: String(existing._id) },
    });
  }

  const job =
    existing ??
    (await ExportJob.create({
      ownerId: user._id,
      bookId: book._id,
      format,
      quality,
      options: resolved,
      requestHash: hash,
      pageCount,
      estimatedSizeBytes: estimateSize({ pageCount, format, quality }),
      status: 'queued',
    }));

  await ExportJob.updateOne(
    { _id: job._id },
    {
      $set: { status: 'processing', startedAt: new Date(), progress: 10, error: { code: null, message: null } },
      $inc: { attempts: 1 },
    },
  );

  try {
    const pages = await loadPages(book._id);
    const print = resolvePrint(book.print);

    let rendered;
    if (format === 'pdf') {
      rendered = await renderBookPdf({ book, pages, options: { ...resolved, quality } });
    } else if (format === 'print_pdf') {
      // Print-ready: true physical size and bleed from the book's print
      // settings, crop marks if asked, 300-DPI art, and no watermark or guides.
      rendered = await renderBookPdf({
        book,
        pages,
        options: {
          ...resolved,
          quality: 'print',
          box: pdfPrintBox({
            size: print.size,
            orientation: print.orientation,
            bleedIn: print.bleedIn,
            widthIn: print.customWidthIn,
            heightIn: print.customHeightIn,
          }),
          cropMarks: print.cropMarks,
          includeWatermark: false,
        },
      });
    } else if (format === 'cover_spread') {
      rendered = await renderCoverSpread({
        book,
        coverImage: await loadCoverImage(book),
        interiorPages: pages.length,
      });
    } else if (format === 'cover_front' || format === 'cover_back') {
      rendered = await renderCoverPanel({
        book,
        side: format === 'cover_front' ? 'front' : 'back',
        coverImage: format === 'cover_front' ? await loadCoverImage(book) : null,
      });
    } else if (format === 'png_pages') {
      // One 300-DPI PNG per page, bundled into a zip.
      const { files, pageCount } = await renderBookPngSheets({
        pages,
        options: { ...resolved, quality: 'print' },
      });
      rendered = { buffer: zipStore(files), pageCount };
    } else if (format === 'html') {
      rendered = await renderBookHtml({ book, pages, options: resolved });
    } else {
      rendered = await renderBookPng({ pages, options: { ...resolved, quality } });
    }

    const contentType = CONTENT_TYPE[format] ?? 'image/png';

    const asset = await ingestBuffer({
      body: rendered.buffer,
      contentType,
      ownerId: user._id,
      kind: 'export',
      refs: { bookId: book._id, exportJobId: job._id },
    });

    const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_MS);

    const finished = await ExportJob.findOneAndUpdate(
      { _id: job._id },
      {
        $set: {
          status: 'succeeded',
          progress: 100,
          outputAssetId: asset._id,
          fileSizeBytes: rendered.buffer.length,
          pageCount: rendered.pageCount,
          completedAt: new Date(),
          expiresAt,
        },
      },
      { new: true },
    );

    await notify({
      userId: user._id,
      type: 'export_ready',
      severity: 'success',
      title: `${format.toUpperCase()} export ready`,
      body: `${resolved.filename} — ${rendered.pageCount} pages.`,
      actionPath: `/books/${book._id}/preview`,
      refs: { bookId: book._id, exportJobId: job._id },
    }).catch(() => {});

    // Log the shape of the result, never its content.
    logger.info(
      { format, quality, pages: rendered.pageCount, bytes: rendered.buffer.length },
      'Export rendered',
    );

    return { job: finished, reused: false };
  } catch (err) {
    await ExportJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'failed',
          error: { code: err.code ?? 'EXPORT_FAILED', message: err.message, at: new Date() },
          completedAt: new Date(),
        },
      },
    );

    await notify({
      userId: user._id,
      type: 'export_failed',
      severity: 'error',
      title: `${format.toUpperCase()} export failed`,
      body: 'Nothing was saved. Please try again.',
      actionPath: `/books/${book._id}/preview`,
      refs: { bookId: book._id, exportJobId: job._id },
    }).catch(() => {});

    logger.error({ err, format }, 'Export failed');
    throw ApiError.internal('The export could not be produced.', {
      code: 'EXPORT_FAILED',
    });
  }
}

/**
 * A job with a download URL.
 *
 * Deliberately our own signed media path, never the storage driver's direct
 * URL. A browser ignores the `download` attribute on a cross-origin link, so a
 * presigned R2 URL navigated the page to the PDF instead of saving it — the
 * export looked broken even though the file was perfect. Same-origin also means
 * the file arrives as an attachment with its real name rather than a UUID.
 */
export async function withDownloadUrl(job) {
  const plain = typeof job.toJSON === 'function' ? job.toJSON() : { ...job };
  if (!job.outputAssetId) return { ...plain, downloadUrl: null };

  const asset = await MediaAsset.findById(job.outputAssetId);
  return { ...plain, downloadUrl: asset ? signAssetUrl(String(asset._id)) : null };
}

export async function getExport({ user, jobId }) {
  const job = await ExportJob.findOne({ _id: jobId, ownerId: user._id });
  if (!job) throw ApiError.notFound('Export not found');
  return withDownloadUrl(job);
}

export async function listExports({ user, bookId }) {
  const filter = { ownerId: user._id };
  if (bookId) filter.bookId = bookId;

  const jobs = await ExportJob.find(filter).sort({ createdAt: -1 }).limit(20);
  return Promise.all(jobs.map(withDownloadUrl));
}

/**
 * Marks a book as published so it appears in Published Books. Separate from
 * exporting: someone can export a private draft, and someone can publish
 * without ever downloading a file.
 */
export async function publishBook({ book, published }) {
  book.status = published ? 'published' : 'ready';
  book.publishedAt = published ? new Date() : null;
  await book.save();

  return book;
}

export async function readyCheck(bookId) {
  const pages = await BookPage.find({ bookId }).select('order title narration mediaAssetId').lean();

  const missingArt = pages.filter((page) => !page.mediaAssetId).map((page) => page.order);
  const missingText = pages.filter((page) => !page.narration?.trim()).map((page) => page.order);

  return {
    total: pages.length,
    missingArt,
    missingText,
    ready: pages.length > 0 && missingArt.length === 0 && missingText.length === 0,
  };
}

export default {
  loadPages,
  requestExport,
  getExport,
  listExports,
  publishBook,
  readyCheck,
  estimateSize,
  suggestFilename,
  withDownloadUrl,
};
