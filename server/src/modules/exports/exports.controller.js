import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import * as service from './exports.service.js';
import { runPrintCheck } from './printChecker.js';
import { PAGE_SIZES } from './render/layout.js';
import { EXPORT_FORMATS } from '../../models/enums.js';

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
      /**
       * Both maps are built from the format enum rather than listed by hand. A
       * format missing from a hand-written list shows up in the picker with no
       * name and no size — an omission nobody notices until somebody exports.
       */
      filename: Object.fromEntries(
        EXPORT_FORMATS.map((format) => [format, service.suggestFilename(req.book, format)]),
      ),
      estimatedSizeBytes: Object.fromEntries(
        EXPORT_FORMATS.map((format) => {
          // A cover is one image however long the book is, and anything bound
          // for paper is quoted at the resolution it will really be made at.
          const isCover = format.startsWith('cover_');
          const forPaper = isCover || format === 'print_pdf' || format === 'png_pages';

          return [
            format,
            service.estimateSize({
              pageCount: isCover ? 1 : readiness.total,
              format,
              quality: forPaper ? 'print' : 'high',
            }),
          ];
        }),
      ),
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
