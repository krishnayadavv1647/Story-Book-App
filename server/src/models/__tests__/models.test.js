import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
  MODEL_NAMES,
  syncIndexes,
  User,
  RefreshToken,
  Book,
  BookPage,
  GenerationJob,
  AuditLog,
} from '../index.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_test' });
  await syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

/** Reads the live index list from MongoDB rather than trusting the schema. */
async function indexKeys(Model) {
  const indexes = await Model.collection.indexes();
  return indexes.map((i) => ({ key: i.key, unique: !!i.unique, ttl: i.expireAfterSeconds }));
}

function hasIndex(indexes, key) {
  return indexes.some((i) => JSON.stringify(i.key) === JSON.stringify(key));
}

describe('model registry', () => {
  it('registers all 18 declared models', () => {
    expect(MODEL_NAMES).toHaveLength(18);
    for (const name of MODEL_NAMES) {
      expect(() => mongoose.model(name)).not.toThrow();
    }
  });
});

describe('required indexes', () => {
  it('indexes books by ownership and status', async () => {
    const indexes = await indexKeys(Book);
    expect(hasIndex(indexes, { ownerId: 1, status: 1, updatedAt: -1 })).toBe(true);
  });

  it('enforces one page per (book, order)', async () => {
    const indexes = await indexKeys(BookPage);
    const compound = indexes.find(
      (i) => JSON.stringify(i.key) === JSON.stringify({ bookId: 1, order: 1 }),
    );
    expect(compound).toBeDefined();
    expect(compound.unique).toBe(true);
  });

  it('enforces provider task id and request hash uniqueness on jobs', async () => {
    const indexes = await indexKeys(GenerationJob);
    const byTask = indexes.find(
      (i) => JSON.stringify(i.key) === JSON.stringify({ provider: 1, externalTaskId: 1 }),
    );
    const byHash = indexes.find(
      (i) => JSON.stringify(i.key) === JSON.stringify({ ownerId: 1, requestHash: 1 }),
    );
    expect(byTask?.unique).toBe(true);
    expect(byHash?.unique).toBe(true);
  });

  it('sets a TTL on refresh token expiry', async () => {
    const indexes = await indexKeys(RefreshToken);
    const ttl = indexes.find((i) => JSON.stringify(i.key) === JSON.stringify({ expiresAt: 1 }));
    expect(ttl?.ttl).toBe(0);
  });
});

describe('User', () => {
  it('hashes an assigned password and never returns the hash by default', async () => {
    const user = await User.create({
      email: 'Author@Example.com',
      name: 'Test Author',
      password: 'correct horse battery staple',
    });

    expect(user.email).toBe('author@example.com');
    expect(user.passwordHash).not.toBe('correct horse battery staple');
    expect(user.passwordHash.startsWith('$2')).toBe(true);

    const fetched = await User.findById(user._id);
    expect(fetched.passwordHash).toBeUndefined();
    expect(JSON.stringify(fetched)).not.toContain('$2');

    const withHash = await User.findById(user._id).select('+passwordHash');
    expect(await withHash.verifyPassword('correct horse battery staple')).toBe(true);
    expect(await withHash.verifyPassword('wrong')).toBe(false);
  });

  it('rejects a duplicate email', async () => {
    await User.create({ email: 'dup@example.com', name: 'A', password: 'password-one-two' });
    await expect(
      User.create({ email: 'dup@example.com', name: 'B', password: 'password-one-two' }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe('page ordering isolation', () => {
  it('refuses two pages at the same position in one book', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const book = await Book.create({ ownerId, title: 'The Map Behind the Bookshelf' });

    await BookPage.create({ bookId: book._id, ownerId, order: 1, narration: 'First' });
    await expect(
      BookPage.create({ bookId: book._id, ownerId, order: 1, narration: 'Clash' }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('keeps sibling pages untouched when one page is regenerated', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const book = await Book.create({ ownerId, title: 'Nine Days to Summit' });

    const [p1, p2] = await BookPage.create([
      { bookId: book._id, ownerId, order: 1, narration: 'Page one text' },
      { bookId: book._id, ownerId, order: 2, narration: 'Page two text' },
    ]);

    p1.revisions.push({ source: 'kie', narration: 'Page one, regenerated' });
    p1.activeRevisionId = p1.revisions.at(-1)._id;
    await p1.save();

    const untouched = await BookPage.findById(p2._id);
    expect(untouched.narration).toBe('Page two text');
    expect(untouched.revisions).toHaveLength(0);
    expect(untouched.order).toBe(2);
  });

  it('keeps every earlier revision recoverable after a new one is accepted', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const book = await Book.create({ ownerId, title: 'Little Moon Keeper' });
    const page = await BookPage.create({ bookId: book._id, ownerId, order: 1 });

    page.revisions.push({ source: 'gemini', narration: 'v1', acceptedAt: new Date() });
    page.activeRevisionId = page.revisions.at(-1)._id;
    await page.save();
    const firstRevisionId = page.activeRevisionId;

    page.revisions.push({ source: 'ai_edit', narration: 'v2', acceptedAt: new Date() });
    page.activeRevisionId = page.revisions.at(-1)._id;
    await page.save();

    const reloaded = await BookPage.findById(page._id);
    expect(reloaded.revisions).toHaveLength(2);
    expect(reloaded.revisions.id(firstRevisionId).narration).toBe('v1');
    expect(reloaded.activeRevision.narration).toBe('v2');
  });
});

describe('generation job idempotency', () => {
  it('rejects a second job with the same request hash for the same owner', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const base = { ownerId, type: 'page_image', provider: 'kie', model: 'test-model' };

    await GenerationJob.create({ ...base, requestHash: 'hash-a' });
    await expect(GenerationJob.create({ ...base, requestHash: 'hash-a' })).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('rejects a duplicate provider task id so a replayed callback resolves to one job', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const base = { ownerId, type: 'page_image', provider: 'kie', model: 'test-model' };

    await GenerationJob.create({ ...base, requestHash: 'hash-b', externalTaskId: 'task-1' });
    await expect(
      GenerationJob.create({ ...base, requestHash: 'hash-c', externalTaskId: 'task-1' }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('allows many jobs without a provider task id yet', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const base = { ownerId, type: 'page_image', provider: 'kie', model: 'test-model' };

    await GenerationJob.create({ ...base, requestHash: 'hash-d' });
    await GenerationJob.create({ ...base, requestHash: 'hash-e' });

    expect(await GenerationJob.countDocuments({ ownerId })).toBe(2);
  });
});

describe('audit log', () => {
  it('is append-only', async () => {
    const entry = await AuditLog.create({
      action: 'user.suspend',
      subjectType: 'User',
      subjectId: new mongoose.Types.ObjectId(),
      result: 'success',
    });

    entry.action = 'user.tamper';
    await expect(entry.save()).rejects.toThrow(/immutable/i);
    await expect(
      AuditLog.updateOne({ _id: entry._id }, { $set: { action: 'x' } }),
    ).rejects.toThrow(/immutable/i);
  });
});
