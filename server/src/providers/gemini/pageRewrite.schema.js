import { z } from 'zod';

/**
 * The rewrite contract.
 *
 * As with the story plan, there are two representations: the JSON schema sent to
 * the model as a hint, and the Zod schema that decides whether what came back is
 * allowed anywhere near the database.
 */
export const PAGE_REWRITE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short page title. May be empty.' },
    narration: { type: 'string', description: 'The page text, read aloud.' },
  },
  required: ['narration'],
};

export const pageRewriteSchema = z.object({
  title: z.string().trim().max(200).default(''),
  narration: z.string().trim().min(1, 'the rewrite came back empty').max(4000),
});

export default { PAGE_REWRITE_JSON_SCHEMA, pageRewriteSchema };
