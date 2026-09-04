import { z } from 'zod';
import { CHARACTER_ROLES } from '../../models/enums.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const characterIdParamSchema = z.object({ characterId: objectId });

export const listCharactersQuerySchema = z.object({
  bookId: objectId.optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const characterFields = {
  name: z.string().trim().min(1, 'Give this character a name').max(120),
  role: z.enum(CHARACTER_ROLES),
  age: z.string().trim().max(60),
  gender: z.string().trim().max(60),
  appearance: z.string().trim().max(2000),
  outfit: z.string().trim().max(2000),
  personality: z.string().trim().max(2000),
  artStyle: z.string().trim().max(120),
  // Replayed verbatim into every image request featuring this character.
  consistencyPrompt: z.string().trim().max(2000),
};

export const createCharacterSchema = z.object({
  ...characterFields,
  role: characterFields.role.default('main'),
  age: characterFields.age.default(''),
  gender: characterFields.gender.default(''),
  appearance: characterFields.appearance.default(''),
  outfit: characterFields.outfit.default(''),
  personality: characterFields.personality.default(''),
  artStyle: characterFields.artStyle.default(''),
  consistencyPrompt: characterFields.consistencyPrompt.default(''),
});

export const updateCharacterSchema = z
  .object(characterFields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to update' });

export const attachCharacterSchema = z.object({ characterId: objectId });

export const addReferenceSchema = z.object({ assetId: objectId });
export const referenceParamSchema = z.object({ characterId: objectId, assetId: objectId });

export default {
  addReferenceSchema,
  referenceParamSchema,
  characterIdParamSchema,
  listCharactersQuerySchema,
  createCharacterSchema,
  updateCharacterSchema,
  attachCharacterSchema,
};
