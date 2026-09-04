import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendPaginated, sendSuccess } from '../../utils/apiResponse.js';
import * as booksService from './books.service.js';

export const list = asyncHandler(async (req, res) => {
  const { page, limit, sort, status, includeArchived } = req.validated.query;

  const { items, total } = await booksService.listBooks({
    ownerId: req.user._id,
    status,
    page,
    limit,
    sort,
    includeArchived,
  });

  return sendPaginated(res, { items, page, limit, total, message: 'Books' });
});

export const summary = asyncHandler(async (req, res) => {
  const data = await booksService.summariseLibrary(req.user._id);
  return sendSuccess(res, { data, message: 'Library summary' });
});

export const detail = asyncHandler(async (req, res) =>
  sendSuccess(res, { data: await booksService.getBookDetail(req.book), message: 'Book' }),
);

export const update = asyncHandler(async (req, res) => {
  const book = await booksService.updateBook({ book: req.book, patch: req.validated.body });
  return sendSuccess(res, { data: book, message: 'Book updated' });
});


/**
 * Irreversible, and named so. `loadBook` has already proved the book belongs to
 * the caller, which is what stops this being a way to delete somebody else's.
 */
export const remove = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await booksService.deleteBook({ book: req.book }),
    message: 'Book deleted',
  }),
);

export default { list, summary, detail, update, remove };
