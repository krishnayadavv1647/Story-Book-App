import crypto from 'node:crypto';
import { Book, BookPage, Character, CharacterReference, MediaAsset } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { resolveAssetUrl } from '../../providers/storage/index.js';

/**
 * Identity lock.
 *
 * A character's look has to survive across every page and every future book, and
 * the only thing carrying it into an image request is `consistencyPrompt` plus
 * the reference assets. Once a character is locked those inputs are frozen: an
 * edit to appearance or outfit after page 4 has been illustrated would leave the
 * book with two different children in it.
 *
 * The fingerprint is a hash of exactly the fields that feed an image request, so
 * a later drift — however it happened — is detectable rather than invisible.
 */
const IDENTITY_FIELDS = ['name', 'appearance', 'outfit', 'artStyle'];

export function fingerprintIdentity(character) {
  const payload = {
    ...Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, character[field] ?? ''])),
    consistencyPrompt: character.identity?.consistencyPrompt ?? '',
    seed: character.identity?.seed ?? null,
    referenceAssetIds: (character.identity?.referenceAssetIds ?? []).map(String).sort(),
  };

  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Adds loadable URLs for a character's reference images and generated poses.
 * The stored document holds ids; a browser needs signed URLs.
 */
export async function withMediaUrls(characters) {
  const list = Array.isArray(characters) ? characters : [characters];

  const ids = list.flatMap((character) => [
    ...(character.identity?.referenceAssetIds ?? []),
    ...(character.previews ?? []).map((preview) => preview.mediaAssetId),
  ]);

  const unique = [...new Set(ids.filter(Boolean).map(String))];
  const assets = unique.length ? await MediaAsset.find({ _id: { $in: unique } }) : [];
  const urls = new Map(
    await Promise.all(assets.map(async (a) => [String(a._id), await resolveAssetUrl(a)])),
  );

  const decorate = (character) => {
    const plain = typeof character.toJSON === 'function' ? character.toJSON() : { ...character };

    plain.referenceImages = (character.identity?.referenceAssetIds ?? [])
      .map((id) => ({ assetId: String(id), url: urls.get(String(id)) ?? null }))
      .filter((ref) => ref.url);

    plain.previews = (character.previews ?? []).map((preview) => ({
      pose: preview.pose,
      isPrimary: preview.isPrimary,
      assetId: String(preview.mediaAssetId),
      url: urls.get(String(preview.mediaAssetId)) ?? null,
    }));

    return plain;
  };

  return Array.isArray(characters) ? list.map(decorate) : decorate(list[0]);
}

export async function listCharacters({ ownerId, bookId, includeArchived = false }) {
  if (bookId) {
    const book = await Book.findOne({ _id: bookId, ownerId }).select('characterIds');
    if (!book) throw ApiError.notFound('Book not found');
    return Character.find({ _id: { $in: book.characterIds ?? [] } }).sort({ createdAt: 1 }).lean();
  }

  const filter = { ownerId };
  if (!includeArchived) filter.isArchived = false;
  return Character.find(filter).sort({ updatedAt: -1 }).lean();
}

export async function getCharacter({ ownerId, characterId }) {
  const character = await Character.findOne({ _id: characterId, ownerId });
  if (!character) throw ApiError.notFound('Character not found');
  return character;
}

/**
 * The API takes `consistencyPrompt` at the top level, matching the shape the
 * planner emits, but it is stored under `identity` where the lock lives. Writing
 * it at the root would be silently discarded by strict mode — leaving a
 * character that cannot be locked and nobody any the wiser.
 */
export async function createCharacter({ ownerId, data }) {
  const { consistencyPrompt = '', ...rest } = data;

  return Character.create({
    ...rest,
    ownerId,
    status: 'draft',
    identity: { consistencyPrompt },
  });
}

/**
 * A locked character rejects edits to anything that would change how it is
 * drawn. Everything else — role, personality, age — stays editable, because none
 * of it reaches the image model.
 */
const LOCKED_FIELDS = new Set([...IDENTITY_FIELDS, 'consistencyPrompt']);

export async function updateCharacter({ ownerId, characterId, patch }) {
  const character = await getCharacter({ ownerId, characterId });

  if (character.identity?.locked) {
    const blocked = Object.keys(patch).filter((field) => LOCKED_FIELDS.has(field));
    if (blocked.length > 0) {
      throw ApiError.conflict(
        'This character’s look is locked so it stays consistent. Unlock it to change how they appear.',
        { code: 'IDENTITY_LOCKED', details: { fields: blocked } },
      );
    }
  }

  const { consistencyPrompt, ...rest } = patch;
  Object.assign(character, rest);
  if (consistencyPrompt !== undefined) {
    character.identity.consistencyPrompt = consistencyPrompt;
  }

  await character.save();
  return character;
}

export async function lockIdentity({ ownerId, characterId, userId }) {
  const character = await getCharacter({ ownerId, characterId });

  if (!character.identity?.consistencyPrompt) {
    throw ApiError.badRequest(
      'Describe how this character looks before locking them — there would be nothing to keep consistent.',
      { code: 'NO_CONSISTENCY_PROMPT' },
    );
  }

  character.identity.locked = true;
  character.identity.lockedAt = new Date();
  character.identity.lockedBy = userId;
  character.identity.fingerprint = fingerprintIdentity(character);

  await character.save();
  return character;
}

export async function unlockIdentity({ ownerId, characterId }) {
  const character = await getCharacter({ ownerId, characterId });

  character.identity.locked = false;
  character.identity.lockedAt = null;
  character.identity.lockedBy = null;

  await character.save();
  return character;
}

/** Adds an existing character to a book's cast. */
export async function attachToBook({ book, characterId }) {
  const character = await Character.findOne({ _id: characterId, ownerId: book.ownerId });
  if (!character) throw ApiError.notFound('Character not found');

  if ((book.characterIds ?? []).some((id) => String(id) === String(characterId))) {
    return character;
  }

  await Book.updateOne({ _id: book._id }, { $addToSet: { characterIds: character._id } });
  await Character.updateOne({ _id: character._id }, { $inc: { usageCount: 1 } });

  return character;
}

/**
 * Removes a character from a book's cast, and from every page that referenced
 * them — leaving a page pointing at a character the book no longer has would
 * produce an illustration prompt with a dangling reference.
 */
export async function detachFromBook({ book, characterId }) {
  await Book.updateOne({ _id: book._id }, { $pull: { characterIds: characterId } });
  await BookPage.updateMany({ bookId: book._id }, { $pull: { characterIds: characterId } });

  return { detached: true };
}

/**
 * Attaches an uploaded image as a reference for this character.
 *
 * The asset loses its temporary expiry once claimed, and the id lands in
 * `identity.referenceAssetIds` — which is what gets replayed into every future
 * image request, so a reference added here steers every page the character
 * appears on.
 */
export async function addReference({ ownerId, characterId, assetId, kind = 'upload' }) {
  const character = await getCharacter({ ownerId, characterId });

  const asset = await MediaAsset.findOne({ _id: assetId, ownerId });
  if (!asset) throw ApiError.notFound('Upload not found');

  if ((character.identity?.referenceAssetIds ?? []).length >= 8) {
    throw ApiError.badRequest('A character can hold at most 8 reference images', {
      code: 'TOO_MANY_REFERENCES',
    });
  }

  await MediaAsset.updateOne(
    { _id: asset._id },
    { $set: { tempExpiresAt: null, 'refs.characterId': character._id } },
  );

  await CharacterReference.findOneAndUpdate(
    { characterId: character._id, mediaAssetId: asset._id },
    { $setOnInsert: { ownerId, kind } },
    { upsert: true, new: true },
  );

  await Character.updateOne(
    { _id: character._id },
    { $addToSet: { 'identity.referenceAssetIds': asset._id } },
  );

  return getCharacter({ ownerId, characterId });
}

export async function removeReference({ ownerId, characterId, assetId }) {
  const character = await getCharacter({ ownerId, characterId });

  if (character.identity?.locked) {
    throw ApiError.conflict(
      'This character’s look is locked. Unlock it before changing its references.',
      { code: 'IDENTITY_LOCKED' },
    );
  }

  await Character.updateOne(
    { _id: character._id },
    { $pull: { 'identity.referenceAssetIds': assetId } },
  );
  await CharacterReference.deleteOne({ characterId: character._id, mediaAssetId: assetId });

  return getCharacter({ ownerId, characterId });
}

export async function deleteCharacter({ ownerId, characterId }) {
  const character = await getCharacter({ ownerId, characterId });

  const inUse = await Book.countDocuments({ ownerId, characterIds: character._id });
  if (inUse > 0) {
    throw ApiError.conflict(
      `This character appears in ${inUse} ${inUse === 1 ? 'book' : 'books'}. Remove them there first.`,
      { code: 'CHARACTER_IN_USE', details: { books: inUse } },
    );
  }

  await Character.deleteOne({ _id: character._id });
  return { deleted: true };
}

export default {
  withMediaUrls,
  addReference,
  removeReference,
  listCharacters,
  getCharacter,
  createCharacter,
  updateCharacter,
  lockIdentity,
  unlockIdentity,
  attachToBook,
  detachFromBook,
  deleteCharacter,
  fingerprintIdentity,
};
