import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
});

export const userParamSchema = z.object({ userId: objectId });

export default { listUsersQuerySchema, userParamSchema };
