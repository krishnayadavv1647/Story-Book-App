import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp, API_PREFIX } from '../../../app.js';
import { Character, MediaAsset } from '../../../models/index.js';
import { memoryDriver } from '../../../providers/storage/memory.driver.js';

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'storybook_upload_test' });
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

afterEach(async () => {
  memoryDriver.reset();
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

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);

const upload = (token, buffer, filename, contentType) =>
  asUser(request(app).post(`${API_PREFIX}/media/upload`), token).attach(
    'file',
    buffer,
    { filename, contentType },
  );

async function seedCharacter(userId) {
  return Character.create({
    ownerId: userId,
    name: 'Aarav',
    role: 'main',
    appearance: 'A curious Indian boy.',
    identity: { consistencyPrompt: 'Aarav: 8-year-old Indian boy.' },
  });
}

describe('uploading a reference image', () => {
  it('requires authentication', async () => {
    const res = await request(app)
      .post(`${API_PREFIX}/media/upload`)
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(401);
  });

  it('stores a PNG and hands back a signed URL', async () => {
    const { token, userId } = await signUp();

    const res = await upload(token, PNG, 'aarav.png', 'image/png');

    expect(res.status).toBe(201);
    expect(res.body.data.contentType).toBe('image/png');
    expect(res.body.data.url).toContain('/api/v1/media/');
    expect(res.body.data.url).toContain('sig=');

    const asset = await MediaAsset.findById(res.body.data.assetId);
    expect(asset.ownerId.toString()).toBe(userId);
    expect(asset.kind).toBe('reference');
    expect(asset.status).toBe('stored');
    expect(asset.checksumSha256).toHaveLength(64);
    // Unclaimed uploads expire rather than accumulating forever.
    expect(asset.tempExpiresAt).not.toBeNull();
    expect(memoryDriver.size).toBe(1);
  });

  it('accepts a JPEG too', async () => {
    const { token } = await signUp();
    const res = await upload(token, JPEG, 'aarav.jpg', 'image/jpeg');

    expect(res.status).toBe(201);
    expect(res.body.data.contentType).toBe('image/jpeg');
  });

  it('rejects a file whose bytes are not an image, whatever it claims to be', async () => {
    const { token } = await signUp();
    const html = Buffer.from('<script>alert(1)</script>');

    // The declared type is attacker-controlled; the magic bytes are not.
    const res = await upload(token, html, 'evil.png', 'image/png');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(await MediaAsset.countDocuments()).toBe(0);
    expect(memoryDriver.size).toBe(0);
  });

  it('rejects a disallowed content type outright', async () => {
    const { token } = await signUp();
    const res = await upload(token, Buffer.from('%PDF-1.4'), 'a.pdf', 'application/pdf');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects a file over the size limit', async () => {
    const { token } = await signUp();
    // UPLOAD_MAX_BYTES defaults to 10MB.
    const huge = Buffer.concat([PNG, Buffer.alloc(11 * 1024 * 1024, 0)]);

    const res = await upload(token, huge, 'huge.png', 'image/png');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(await MediaAsset.countDocuments()).toBe(0);
  });

  it('rejects a request with no file', async () => {
    const { token } = await signUp();
    const res = await asUser(request(app).post(`${API_PREFIX}/media/upload`), token);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_FILE');
  });
});

describe('attaching a reference to a character', () => {
  async function uploadAndAttach(token, characterId) {
    const uploaded = await upload(token, PNG, 'ref.png', 'image/png');
    const res = await asUser(
      request(app).post(`${API_PREFIX}/characters/${characterId}/references`),
      token,
    ).send({ assetId: uploaded.body.data.assetId });

    return { assetId: uploaded.body.data.assetId, res };
  }

  it('adds the reference and clears its expiry now that it is claimed', async () => {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);

    const { assetId, res } = await uploadAndAttach(token, character._id);

    expect(res.status).toBe(200);
    expect(res.body.data.identity.referenceAssetIds).toContain(assetId);

    const asset = await MediaAsset.findById(assetId);
    expect(asset.tempExpiresAt).toBeNull();
    expect(asset.refs.characterId.toString()).toBe(character._id.toString());
  });

  it('is idempotent — attaching twice keeps one reference', async () => {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);

    const { assetId } = await uploadAndAttach(token, character._id);
    await asUser(
      request(app).post(`${API_PREFIX}/characters/${character._id}/references`),
      token,
    ).send({ assetId });

    const stored = await Character.findById(character._id);
    expect(stored.identity.referenceAssetIds).toHaveLength(1);
  });

  it('refuses somebody else’s upload', async () => {
    const mine = await signUp('mine@example.com');
    const theirs = await signUp('theirs@example.com');
    const character = await seedCharacter(mine.userId);

    const uploaded = await upload(theirs.token, PNG, 'ref.png', 'image/png');
    const res = await asUser(
      request(app).post(`${API_PREFIX}/characters/${character._id}/references`),
      mine.token,
    ).send({ assetId: uploaded.body.data.assetId });

    expect(res.status).toBe(404);
  });

  it('caps the number of references', async () => {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);

    for (let i = 0; i < 8; i += 1) {
      await uploadAndAttach(token, character._id);
    }

    const uploaded = await upload(token, PNG, 'ninth.png', 'image/png');
    const res = await asUser(
      request(app).post(`${API_PREFIX}/characters/${character._id}/references`),
      token,
    ).send({ assetId: uploaded.body.data.assetId });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOO_MANY_REFERENCES');
  });

  it('removes a reference, and refuses to while the look is locked', async () => {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);
    const { assetId } = await uploadAndAttach(token, character._id);

    await asUser(request(app).post(`${API_PREFIX}/characters/${character._id}/lock`), token);

    const blocked = await asUser(
      request(app).delete(`${API_PREFIX}/characters/${character._id}/references/${assetId}`),
      token,
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('IDENTITY_LOCKED');

    await asUser(request(app).post(`${API_PREFIX}/characters/${character._id}/unlock`), token);

    const removed = await asUser(
      request(app).delete(`${API_PREFIX}/characters/${character._id}/references/${assetId}`),
      token,
    );
    expect(removed.status).toBe(200);
    expect((await Character.findById(character._id)).identity.referenceAssetIds).toHaveLength(0);
  });

  it('changes the identity fingerprint, so a reference change re-runs illustrations', async () => {
    const { token, userId } = await signUp();
    const character = await seedCharacter(userId);

    await asUser(request(app).post(`${API_PREFIX}/characters/${character._id}/lock`), token);
    const before = (await Character.findById(character._id)).identity.fingerprint;

    await asUser(request(app).post(`${API_PREFIX}/characters/${character._id}/unlock`), token);
    await uploadAndAttach(token, character._id);
    await asUser(request(app).post(`${API_PREFIX}/characters/${character._id}/lock`), token);

    expect((await Character.findById(character._id)).identity.fingerprint).not.toBe(before);
  });
});
