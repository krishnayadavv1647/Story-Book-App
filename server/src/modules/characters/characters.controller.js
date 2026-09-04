import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import * as service from './characters.service.js';

export const list = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.withMediaUrls(
      await service.listCharacters({ ownerId: req.user._id, ...req.validated.query }),
    ),
    message: 'Characters',
  }),
);

export const detail = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.withMediaUrls(
      await service.getCharacter({
        ownerId: req.user._id,
        characterId: req.validated.params.characterId,
      }),
    ),
    message: 'Character',
  }),
);

export const create = asyncHandler(async (req, res) =>
  sendCreated(res, {
    data: await service.createCharacter({ ownerId: req.user._id, data: req.validated.body }),
    message: 'Character created',
  }),
);

export const update = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.updateCharacter({
      ownerId: req.user._id,
      characterId: req.validated.params.characterId,
      patch: req.validated.body,
    }),
    message: 'Character updated',
  }),
);

export const lock = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.lockIdentity({
      ownerId: req.user._id,
      characterId: req.validated.params.characterId,
      userId: req.user._id,
    }),
    message: 'Identity locked',
  }),
);

export const unlock = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.unlockIdentity({
      ownerId: req.user._id,
      characterId: req.validated.params.characterId,
    }),
    message: 'Identity unlocked',
  }),
);

export const remove = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.deleteCharacter({
      ownerId: req.user._id,
      characterId: req.validated.params.characterId,
    }),
    message: 'Character deleted',
  }),
);

/** Book-scoped: add an existing character to this book's cast. */
export const attach = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.attachToBook({
      book: req.book,
      characterId: req.validated.body.characterId,
    }),
    message: 'Character added to this book',
  }),
);

export const detach = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.detachFromBook({
      book: req.book,
      characterId: req.validated.params.characterId,
    }),
    message: 'Character removed from this book',
  }),
);

export const addReference = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.withMediaUrls(
      await service.addReference({
        ownerId: req.user._id,
        characterId: req.validated.params.characterId,
        assetId: req.validated.body.assetId,
      }),
    ),
    message: 'Reference added',
  }),
);

export const removeReference = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.withMediaUrls(
      await service.removeReference({
        ownerId: req.user._id,
        characterId: req.validated.params.characterId,
        assetId: req.validated.params.assetId,
      }),
    ),
    message: 'Reference removed',
  }),
);

export default {
  list, detail, create, update, lock, unlock, remove, attach, detach,
  addReference, removeReference,
};
