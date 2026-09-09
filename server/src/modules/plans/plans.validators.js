import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const planParamSchema = z.object({ planId: objectId });

/**
 * A plan's limits. Every one is nullable on purpose: `null` means "no limit",
 * which is a different statement from "zero", and the model stores it that way.
 */
const limits = z
  .object({
    maxBooks: z.number().int().min(0).nullable(),
    maxPagesPerBook: z.number().int().min(1).max(200).nullable(),
    maxCharacters: z.number().int().min(0).nullable(),
    maxExportsPerMonth: z.number().int().min(0).nullable(),
    watermarkFreeExports: z.boolean(),
    printQualityExports: z.boolean(),
  })
  .partial();

const planShape = {
  // Lowercase and dashed: it is an identifier that ends up in URLs and copy,
  // not a display name.
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,39}$/, 'Use lowercase letters, numbers and dashes'),
  name: z.string().trim().min(1, 'Give the plan a name').max(80),
  description: z.string().trim().max(500),
  priceCents: z.number().int().min(0),
  currency: z.string().trim().length(3).toUpperCase(),
  interval: z.enum(['month', 'year', 'lifetime']),
  creditsGranted: z.number().int().min(0),
  limits,
  features: z.array(z.string().trim().min(1).max(120)).max(20),
  sortOrder: z.number().int().min(0).max(999),
  isActive: z.boolean(),
  // Off unless asked for: a plan should be finishable before anyone sees it.
  visibleToUsers: z.boolean(),
};

export const createPlanSchema = z
  .object(planShape)
  .partial()
  .required({ key: true, name: true, priceCents: true });

export const updatePlanSchema = z
  .object(planShape)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to update' });

export const assignPlanSchema = z.object({ planId: objectId });

export default {
  planParamSchema,
  createPlanSchema,
  updatePlanSchema,
  assignPlanSchema,
};
