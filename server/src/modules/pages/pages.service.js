import { Book, BookPage, MediaAsset } from '../../models/index.js';
import { withTransaction } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Page ordering.
 *
 * `(bookId, order)` is unique, which is what guarantees a book never has two
 * page 3s — but it also means a naive renumber deadlocks against itself the
 * moment two pages would briefly share a position. Every reordering operation
 * therefore runs in two phases inside a transaction: park every affected page at
 * a negative order, then write the final numbers. Negative values pass because
 * `bulkWrite` issues raw operations and skips the schema's `min: 1` validator.
 */
async function renumber(bookId, orderedIds, session) {
  const park = orderedIds.map((id, index) => ({
    updateOne: { filter: { _id: id }, update: { $set: { order: -(index + 1) } } },
  }));

  const assign = orderedIds.map((id, index) => ({
    updateOne: { filter: { _id: id }, update: { $set: { order: index + 1 } } },
  }));

  await BookPage.bulkWrite(park, { session });
  await BookPage.bulkWrite(assign, { session });

  await Book.updateOne(
    { _id: bookId },
    { $set: { pageCount: orderedIds.length, 'generation.pagesTotal': orderedIds.length } },
    { session },
  );
}

async function orderedIds(bookId, session) {
  const pages = await BookPage.find({ bookId })
    .sort({ order: 1 })
    .select('_id')
    .session(session ?? null);
  return pages.map((page) => page._id);
}

export async function listPages(bookId) {
  return BookPage.find({ bookId }).sort({ order: 1 }).lean();
}

/**
 * Adds a title or ending page to a book that predates the finished structure.
 *
 * Idempotent: a book that already has that page type gets it back untouched, so
 * the action can be offered on any book without risk of a duplicate. The title
 * page goes to the front (every other page shifts up one, via the same two-phase
 * negative-parking the reorder uses); the ending page appends to the back. It
 * never touches the story pages' content or the book's story `pageCount`, only
 * their positions — so nothing else is modified.
 */
export async function addStructuralPage({ book, type }) {
  if (type !== 'title' && type !== 'ending') {
    throw ApiError.badRequest('Only a title or ending page can be added this way.');
  }

  const existing = await BookPage.findOne({ bookId: book._id, type });
  if (existing) return existing;

  return withTransaction(async (session) => {
    if (type === 'title') {
      const pages = await BookPage.find({ bookId: book._id })
        .sort({ order: 1 })
        .select('_id')
        .session(session ?? null);

      if (pages.length > 0) {
        // Park at negatives, then shift each up by one to free order 1.
        await BookPage.bulkWrite(
          pages.map((p, i) => ({ updateOne: { filter: { _id: p._id }, update: { $set: { order: -(i + 1) } } } })),
          { session },
        );
        await BookPage.bulkWrite(
          pages.map((p, i) => ({ updateOne: { filter: { _id: p._id }, update: { $set: { order: i + 2 } } } })),
          { session },
        );
      }

      const [created] = await BookPage.create(
        [
          {
            bookId: book._id,
            ownerId: book.ownerId,
            order: 1,
            type: 'title',
            title: book.title,
            narration: book.author ? `Written by ${book.author}` : '',
            layout: { preset: 'text-only', backgroundColor: '#FBF7EF' },
            status: 'ready',
          },
        ],
        { session, ordered: true },
      );
      return created;
    }

    const last = await BookPage.findOne({ bookId: book._id })
      .sort({ order: -1 })
      .select('order')
      .session(session ?? null);

    const [created] = await BookPage.create(
      [
        {
          bookId: book._id,
          ownerId: book.ownerId,
          order: (last?.order ?? 0) + 1,
          type: 'ending',
          title: 'The End',
          narration: book.moral || 'The End.',
          layout: { preset: 'text-only', backgroundColor: '#FBF7EF' },
          status: 'ready',
        },
      ],
      { session, ordered: true },
    );
    return created;
  });
}

/** Ensures a book has both a title and an ending page; reports what it added. */
export async function prepareForPrint({ book }) {
  const hasTitle = await BookPage.findOne({ bookId: book._id, type: 'title' }).select('_id');
  const addedTitle = !hasTitle;
  if (addedTitle) await addStructuralPage({ book, type: 'title' });

  const hasEnding = await BookPage.findOne({ bookId: book._id, type: 'ending' }).select('_id');
  const addedEnding = !hasEnding;
  if (addedEnding) await addStructuralPage({ book, type: 'ending' });

  return { addedTitle, addedEnding };
}

/**
 * `$set: { layout: { preset } }` replaces the whole subdocument, silently
 * dropping `backgroundColor`. Nested patches are therefore flattened to dotted
 * paths so a partial update stays partial.
 */
function toDottedPaths(patch, prefix = '') {
  const out = {};

  for (const [key, value] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const isPlainObject =
      value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

    if (isPlainObject) Object.assign(out, toDottedPaths(value, path));
    else out[path] = value;
  }

  return out;
}

export async function updatePage({ bookId, pageId, patch }) {
  const page = await BookPage.findOneAndUpdate(
    { _id: pageId, bookId },
    { $set: toDottedPaths(patch) },
    { new: true, runValidators: true },
  );

  if (!page) throw ApiError.notFound('Page not found');
  return page;
}

/**
 * Picks a layout for a page from what the page actually holds.
 *
 * Deliberately deterministic, not a model call: the rule is explainable, free,
 * and instant, and the editor tells the user why it chose what it chose. An
 * illustration with two lines under it wants a different frame than one with a
 * full paragraph.
 */
export function chooseLayout(page) {
  const text = `${page.title ?? ''} ${page.narration ?? ''}`.trim();

  if (!page.mediaAssetId) {
    return { preset: 'text-only', reason: 'This page has no illustration yet.' };
  }
  if (text.length <= 80) {
    return { preset: 'full-bleed', reason: 'Very little text, so the illustration carries the page.' };
  }
  if (text.length <= 240) {
    return { preset: 'image-top', reason: 'Short text sits well beneath the illustration.' };
  }
  return { preset: 'image-left', reason: 'Longer text needs the height, so the art moves beside it.' };
}

export async function magicLayout({ bookId, pageId }) {
  const page = await BookPage.findOne({ _id: pageId, bookId });
  if (!page) throw ApiError.notFound('Page not found');

  const { preset, reason } = chooseLayout(page);
  page.layout.preset = preset;
  await page.save();

  return { page, preset, reason };
}

/**
 * Points a page at an image the user uploaded.
 *
 * The asset must belong to them — otherwise this endpoint would let anyone
 * attach any stored image by guessing an id. The upload's expiry is cleared on
 * the way through, since a page's artwork is no longer a temporary file.
 */
export async function setPageArtwork({ book, pageId, assetId, userId }) {
  const asset = await MediaAsset.findOne({ _id: assetId, ownerId: userId });
  if (!asset) throw ApiError.notFound('That image could not be found');

  const page = await BookPage.findOne({ _id: pageId, bookId: book._id });
  if (!page) throw ApiError.notFound('Page not found');

  // Append what is being replaced so the previous artwork stays recoverable.
  page.revisions.push({
    source: 'import',
    label: 'Before upload',
    narration: page.narration,
    sceneDescription: page.sceneDescription,
    illustrationPrompt: page.illustrationPrompt,
    mediaAssetId: page.mediaAssetId,
    createdBy: userId,
  });

  page.mediaAssetId = asset._id;
  page.status = 'ready';
  page.lastError = null;
  await page.save();

  if (asset.tempExpiresAt) {
    await MediaAsset.updateOne({ _id: asset._id }, { $set: { tempExpiresAt: null } });
  }

  return page;
}

export async function addPage({ book, at }) {
  return withTransaction(async (session) => {
    const ids = await orderedIds(book._id, session);

    if (ids.length >= 60) {
      throw ApiError.badRequest('A book can hold at most 60 pages', { code: 'PAGE_LIMIT' });
    }

    const [created] = await BookPage.create(
      [
        {
          bookId: book._id,
          ownerId: book.ownerId,
          // Parked beyond the end, then renumbered into place below.
          order: ids.length + 1,
          narration: '',
          sceneDescription: '',
          illustrationPrompt: '',
          status: 'pending',
        },
      ],
      { session },
    );

    const position = at === undefined || at === null ? ids.length : Math.min(Math.max(at, 0), ids.length);
    ids.splice(position, 0, created._id);

    await renumber(book._id, ids, session);
    return BookPage.findById(created._id).session(session);
  });
}

export async function duplicatePage({ book, pageId }) {
  return withTransaction(async (session) => {
    const source = await BookPage.findOne({ _id: pageId, bookId: book._id }).session(session);
    if (!source) throw ApiError.notFound('Page not found');

    const ids = await orderedIds(book._id, session);
    if (ids.length >= 60) {
      throw ApiError.badRequest('A book can hold at most 60 pages', { code: 'PAGE_LIMIT' });
    }

    const [copy] = await BookPage.create(
      [
        {
          bookId: book._id,
          ownerId: book.ownerId,
          order: ids.length + 1,
          title: source.title,
          narration: source.narration,
          dialogue: source.dialogue,
          sceneDescription: source.sceneDescription,
          illustrationPrompt: source.illustrationPrompt,
          characterIds: source.characterIds,
          location: source.location,
          mood: source.mood,
          layout: source.layout,
          typography: source.typography,
          // The copy starts unillustrated: the source's image belongs to the
          // source, and revision history is not shared between two pages.
          status: 'pending',
        },
      ],
      { session },
    );

    const index = ids.findIndex((id) => String(id) === String(pageId));
    ids.splice(index + 1, 0, copy._id);

    await renumber(book._id, ids, session);
    return BookPage.findById(copy._id).session(session);
  });
}

export async function deletePage({ book, pageId }) {
  return withTransaction(async (session) => {
    const ids = await orderedIds(book._id, session);

    if (ids.length <= 1) {
      throw ApiError.badRequest('A book needs at least one page', { code: 'LAST_PAGE' });
    }
    if (!ids.some((id) => String(id) === String(pageId))) {
      throw ApiError.notFound('Page not found');
    }

    await BookPage.deleteOne({ _id: pageId, bookId: book._id }, { session });

    await renumber(
      book._id,
      ids.filter((id) => String(id) !== String(pageId)),
      session,
    );

    return { deleted: true };
  });
}

/**
 * `order` is the complete list of page ids in their new sequence. Requiring the
 * whole list — rather than a from/to pair — means a client working from stale
 * data is rejected outright instead of silently shuffling the wrong page.
 */
export async function reorderPages({ book, order }) {
  return withTransaction(async (session) => {
    const ids = (await orderedIds(book._id, session)).map(String);
    const requested = order.map(String);

    const sameSet =
      ids.length === requested.length &&
      new Set(requested).size === requested.length &&
      requested.every((id) => ids.includes(id));

    if (!sameSet) {
      throw ApiError.conflict(
        'The page list has changed since you loaded it. Refresh and try again.',
        { code: 'STALE_PAGE_ORDER' },
      );
    }

    await renumber(book._id, requested, session);
    return { reordered: true };
  });
}

export default {
  listPages,
  updatePage,
  addPage,
  duplicatePage,
  deletePage,
  reorderPages,
  magicLayout,
  chooseLayout,
  setPageArtwork,
};
