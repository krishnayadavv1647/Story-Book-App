import { z } from 'zod';
import { EXPORT_FORMATS, EXPORT_QUALITY } from '../../models/enums.js';
import { PAGE_SIZE_KEYS } from './render/layout.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const bookParamSchema = z.object({ bookId: objectId });
export const jobParamSchema = z.object({ jobId: objectId });

export const createExportSchema = z.object({
  format: z.enum(EXPORT_FORMATS),
  quality: z.enum(EXPORT_QUALITY).default('standard'),
  options: z
    .object({
      pageSize: z.enum(PAGE_SIZE_KEYS),
      orientation: z.enum(['portrait', 'landscape']),
      // Bleed is bounded by the model too; a huge value would just waste paper.
      bleedMm: z.number().min(0).max(10),
      includeCover: z.boolean(),
      includeBackCover: z.boolean(),
      includePageNumbers: z.boolean(),
      includeWatermark: z.boolean(),
    })
    .partial()
    .default({}),
});

export const listExportsQuerySchema = z.object({
  bookId: objectId.optional(),
});

export const publishSchema = z.object({
  published: z.boolean(),
});

export default {
  bookParamSchema,
  jobParamSchema,
  createExportSchema,
  listExportsQuerySchema,
  publishSchema,
};
