import { z } from 'zod';
import {
  AGE_GROUPS,
  BOOK_STATUS,
  BOOK_BINDINGS,
  PAPER_FINISHES,
  BOOK_ORIENTATIONS,
} from '../../models/enums.js';

/** Print production settings; every field optional so a partial save merges. */
const printSchema = z
  .object({
    size: z.string().trim().max(20),
    orientation: z.enum(BOOK_ORIENTATIONS),
    binding: z.enum(BOOK_BINDINGS),
    paperFinish: z.enum(PAPER_FINISHES),
    bleed: z.boolean(),
    cropMarks: z.boolean(),
    dpi: z.coerce.number().int().min(72).max(1200),
    bleedIn: z.coerce.number().min(0).max(0.5),
    safeMarginIn: z.coerce.number().min(0.1).max(1),
    customWidthIn: z.coerce.number().min(1).max(40).nullable(),
    customHeightIn: z.coerce.number().min(1).max(40).nullable(),
  })
  .partial();

/** Query params arrive as strings, so every numeric field is coerced then bounded. */
export const listBooksQuerySchema = z.object({
  status: z.enum(BOOK_STATUS).optional(),
  // An upper bound on `limit` is what stops a caller asking for the whole
  // collection in one request.
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  sort: z.enum(['recent', 'created', 'title']).default('recent'),
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

/** Only the fields the Book Information card exposes. */
export const updateBookSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    // Rendered onto the generated cover under the title, so it is bounded by
    // what stays readable at card size rather than by what fits in the field.
    subtitle: z.string().trim().max(160),
    author: z.string().trim().max(120),
    description: z.string().trim().max(4000),
    ageGroup: z.enum(AGE_GROUPS),
    language: z.string().trim().min(2).max(40),
    genre: z.string().trim().max(120),
    artStyle: z.string().trim().max(120),
    moral: z.string().trim().max(500),
    pageCount: z.coerce.number().int().min(1).max(60),
    print: printSchema,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to update' });

export const bookIdParamSchema = z.object({
  bookId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid book id'),
});

export default {
  listBooksQuerySchema,
  updateBookSchema,
  bookIdParamSchema,
};
