import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { Book, BookPage, Character, MediaAsset } from '../../../models/index.js';

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_pages_test' });
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

async function signUp(email = 'krishna@example.com') {
  const res = await request(app)
    .post(`${API_PREFIX}/auth/register`)
    .send({ name: 'Krishna Yadav', email, password: 'a-long-enough-passphrase' });
  return { token: res.body.data.accessToken, userId: res.body.data.user.id };
}

const asUser = (req, token) => req.set('Authorization', `Bearer ${token}`);

/** A book with `count` ordered pages and one character. */
async function seedBook(userId, count = 4) {
  const character = await Character.create({
    ownerId: userId,
    name: 'Aarav',
    role: 'main',
    appearance: 'A curious boy.',
  });

  const book = await Book.create({
    ownerId: userId,
    title: 'Aarav and the Whispering Forest',
    pageCount: count,
    status: 'plan_ready',
    characterIds: [character._id],
  });

  const pages = await BookPage.create(
    Array.from({ length: count }, (_, index) => ({
      bookId: book._id,
      ownerId: userId,
      order: index + 1,
      title: `Page ${index + 1}`,
      narration: `Narration ${index + 1}`,
      sceneDescription: `Scene ${index + 1}`,
      characterIds: [character._id],
      location: 'Whispering Forest',
    })),
  );

  return { book, pages, character };
}

const orders = async (bookId) =>
  (await BookPage.find({ bookId }).sort({ order: 1 })).map((p) => `${p.order}:${p.title}`);

describe('GET /books/:bookId', () => {
  it('returns the book, its ordered pages, its cast and a real estimate', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 3);

    const res = await asUser(request(app).get(`${API_PREFIX}/books/${book._id}`), token);

    expect(res.status).toBe(200);
    expect(res.body.data.pages.map((p) => p.order)).toEqual([1, 2, 3]);
    expect(res.body.data.characters).toHaveLength(1);
    expect(res.body.data.estimate).toMatchObject({
      storyPages: 3,
      illustrations: 5, // 3 pages + front and back cover
      charactersToDesign: 1,
    });
  });

  it('hides another account’s book behind a 404', async () => {
    const mine = await signUp('mine@example.com');
    const theirs = await signUp('theirs@example.com');
    const { book } = await seedBook(theirs.userId, 2);

    const res = await asUser(request(app).get(`${API_PREFIX}/books/${book._id}`), mine.token);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /books/:bookId', () => {
  it('updates the metadata the review screen exposes', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 2);

    const res = await asUser(request(app).patch(`${API_PREFIX}/books/${book._id}`), token).send({
      title: 'A New Title',
      ageGroup: '3-5',
      moral: 'Kindness and courage',
    });

    expect(res.status).toBe(200);
    const saved = await Book.findById(book._id);
    expect(saved.title).toBe('A New Title');
    expect(saved.ageGroup).toBe('3-5');
  });

  it('rejects an age group outside the approved set', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 2);

    const res = await asUser(request(app).patch(`${API_PREFIX}/books/${book._id}`), token).send({
      ageGroup: '5-8',
    });

    expect(res.status).toBe(422);
  });

  it('grows the outline when the page count is raised', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 2);

    await asUser(request(app).patch(`${API_PREFIX}/books/${book._id}`), token).send({ pageCount: 4 });

    expect(await BookPage.countDocuments({ bookId: book._id })).toBe(4);
    expect((await BookPage.find({ bookId: book._id }).sort({ order: 1 })).map((p) => p.order)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('refuses to shrink the outline rather than deleting written pages', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 4);

    const res = await asUser(request(app).patch(`${API_PREFIX}/books/${book._id}`), token).send({
      pageCount: 2,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PAGE_COUNT_DECREASE');
    expect(await BookPage.countDocuments({ bookId: book._id })).toBe(4);
  });
});

describe('page edits', () => {
  it('updates one page and leaves its siblings untouched', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 3);

    await asUser(
      request(app).patch(`${API_PREFIX}/books/${book._id}/pages/${pages[1]._id}`),
      token,
    ).send({ narration: 'Rewritten narration', location: 'The Forest Gate' });

    const after = await BookPage.find({ bookId: book._id }).sort({ order: 1 });
    expect(after[1].narration).toBe('Rewritten narration');
    expect(after[0].narration).toBe('Narration 1');
    expect(after[2].narration).toBe('Narration 3');
    expect(after.map((p) => p.order)).toEqual([1, 2, 3]);
  });

  it('ignores fields the client has no business setting', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 2);

    await asUser(
      request(app).patch(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}`),
      token,
    ).send({ narration: 'Fine', order: 99, status: 'ready', ownerId: new mongoose.Types.ObjectId() });

    const page = await BookPage.findById(pages[0]._id);
    expect(page.narration).toBe('Fine');
    expect(page.order).toBe(1);
    expect(page.status).toBe('pending');
    expect(page.ownerId.toString()).toBe(userId);
  });
});

describe('adding, duplicating and deleting', () => {
  it('appends a page and keeps the numbering contiguous', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 3);

    const res = await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/pages`), token).send({});

    expect(res.status).toBe(201);
    expect(await orders(book._id)).toEqual(['1:Page 1', '2:Page 2', '3:Page 3', '4:']);
    expect((await Book.findById(book._id)).pageCount).toBe(4);
  });

  it('inserts a duplicate directly after its source', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 3);

    const res = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}/duplicate`),
      token,
    );

    expect(res.status).toBe(201);
    expect(await orders(book._id)).toEqual(['1:Page 1', '2:Page 1', '3:Page 2', '4:Page 3']);

    // The copy starts unillustrated and carries no revision history.
    const copy = await BookPage.findById(res.body.data._id);
    expect(copy.status).toBe('pending');
    expect(copy.mediaAssetId).toBeNull();
    expect(copy.revisions).toHaveLength(0);
  });

  it('closes the gap when a page is deleted', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 4);

    await asUser(
      request(app).delete(`${API_PREFIX}/books/${book._id}/pages/${pages[1]._id}`),
      token,
    );

    expect(await orders(book._id)).toEqual(['1:Page 1', '2:Page 3', '3:Page 4']);
    expect((await Book.findById(book._id)).pageCount).toBe(3);
  });

  it('refuses to delete the only page', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 1);

    const res = await asUser(
      request(app).delete(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}`),
      token,
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LAST_PAGE');
  });
});

describe('reordering', () => {
  it('moves a page to the front without colliding on the unique index', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 4);

    const moved = [pages[3]._id, pages[0]._id, pages[1]._id, pages[2]._id];
    const res = await asUser(
      request(app).patch(`${API_PREFIX}/books/${book._id}/pages/reorder`),
      token,
    ).send({ order: moved });

    expect(res.status).toBe(200);
    expect(await orders(book._id)).toEqual(['1:Page 4', '2:Page 1', '3:Page 2', '4:Page 3']);
  });

  it('handles a full reversal, the worst case for a naive renumber', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 5);

    await asUser(request(app).patch(`${API_PREFIX}/books/${book._id}/pages/reorder`), token).send({
      order: pages.map((p) => p._id).reverse(),
    });

    expect(await orders(book._id)).toEqual([
      '1:Page 5',
      '2:Page 4',
      '3:Page 3',
      '4:Page 2',
      '5:Page 1',
    ]);
  });

  it('rejects an incomplete list rather than reordering the wrong pages', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 4);

    const res = await asUser(
      request(app).patch(`${API_PREFIX}/books/${book._id}/pages/reorder`),
      token,
    ).send({ order: [pages[1]._id, pages[0]._id] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STALE_PAGE_ORDER');
    // Nothing moved.
    expect(await orders(book._id)).toEqual(['1:Page 1', '2:Page 2', '3:Page 3', '4:Page 4']);
  });

  it('rejects a list containing a page from another book', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 3);
    const other = await seedBook(userId, 1);

    const res = await asUser(
      request(app).patch(`${API_PREFIX}/books/${book._id}/pages/reorder`),
      token,
    ).send({ order: [pages[0]._id, pages[1]._id, other.pages[0]._id] });

    expect(res.status).toBe(409);
  });

  it('refuses to reorder somebody else’s book', async () => {
    const mine = await signUp('mine@example.com');
    const theirs = await signUp('theirs@example.com');
    const { book, pages } = await seedBook(theirs.userId, 2);

    const res = await asUser(
      request(app).patch(`${API_PREFIX}/books/${book._id}/pages/reorder`),
      mine.token,
    ).send({ order: pages.map((p) => p._id).reverse() });

    expect(res.status).toBe(404);
  });
});

describe('book editor — page styling', () => {
  it('updates only the layout keys named, leaving the rest of the subdocument alone', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 2);

    await BookPage.updateOne(
      { _id: pages[0]._id },
      { $set: { 'layout.backgroundColor': '#FFEEAA', 'layout.preset': 'image-top' } },
    );

    const res = await asUser(
      request(app).patch(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}`),
      token,
    ).send({ layout: { preset: 'image-left' } });

    expect(res.status).toBe(200);

    const stored = await BookPage.findById(pages[0]._id);
    expect(stored.layout.preset).toBe('image-left');
    // A nested $set would have replaced the whole subdocument and lost this.
    expect(stored.layout.backgroundColor).toBe('#FFEEAA');
  });

  it('updates typography without disturbing the page text', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 1);

    const res = await asUser(
      request(app).patch(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}`),
      token,
    ).send({ typography: { fontSize: 24, textAlign: 'center' } });

    expect(res.status).toBe(200);

    const stored = await BookPage.findById(pages[0]._id);
    expect(stored.typography.fontSize).toBe(24);
    expect(stored.typography.textAlign).toBe('center');
    expect(stored.typography.lineHeight).toBe(1.5);
    expect(stored.narration).toBe('Narration 1');
  });

  it('refuses a colour that is not a colour', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 1);

    const res = await asUser(
      request(app).patch(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}`),
      token,
    ).send({ layout: { backgroundColor: 'red; background-image: url(x)' } });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('still refuses to let a client set what the server owns', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 2);

    const res = await asUser(
      request(app).patch(`${API_PREFIX}/books/${book._id}/pages/${pages[1]._id}`),
      token,
    ).send({ order: 1, status: 'ready' });

    expect(res.status).toBe(422);

    const stored = await BookPage.findById(pages[1]._id);
    expect(stored.order).toBe(2);
    expect(stored.status).toBe('pending');
  });
});

describe('book editor — magic layout', () => {
  it('picks text-only when the page has no illustration', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 1);

    const res = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}/magic-layout`),
      token,
    ).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.preset).toBe('text-only');
    // It says why, so the choice is not a mystery.
    expect(res.body.data.reason).toMatch(/no illustration/i);
    expect((await BookPage.findById(pages[0]._id)).layout.preset).toBe('text-only');
  });

  it('gives a long page the side-by-side layout and a short one the full bleed', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 2);

    const asset = new mongoose.Types.ObjectId();
    await BookPage.updateOne(
      { _id: pages[0]._id },
      { $set: { mediaAssetId: asset, title: 'A', narration: 'Short.' } },
    );
    await BookPage.updateOne(
      { _id: pages[1]._id },
      { $set: { mediaAssetId: asset, narration: 'x'.repeat(400) } },
    );

    const short = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}/magic-layout`),
      token,
    ).send({});
    const long = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/pages/${pages[1]._id}/magic-layout`),
      token,
    ).send({});

    expect(short.body.data.preset).toBe('full-bleed');
    expect(long.body.data.preset).toBe('image-left');
  });
});

/** Emulates the Gemini Interactions API for the rewrite endpoint. */
function stubGemini(reply) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (reply?.httpStatus && reply.httpStatus >= 400) {
        return {
          ok: false,
          status: reply.httpStatus,
          json: async () => ({ error: { message: 'upstream failure' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'interaction-1',
          status: 'completed',
          output_text: reply.text ?? JSON.stringify(reply.rewrite),
          usage: { total_input_tokens: 90, total_output_tokens: 120, total_thought_tokens: 0 },
        }),
      };
    }),
  );
}

describe('book editor — rewrite text', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('replaces the text and keeps the original recoverable', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 1);
    stubGemini({ rewrite: { title: 'The Whispering Map', narration: 'A map that knew his name.' } });
    const res = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}/rewrite`),
      token,
    ).send({ instruction: 'Make it more playful' });

    expect(res.status).toBe(200);

    const stored = await BookPage.findById(pages[0]._id);
    expect(stored.narration).toBe('A map that knew his name.');
    expect(stored.title).toBe('The Whispering Map');
    // The words the user had before are not gone.
    expect(stored.revisions.at(-1).narration).toBe('Narration 1');
  });

  it('keeps the original when the provider fails', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 1);
    stubGemini({ httpStatus: 503 });
    const res = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}/rewrite`),
      token,
    ).send({});

    // An unavailable upstream surfaces as 502 Bad Gateway, not the raw 503.
    expect(res.status).toBe(502);

    const stored = await BookPage.findById(pages[0]._id);
    expect(stored.narration).toBe('Narration 1');
    expect(stored.revisions).toHaveLength(0);
  });

  it('keeps the page when the rewrite comes back empty rather than wiping it', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 1);
    stubGemini({ rewrite: { title: '', narration: '' } });
    const res = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}/rewrite`),
      token,
    ).send({});

    expect(res.status).toBe(502);
    expect((await BookPage.findById(pages[0]._id)).narration).toBe('Narration 1');
  });

  it('refuses to rewrite a page that has nothing on it', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 1);
    await BookPage.updateOne({ _id: pages[0]._id }, { $set: { title: '', narration: '' } });
    const res = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}/rewrite`),
      token,
    ).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOTHING_TO_REWRITE');
    // Rejected before any spending.
  });

  it('will not rewrite a page in someone else’s book', async () => {
    const { userId } = await signUp();
    const { book, pages } = await seedBook(userId, 1);
    const intruder = await signUp('someone-else@example.com');
    stubGemini({ rewrite: { title: 'x', narration: 'y' } });

    const res = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}/rewrite`),
      intruder.token,
    ).send({});

    expect(res.status).toBe(404);
    expect((await BookPage.findById(pages[0]._id)).narration).toBe('Narration 1');
  });
});

describe('book editor — character consistency', () => {
  it('is on by default and can be turned off for one page', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 2);

    expect((await BookPage.findById(pages[0]._id)).characterConsistency).toBe(true);

    const res = await asUser(
      request(app).patch(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}`),
      token,
    ).send({ characterConsistency: false });

    expect(res.status).toBe(200);
    expect((await BookPage.findById(pages[0]._id)).characterConsistency).toBe(false);
    // Only this page — the setting is per page, not per book.
    expect((await BookPage.findById(pages[1]._id)).characterConsistency).toBe(true);
  });
});

describe('book editor — uploaded artwork', () => {
  const upload = async (token) => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mM8w8DwnwEJMOEUGdECAKAaAv3rzZgUAAAAAElFTkSuQmCC',
      'base64',
    );
    const res = await asUser(request(app).post(`${API_PREFIX}/media/upload`), token).attach(
      'file',
      png,
      'art.png',
    );
    return res.body.data.assetId;
  };

  it('attaches an uploaded image and keeps the previous artwork recoverable', async () => {
    const { token, userId } = await signUp();
    const { book, pages } = await seedBook(userId, 1);
    const previous = new mongoose.Types.ObjectId();
    await BookPage.updateOne({ _id: pages[0]._id }, { $set: { mediaAssetId: previous } });

    const assetId = await upload(token);
    const res = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}/artwork`),
      token,
    ).send({ assetId });

    expect(res.status).toBe(200);
    expect(res.body.data.imageUrl).toBeTruthy();

    const stored = await BookPage.findById(pages[0]._id);
    expect(String(stored.mediaAssetId)).toBe(assetId);
    expect(stored.status).toBe('ready');
    expect(String(stored.revisions.at(-1).mediaAssetId)).toBe(String(previous));

    // No longer a temporary upload, so the TTL reaper must not take it.
    expect((await MediaAsset.findById(assetId)).tempExpiresAt).toBeNull();
  });

  it('refuses an asset belonging to somebody else', async () => {
    const owner = await signUp();
    const { book, pages } = await seedBook(owner.userId, 1);
    const stranger = await signUp('stranger@example.com');
    const theirAsset = await upload(stranger.token);

    const res = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/pages/${pages[0]._id}/artwork`),
      owner.token,
    ).send({ assetId: theirAsset });

    expect(res.status).toBe(404);
    expect((await BookPage.findById(pages[0]._id)).mediaAssetId).toBeNull();
  });
});

describe('POST /books/:bookId/pages/prepare-print', () => {
  it('adds a title and ending page around the existing story pages', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 3);

    const res = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/pages/prepare-print`),
      token,
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ addedTitle: true, addedEnding: true });

    const pages = await BookPage.find({ bookId: book._id }).sort({ order: 1 });
    // Title, the three story pages (shifted up one), then the ending.
    expect(pages.map((p) => p.type)).toEqual(['title', 'story', 'story', 'story', 'ending']);
    expect(pages.map((p) => p.order)).toEqual([1, 2, 3, 4, 5]);
    // Story content is untouched — only its position moved.
    expect(pages[1].narration).toBe('Narration 1');
    expect(pages[0].title).toBe('Aarav and the Whispering Forest');
    expect(pages[4].title).toBe('The End');
  });

  it('is idempotent — a second call adds nothing', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedBook(userId, 2);

    await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/pages/prepare-print`), token);
    const second = await asUser(
      request(app).post(`${API_PREFIX}/books/${book._id}/pages/prepare-print`),
      token,
    );

    expect(second.body.data).toEqual({ addedTitle: false, addedEnding: false });
    expect(await BookPage.countDocuments({ bookId: book._id })).toBe(4); // 2 story + title + ending
  });
});
