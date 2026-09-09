import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { Book, BookPage, Character, GenerationJob, MediaAsset } from '../../../models/index.js';

let mongod;
let app;

const books = (path = '') => `${API_PREFIX}/books${path}`;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_books_test' });
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

/** Registers an account and returns its bearer token and id. */
async function signUp(email = 'krishna@example.com') {
  const created = await request(app)
    .post(`${API_PREFIX}/auth/register`)
    .send({ name: 'Krishna Yadav', email, password: 'a-long-enough-passphrase' });

  // Registering no longer signs anyone in — the emailed code does.
  const res = await request(app)
    .post(`${API_PREFIX}/auth/otp/verify`)
    .send({ email, code: created.body.data.devCode });

  return { token: res.body.data.accessToken, userId: res.body.data.user.id };
}

const asUser = (req, token) => req.set('Authorization', `Bearer ${token}`);

/**
 * `timestamps: true` overwrites `updatedAt` on create, so a value passed to
 * `create` is silently discarded and every document lands on the same instant —
 * which makes any ordering assertion a coin flip. Backfill it afterwards with
 * timestamps disabled.
 */
async function seedBooks(docs) {
  const created = await Book.create(docs.map(({ updatedAt: _updatedAt, ...rest }) => rest));

  await Promise.all(
    created.map((doc, index) =>
      docs[index].updatedAt
        ? Book.updateOne(
            { _id: doc._id },
            { $set: { updatedAt: docs[index].updatedAt } },
            { timestamps: false },
          )
        : Promise.resolve(),
    ),
  );

  return created;
}

describe('GET /books', () => {
  it('requires authentication', async () => {
    const res = await request(app).get(books());
    expect(res.status).toBe(401);
  });

  it('returns only the caller’s books, newest first, with pagination meta', async () => {
    const mine = await signUp('mine@example.com');
    const theirs = await signUp('theirs@example.com');

    await seedBooks([
      { ownerId: mine.userId, title: 'Older book', updatedAt: new Date('2026-01-01') },
      { ownerId: mine.userId, title: 'Newer book', updatedAt: new Date('2026-02-01') },
      { ownerId: theirs.userId, title: 'Someone else’s book' },
    ]);

    const res = await asUser(request(app).get(books()), mine.token);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((b) => b.title)).toEqual(['Newer book', 'Older book']);
    expect(res.body.meta.pagination).toMatchObject({ page: 1, limit: 12, total: 2, totalPages: 1 });
    // Another account's library must be invisible, not merely unlinked.
    expect(JSON.stringify(res.body)).not.toContain('Someone else');
  });

  it('paginates', async () => {
    const { token, userId } = await signUp();
    await seedBooks(
      Array.from({ length: 5 }, (_, i) => ({
        ownerId: userId,
        title: `Book ${i}`,
        updatedAt: new Date(2026, 0, i + 1),
      })),
    );

    const page2 = await asUser(request(app).get(books('?page=2&limit=2')), token);

    expect(page2.body.data).toHaveLength(2);
    expect(page2.body.meta.pagination).toMatchObject({
      page: 2,
      limit: 2,
      total: 5,
      totalPages: 3,
      hasNext: true,
    });
  });

  it('filters by status and hides archived books by default', async () => {
    const { token, userId } = await signUp();
    await Book.create([
      { ownerId: userId, title: 'Ready one', status: 'ready' },
      { ownerId: userId, title: 'Draft one', status: 'draft' },
      { ownerId: userId, title: 'Archived one', status: 'ready', isArchived: true },
    ]);

    const all = await asUser(request(app).get(books()), token);
    expect(all.body.data.map((b) => b.title).sort()).toEqual(['Draft one', 'Ready one']);

    const ready = await asUser(request(app).get(books('?status=ready')), token);
    expect(ready.body.data.map((b) => b.title)).toEqual(['Ready one']);

    const archived = await asUser(request(app).get(books('?includeArchived=true')), token);
    expect(archived.body.data).toHaveLength(3);
  });

  it('sorts by title when asked', async () => {
    const { token, userId } = await signUp();
    await Book.create([
      { ownerId: userId, title: 'Zebra' },
      { ownerId: userId, title: 'Apple' },
    ]);

    const res = await asUser(request(app).get(books('?sort=title')), token);
    expect(res.body.data.map((b) => b.title)).toEqual(['Apple', 'Zebra']);
  });

  it('rejects an out-of-range limit rather than honouring it', async () => {
    const { token } = await signUp();
    const res = await asUser(request(app).get(books('?limit=500')), token);

    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d) => d.path)).toContain('query.limit');
  });

  it('rejects an unknown status', async () => {
    const { token } = await signUp();
    const res = await asUser(request(app).get(books('?status=not-a-status')), token);

    expect(res.status).toBe(422);
  });
});

describe('GET /books/summary', () => {
  it('counts the caller’s library by status', async () => {
    const { token, userId } = await signUp();
    await Book.create([
      { ownerId: userId, title: 'A', status: 'ready' },
      { ownerId: userId, title: 'B', status: 'ready' },
      { ownerId: userId, title: 'C', status: 'draft' },
      { ownerId: userId, title: 'D', status: 'ready', isArchived: true },
    ]);

    const res = await asUser(request(app).get(books('/summary')), token);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.byStatus).toEqual({ ready: 2, draft: 1 });
  });
});

describe('the removed template catalogue', () => {
  // Six invented books, drawn as flat colour blocks, sat above the owner's real
  // library and read as though they were on the account. Removed with the UI
  // that showed them; this keeps the endpoint from quietly coming back.
  it('no longer serves a catalogue', async () => {
    const { token } = await signUp();

    for (const path of ['/templates', '/genres']) {
      const res = await asUser(request(app).get(books(path)), token);
      expect(res.status).not.toBe(200);
    }
  });
});

describe('DELETE /books/:bookId', () => {
  /** A book with a page, an illustration and a character attached to it. */
  async function seedFullBook(userId) {
    const character = await Character.create({
      ownerId: userId,
      name: 'Mira',
      role: 'main',
      appearance: 'A girl in a yellow raincoat.',
    });

    const [book] = await seedBooks([
      { ownerId: userId, title: 'Mira and the Little Rain Cloud', characterIds: [character._id] },
    ]);

    const asset = await MediaAsset.create({
      ownerId: userId,
      kind: 'page_image',
      status: 'stored',
      storage: { driver: 'memory', key: `page_image/${book._id}.png`, contentType: 'image/png' },
      refs: { bookId: book._id },
    });

    const page = await BookPage.create({
      bookId: book._id,
      ownerId: userId,
      order: 1,
      title: 'The Dry Garden',
      narration: 'One hot summer afternoon…',
      mediaAssetId: asset._id,
    });

    const job = await GenerationJob.create({
      ownerId: userId,
      type: 'page_image',
      provider: 'kie',
      model: 'nano-banana-pro',
      requestHash: `hash-${book._id}`,
      refs: { bookId: book._id, pageId: page._id },
    });

    return { book, page, asset, character, job };
  }

  it('deletes the book, its pages and the work that made them', async () => {
    const { token, userId } = await signUp();
    const { book, character } = await seedFullBook(userId);

    const res = await asUser(request(app).delete(`${API_PREFIX}/books/${book._id}`), token);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ deleted: true, pages: 1 });

    expect(await Book.findById(book._id)).toBeNull();
    expect(await BookPage.countDocuments({ bookId: book._id })).toBe(0);
    expect(await GenerationJob.countDocuments({ 'refs.bookId': book._id })).toBe(0);

    // The cast is account-wide and reusable, so it outlives any one book.
    expect(await Character.findById(character._id)).toBeTruthy();
  });

  it('marks the artwork deleted rather than leaving rows pointing at nothing', async () => {
    const { token, userId } = await signUp();
    const { book, asset } = await seedFullBook(userId);

    await asUser(request(app).delete(`${API_PREFIX}/books/${book._id}`), token);

    const after = await MediaAsset.findById(asset._id);
    expect(after.status).toBe('deleted');
    expect(after.deletedAt).toBeTruthy();
  });

  it('takes the book out of the library', async () => {
    const { token, userId } = await signUp();
    const { book } = await seedFullBook(userId);

    await asUser(request(app).delete(`${API_PREFIX}/books/${book._id}`), token);

    const list = await asUser(request(app).get(`${API_PREFIX}/books`), token);
    expect(list.body.data).toHaveLength(0);
  });

  it('refuses another account’s book', async () => {
    const mine = await signUp('mine@example.com');
    const theirs = await signUp('theirs@example.com');
    const { book } = await seedFullBook(theirs.userId);

    const res = await asUser(request(app).delete(`${API_PREFIX}/books/${book._id}`), mine.token);

    expect(res.status).toBe(404);
    expect(await Book.findById(book._id)).toBeTruthy();
  });
});
