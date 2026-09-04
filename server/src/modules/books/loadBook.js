import { Book } from '../../models/index.js';
import { assertOwnership } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

/**
 * Loads the book named in the route and proves the caller owns it, once, before
 * any handler runs. Every nested route (pages, reorder, regenerate) inherits the
 * check, so no individual handler can forget it.
 *
 * A non-owner gets 404 rather than 403 — see `assertOwnership`.
 */
export const loadBook = asyncHandler(async (req, _res, next) => {
  const bookId = req.validated?.params?.bookId ?? req.params.bookId;
  const book = await Book.findById(bookId);

  req.book = assertOwnership(book, req.user);
  next();
});

export default loadBook;
