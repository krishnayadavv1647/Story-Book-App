import {
  Book,
  BookPage,
  Character,
  ExportJob,
  GenerationJob,
  MediaAsset,
} from '../../models/index.js';
import { withTransaction } from '../../config/db.js';
import { estimateBookCredits } from '../credits/pricing.js';
import { resolveAssetUrl } from '../../providers/storage/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { addPage } from '../pages/pages.service.js';

const SORTS = {
  recent: { updatedAt: -1 },
  created: { createdAt: -1 },
  title: { title: 1 },
};

/**
 * Books belonging to one account.
 *
 * `ownerId` is taken from the authenticated session and applied to the filter
 * here, never accepted from the request — that is what makes the endpoint
 * impossible to point at somebody else's library.
 */
export async function listBooks({ ownerId, status, page, limit, sort, includeArchived }) {
  const filter = { ownerId };
  if (status) filter.status = status;
  if (!includeArchived) filter.isArchived = false;

  const [items, total] = await Promise.all([
    Book.find(filter)
      .sort(SORTS[sort] ?? SORTS.recent)
      .skip((page - 1) * limit)
      .limit(limit)
      .select(
        'title subtitle author description status coverMediaId coverSource pageCount genre ageGroup updatedAt createdAt generation',
      )
      .lean(),
    Book.countDocuments(filter),
  ]);

  return { items: await withCoverUrls(items), total };
}

/**
 * Totals for the dashboard header. Counted in one aggregation rather than a
 * query per status.
 */
export async function summariseLibrary(ownerId) {
  const rows = await Book.aggregate([
    { $match: { ownerId, isArchived: false } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byStatus = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return { total, byStatus };
}

/**
 * How much work finishing this book is, and what it will cost.
 *
 * Illustrations are every page plus a front and back cover, and each character
 * that is not `ready` still needs a design pass of its own. Only outstanding
 * work is counted, so the quote falls as the book gets made rather than
 * restating the whole price every time.
 */
export function estimateGeneration({ pageCount, characters }) {
  const illustrations = pageCount + 2;
  const pending = characters.filter((character) => character.status !== 'ready').length;

  return {
    storyPages: pageCount,
    illustrations,
    charactersToDesign: pending,
    credits: estimateBookCredits({ illustrations, charactersToDesign: pending }),
  };
}

/** The book, its ordered pages, its cast and the estimate — one round trip. */
/**
 * Adds a loadable `coverUrl` to each book.
 *
 * The document stores `coverMediaId`; the library screen needs a signed URL,
 * and was reading a `coverUrl` the API never sent — so every card fell back to
 * its placeholder.
 */
export async function withCoverUrls(books) {
  const ids = [...new Set(books.map((book) => book.coverMediaId).filter(Boolean).map(String))];
  if (ids.length === 0) return books.map((book) => ({ ...book, coverUrl: null }));

  const assets = await MediaAsset.find({ _id: { $in: ids } });
  const urls = new Map(
    await Promise.all(assets.map(async (a) => [String(a._id), await resolveAssetUrl(a)])),
  );

  return books.map((book) => ({
    ...book,
    coverUrl: book.coverMediaId ? (urls.get(String(book.coverMediaId)) ?? null) : null,
  }));
}

/**
 * Adds a loadable `imageUrl` to each page. The document stores an asset id; a
 * browser needs a signed URL, and the editor cannot draw a page without one.
 */
export async function withPageImageUrls(pages) {
  const ids = [...new Set(pages.map((page) => page.mediaAssetId).filter(Boolean).map(String))];
  if (ids.length === 0) return pages.map((page) => ({ ...page, imageUrl: null }));

  const assets = await MediaAsset.find({ _id: { $in: ids } });
  const urls = new Map(
    await Promise.all(assets.map(async (a) => [String(a._id), await resolveAssetUrl(a)])),
  );

  return pages.map((page) => ({
    ...page,
    imageUrl: page.mediaAssetId ? (urls.get(String(page.mediaAssetId)) ?? null) : null,
  }));
}

export async function getBookDetail(book) {
  const [rawPages, characters] = await Promise.all([
    BookPage.find({ bookId: book._id }).sort({ order: 1 }).lean(),
    Character.find({ _id: { $in: book.characterIds ?? [] } }).lean(),
  ]);

  const pages = await withPageImageUrls(rawPages);

  return {
    book: book.toJSON(),
    pages,
    characters,
    // Only story pages are illustrated — the title and ending pages are typeset,
    // not drawn — so the estimate counts those, not the structural pages.
    estimate: estimateGeneration({
      pageCount: pages.filter((page) => (page.type ?? 'story') === 'story').length,
      characters,
    }),
  };
}

/**
 * Metadata edits from the review screen.
 *
 * `pageCount` is not a free-form number: it is the length of the outline. Raising
 * it appends blank pages; lowering it is refused, because silently deleting
 * pages the user has written would destroy work no undo exists for yet.
 */
export async function updateBook({ book, patch }) {
  const { pageCount, ...rest } = patch;

  // Print settings merge over what the book already holds, so saving one field
  // (say the binding) never resets the others to their defaults.
  if (rest.print) {
    const current = book.print?.toObject ? book.print.toObject() : book.print ?? {};
    rest.print = { ...current, ...rest.print };
  }

  if (Object.keys(rest).length > 0) {
    Object.assign(book, rest);
    await book.save();
  }

  if (pageCount !== undefined && pageCount !== book.pageCount) {
    const current = await BookPage.countDocuments({ bookId: book._id });

    if (pageCount < current) {
      throw ApiError.badRequest(
        'To shorten the book, delete the pages you do not want from the outline.',
        { code: 'PAGE_COUNT_DECREASE' },
      );
    }

    for (let i = current; i < pageCount; i += 1) {
      await addPage({ book });
    }
  }

  return Book.findById(book._id);
}

/**
 * Deletes a book and everything that belonged only to it.
 *
 * What goes: the book, its pages, and the jobs that made them — a generation or
 * export job is a record of work on one book and means nothing without it.
 *
 * **What stays: the cast.** Characters are account-wide and reusable across
 * books, so deleting a book must not delete the people in it. A character made
 * for this book and used nowhere else stays in the library, which is the
 * recoverable mistake; deleting one that another book still draws would not be.
 *
 * Artwork is marked deleted rather than purged. The storage drivers store bytes
 * but expose no remove, so the honest thing is a row that says the asset is gone
 * rather than one still pointing at a file nobody can reach. Reaping the bytes
 * needs a driver-level delete, which does not exist yet.
 */
export async function deleteBook({ book }) {
  return withTransaction(async (session) => {
    const pages = await BookPage.countDocuments({ bookId: book._id }).session(session);

    await MediaAsset.updateMany(
      { 'refs.bookId': book._id },
      { $set: { status: 'deleted', deletedAt: new Date() } },
      { session },
    );

    await BookPage.deleteMany({ bookId: book._id }, { session });
    await GenerationJob.deleteMany({ 'refs.bookId': book._id }, { session });
    await ExportJob.deleteMany({ bookId: book._id }, { session });
    await Book.deleteOne({ _id: book._id }, { session });

    return { deleted: true, pages };
  });
}

export default {
  listBooks,
  deleteBook,
  summariseLibrary,
  getBookDetail,
  updateBook,
  estimateGeneration,
  withPageImageUrls,
};
