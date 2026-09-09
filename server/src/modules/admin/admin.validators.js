import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
});

export const userParamSchema = z.object({ userId: objectId });

/**
 * Suspending, reactivating, promoting or demoting an account. Both fields are
 * optional but at least one must be present — an empty PATCH would write an
 * audit entry describing nothing.
 */
export const updateUserSchema = z
  .object({
    status: z.enum(['active', 'suspended']),
    role: z.enum(['user', 'admin']),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to update' });

export default { listUsersQuerySchema, userParamSchema, updateUserSchema };
