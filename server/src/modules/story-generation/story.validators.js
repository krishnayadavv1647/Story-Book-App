import { z } from 'zod';
import { AGE_GROUPS } from '../../models/enums.js';

const prompt = z
  .string()
  .trim()
  .min(10, 'Describe the story in a little more detail')
  .max(4000, 'That idea is too long — try summarising it');

export const storySettingsSchema = z
  .object({
    ageGroup: z.enum(AGE_GROUPS).optional(),
    language: z.string().trim().min(2).max(40).optional(),
    genre: z.string().trim().min(1).max(120).optional(),
    artStyle: z.string().trim().min(1).max(120).optional(),
    // Bounded here as well as in the model: an unbounded page count is an
    // unbounded bill once illustration starts.
    pageCount: z.coerce.number().int().min(1).max(60).optional(),
    moral: z.string().trim().max(500).optional(),
  })
  .default({});

export const generatePlanSchema = z.object({
  prompt,
  settings: storySettingsSchema,
});

export const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1, 'Say something first')
    // A transcript has to end somewhere; the client trims older turns.
    .max(40, 'This conversation is too long — start a new one'),
});

export const jobIdParamSchema = z.object({
  jobId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid job id'),
});

export default { generatePlanSchema, chatSchema, jobIdParamSchema, storySettingsSchema };
