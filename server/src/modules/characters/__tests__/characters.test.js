import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { Book, BookPage, Character } from '../../../models/index.js';
import { fingerprintIdentity } from '../characters.service.js';

let mongod;
let app;

const chars = (path = '') => `${API_PREFIX}/characters${path}`;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_characters_test' });
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

const AARAV = {
  name: 'Aarav',
  role: 'main',
  age: '8 years',
  appearance: 'A curious Indian boy with warm brown skin and large expressive eyes.',
  outfit: 'Forest-green hoodie and beige cargo shorts.',
  personality: 'Brave, kind and imaginative.',
  artStyle: '3D Storybook',
  consistencyPrompt: 'Aarav: 8-year-old Indian boy, warm brown skin, dark tousled hair.',
};

const createAarav = (token, overrides = {}) =>
  asUser(request(app).post(chars()), token).send({ ...AARAV, ...overrides });

describe('character CRUD', () => {
  it('requires authentication', async () => {
    expect((await request(app).get(chars())).status).toBe(401);
  });

  it('creates a character as a draft belonging to the caller', async () => {
    const { token, userId } = await signUp();
    const res = await createAarav(token);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Aarav', role: 'main', status: 'draft' });
    expect(res.body.data.ownerId).toBe(userId);
    expect(res.body.data.identity.locked).toBe(false);
  });

  it('rejects a character with no name', async () => {
    const { token } = await signUp();
    const res = await createAarav(token, { name: '   ' });

    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d) => d.path)).toContain('body.name');
  });

  it('lists only the caller’s characters', async () => {
    const mine = await signUp('mine@example.com');
    const theirs = await signUp('theirs@example.com');
    await createAarav(mine.token);
    await createAarav(theirs.token, { name: 'Someone Else' });

    const res = await asUser(request(app).get(chars()), mine.token);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Aarav');
  });

  it('hides another account’s character behind a 404', async () => {
    const mine = await signUp('mine@example.com');
    const theirs = await signUp('theirs@example.com');
    const created = await createAarav(theirs.token);

    const res = await asUser(request(app).get(chars(`/${created.body.data._id}`)), mine.token);
    expect(res.status).toBe(404);
  });

  it('updates editable fields', async () => {
    const { token } = await signUp();
    const created = await createAarav(token);

    const res = await asUser(
      request(app).patch(chars(`/${created.body.data._id}`)),
      token,
    ).send({ personality: 'Thoughtful and stubborn.', role: 'supporting' });

    expect(res.status).toBe(200);
    expect(res.body.data.personality).toBe('Thoughtful and stubborn.');
    expect(res.body.data.role).toBe('supporting');
  });
});

describe('identity lock', () => {
  it('locks the look and records a fingerprint of what was locked', async () => {
    const { token } = await signUp();
    const created = await createAarav(token);

    const res = await asUser(request(app).post(chars(`/${created.body.data._id}/lock`)), token);

    expect(res.status).toBe(200);
    expect(res.body.data.identity.locked).toBe(true);
    expect(res.body.data.identity.lockedAt).not.toBeNull();

    const stored = await Character.findById(created.body.data._id);
    expect(stored.identity.fingerprint).toBe(fingerprintIdentity(stored));
    expect(stored.identity.fingerprint).toHaveLength(64);
  });

  it('refuses to lock a character with nothing to keep consistent', async () => {
    const { token } = await signUp();
    const created = await createAarav(token, { consistencyPrompt: '' });

    const res = await asUser(request(app).post(chars(`/${created.body.data._id}/lock`)), token);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_CONSISTENCY_PROMPT');
  });

  it('blocks edits that would change how a locked character is drawn', async () => {
    const { token } = await signUp();
    const created = await createAarav(token);
    const id = created.body.data._id;
    await asUser(request(app).post(chars(`/${id}/lock`)), token);

    for (const patch of [
      { appearance: 'Now a girl with red hair.' },
      { outfit: 'A spacesuit.' },
      { artStyle: 'Watercolour' },
      { consistencyPrompt: 'Something completely different.' },
    ]) {
      const res = await asUser(request(app).patch(chars(`/${id}`)), token).send(patch);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('IDENTITY_LOCKED');
    }

    // The stored look is untouched.
    const stored = await Character.findById(id);
    expect(stored.appearance).toBe(AARAV.appearance);
    expect(stored.identity.consistencyPrompt).toBe(AARAV.consistencyPrompt);
  });

  it('still allows edits that never reach the image model', async () => {
    const { token } = await signUp();
    const created = await createAarav(token);
    const id = created.body.data._id;
    await asUser(request(app).post(chars(`/${id}/lock`)), token);

    const res = await asUser(request(app).patch(chars(`/${id}`)), token).send({
      personality: 'Quieter than he looks.',
      age: '9 years',
      role: 'supporting',
    });

    expect(res.status).toBe(200);
    expect((await Character.findById(id)).identity.locked).toBe(true);
  });

  it('unlocks, letting the look change again', async () => {
    const { token } = await signUp();
    const created = await createAarav(token);
    const id = created.body.data._id;

    await asUser(request(app).post(chars(`/${id}/lock`)), token);
    await asUser(request(app).post(chars(`/${id}/unlock`)), token);

    const res = await asUser(request(app).patch(chars(`/${id}`)), token).send({
      outfit: 'A blue raincoat.',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.outfit).toBe('A blue raincoat.');
  });

  it('changes the fingerprint when the look changes, so drift is detectable', async () => {
    const { token } = await signUp();
    const created = await createAarav(token);
    const id = created.body.data._id;

    await asUser(request(app).post(chars(`/${id}/lock`)), token);
    const before = (await Character.findById(id)).identity.fingerprint;

    await asUser(request(app).post(chars(`/${id}/unlock`)), token);
    await asUser(request(app).patch(chars(`/${id}`)), token).send({ outfit: 'A blue raincoat.' });
    await asUser(request(app).post(chars(`/${id}/lock`)), token);

    expect((await Character.findById(id)).identity.fingerprint).not.toBe(before);
  });
});

describe('a book’s cast', () => {
  async function seedBook(userId) {
    return Book.create({ ownerId: userId, title: 'Aarav and the Whispering Forest' });
  }

  it('attaches an existing character, and does not double-add', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId);
    const created = await createAarav(token);
    const characterId = created.body.data._id;

    await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/characters`), token).send({
      characterId,
    });
    await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/characters`), token).send({
      characterId,
    });

    const stored = await Book.findById(book._id);
    expect(stored.characterIds).toHaveLength(1);
  });

  it('lists a book’s cast rather than the whole library', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId);
    const inBook = await createAarav(token);
    await createAarav(token, { name: 'Not In This Book' });

    await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/characters`), token).send({
      characterId: inBook.body.data._id,
    });

    const res = await asUser(request(app).get(chars(`?bookId=${book._id}`)), token);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Aarav');
  });

  it('removes a character from the book and from every page that used them', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId);
    const created = await createAarav(token);
    const characterId = created.body.data._id;

    await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/characters`), token).send({
      characterId,
    });
    await BookPage.create([
      { bookId: book._id, ownerId: userId, order: 1, characterIds: [characterId] },
      { bookId: book._id, ownerId: userId, order: 2, characterIds: [characterId] },
    ]);

    await asUser(
      request(app).delete(`${API_PREFIX}/books/${book._id}/characters/${characterId}`),
      token,
    );

    expect((await Book.findById(book._id)).characterIds).toHaveLength(0);
    // No page may be left pointing at a character the book no longer has.
    const pages = await BookPage.find({ bookId: book._id });
    expect(pages.every((page) => page.characterIds.length === 0)).toBe(true);
  });

  it('refuses to delete a character a book still uses', async () => {
    const { token, userId } = await signUp();
    const book = await seedBook(userId);
    const created = await createAarav(token);

    await asUser(request(app).post(`${API_PREFIX}/books/${book._id}/characters`), token).send({
      characterId: created.body.data._id,
    });

    const res = await asUser(request(app).delete(chars(`/${created.body.data._id}`)), token);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CHARACTER_IN_USE');
    expect(await Character.countDocuments()).toBe(1);
  });

  it('deletes a character nothing is using', async () => {
    const { token } = await signUp();
    const created = await createAarav(token);

    const res = await asUser(request(app).delete(chars(`/${created.body.data._id}`)), token);

    expect(res.status).toBe(200);
    expect(await Character.countDocuments()).toBe(0);
  });
});
