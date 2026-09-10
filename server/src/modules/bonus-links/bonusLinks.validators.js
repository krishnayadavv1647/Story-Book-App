import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const linkParamSchema = z.object({ linkId: objectId });

export const createBonusLinkSchema = z.object({
  label: z.string().trim().min(1, 'Give the link a name').max(80),
  planId: objectId,
});

/**
 * Renaming a link or switching it on and off. The code itself never changes:
 * a link already handed out has to keep meaning the same thing, and a leaked one
 * is switched off and replaced, not edited.
 */
export const updateBonusLinkSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    isActive: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to update' });

export default { linkParamSchema, createBonusLinkSchema, updateBonusLinkSchema };
