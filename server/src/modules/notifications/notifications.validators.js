import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const listQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const notificationParamSchema = z.object({ notificationId: objectId });

export default { listQuerySchema, notificationParamSchema };
