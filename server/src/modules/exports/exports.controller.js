import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import * as service from './exports.service.js';
import { runPrintCheck } from './printChecker.js';
import { PAGE_SIZES } from './render/layout.js';

/**
 * Runs the print-quality checker for a book and returns its report. Read-only:
 * it never changes the book, so it is safe to call as often as the preview
 * screen needs.
 */
export const printCheck = asyncHandler(async (req, res) => {
  const report = await runPrintCheck(req.book);
  return sendSuccess(res, { data: report, message: 'Print check' });
});

export const create = asyncHandler(async (req, res) => {
  const { format, quality, options } = req.validated.body;

  const { job, reused } = await service.requestExport({
    user: req.user,
    book: req.book,
    format,
    quality,
    options,
  });

  const data = { ...(await service.withDownloadUrl(job)), reused };
  return reused
    ? sendSuccess(res, { data, message: 'Export ready' })
    : sendCreated(res, { data, message: 'Export ready' });
});

export const detail = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.getExport({ user: req.user, jobId: req.validated.params.jobId }),
    message: 'Export',
  }),
);

export const list = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.listExports({ user: req.user, bookId: req.validated.query.bookId }),
    message: 'Exports',
  }),
);

/**
 * What the preview screen needs before anything is spent: whether the book is
 * actually ready, what a file would be called, and roughly how big it would be.
 */
export const options = asyncHandler(async (req, res) => {
  const readiness = await service.readyCheck(req.book._id);

  return sendSuccess(res, {
    data: {
      readiness,
      pageSizes: Object.entries(PAGE_SIZES).map(([value, size]) => ({
        value,
        label: size.label,
      })),
      filename: {
        pdf: service.suggestFilename(req.book, 'pdf'),
        png: service.suggestFilename(req.book, 'png'),
        html: service.suggestFilename(req.book, 'html'),
        print_pdf: service.suggestFilename(req.book, 'print_pdf'),
        cover_spread: service.suggestFilename(req.book, 'cover_spread'),
        cover_front: service.suggestFilename(req.book, 'cover_front'),
        cover_back: service.suggestFilename(req.book, 'cover_back'),
        png_pages: service.suggestFilename(req.book, 'png_pages'),
      },
      estimatedSizeBytes: {
        pdf: service.estimateSize({ pageCount: readiness.total, format: 'pdf', quality: 'high' }),
        png: service.estimateSize({ pageCount: readiness.total, format: 'png', quality: 'high' }),
        html: service.estimateSize({ pageCount: readiness.total, format: 'html', quality: 'high' }),
        print_pdf: service.estimateSize({ pageCount: readiness.total, format: 'print_pdf', quality: 'print' }),
        cover_spread: service.estimateSize({ pageCount: 1, format: 'cover_spread', quality: 'print' }),
        cover_front: service.estimateSize({ pageCount: 1, format: 'cover_front', quality: 'print' }),
        cover_back: service.estimateSize({ pageCount: 1, format: 'cover_back', quality: 'print' }),
        png_pages: service.estimateSize({ pageCount: readiness.total, format: 'png_pages', quality: 'print' }),
      },
    },
    message: 'Export options',
  });
});

export const publish = asyncHandler(async (req, res) => {
  const book = await service.publishBook({
    book: req.book,
    published: req.validated.body.published,
  });

  return sendSuccess(res, { data: book, message: book.publishedAt ? 'Published' : 'Unpublished' });
});

export default { create, detail, list, options, publish };
