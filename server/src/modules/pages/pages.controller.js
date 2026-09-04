import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import * as pagesService from './pages.service.js';
import { rewritePage } from '../story-generation/story.service.js';
import { withPageImageUrls } from '../books/books.service.js';

/** Every response that returns a page returns a drawable one. */
const drawable = async (page) => {
  const plain = typeof page.toJSON === 'function' ? page.toJSON() : page;
  const [decorated] = await withPageImageUrls([plain]);
  return decorated;
};

export const list = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await withPageImageUrls(await pagesService.listPages(req.book._id)),
    message: 'Pages',
  }),
);

export const update = asyncHandler(async (req, res) => {
  const page = await pagesService.updatePage({
    bookId: req.book._id,
    pageId: req.validated.params.pageId,
    patch: req.validated.body,
  });

  return sendSuccess(res, { data: await drawable(page), message: 'Page updated' });
});

export const add = asyncHandler(async (req, res) => {
  const page = await pagesService.addPage({ book: req.book, at: req.validated.body.at });
  return sendCreated(res, { data: await drawable(page), message: 'Page added' });
});

/** Adds a title page to an older book that has none (idempotent). */
export const addTitlePage = asyncHandler(async (req, res) => {
  const page = await pagesService.addStructuralPage({ book: req.book, type: 'title' });
  return sendCreated(res, { data: await drawable(page), message: 'Title page ready' });
});

/** Adds an ending page to an older book that has none (idempotent). */
export const addEndingPage = asyncHandler(async (req, res) => {
  const page = await pagesService.addStructuralPage({ book: req.book, type: 'ending' });
  return sendCreated(res, { data: await drawable(page), message: 'Ending page ready' });
});

/** Adds whichever of the title/ending pages the book is missing. */
export const preparePrint = asyncHandler(async (req, res) => {
  const result = await pagesService.prepareForPrint({ book: req.book });
  return sendSuccess(res, { data: result, message: 'Prepared for print' });
});

export const duplicate = asyncHandler(async (req, res) => {
  const page = await pagesService.duplicatePage({
    book: req.book,
    pageId: req.validated.params.pageId,
  });

  return sendCreated(res, { data: await drawable(page), message: 'Page duplicated' });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await pagesService.deletePage({
    book: req.book,
    pageId: req.validated.params.pageId,
  });

  return sendSuccess(res, { data: result, message: 'Page deleted' });
});

export const reorder = asyncHandler(async (req, res) => {
  const result = await pagesService.reorderPages({
    book: req.book,
    order: req.validated.body.order,
  });

  return sendSuccess(res, { data: result, message: 'Pages reordered' });
});

export const magicLayout = asyncHandler(async (req, res) => {
  const result = await pagesService.magicLayout({
    bookId: req.book._id,
    pageId: req.validated.params.pageId,
  });

  return sendSuccess(res, {
    data: { page: await drawable(result.page), preset: result.preset, reason: result.reason },
    message: 'Layout chosen',
  });
});

export const setArtwork = asyncHandler(async (req, res) => {
  const page = await pagesService.setPageArtwork({
    book: req.book,
    pageId: req.validated.params.pageId,
    assetId: req.validated.body.assetId,
    userId: req.user._id,
  });

  return sendSuccess(res, { data: await drawable(page), message: 'Page artwork updated' });
});

export const rewrite = asyncHandler(async (req, res) => {
  const result = await rewritePage({
    user: req.user,
    book: req.book,
    pageId: req.validated.params.pageId,
    instruction: req.validated.body?.instruction,
  });

  return sendSuccess(res, {
    data: { page: await drawable(result.page) },
    message: 'Page rewritten',
  });
});

export default {
  list,
  update,
  add,
  duplicate,
  remove,
  reorder,
  magicLayout,
  rewrite,
  setArtwork,
};
