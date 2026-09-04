import { z } from 'zod';
import { AGE_GROUPS, CHARACTER_ROLES } from '../../models/enums.js';

/**
 * The contract for a generated story plan.
 *
 * Two representations, deliberately:
 *
 *   STORY_PLAN_JSON_SCHEMA — sent to the model as `response_format.schema`. It is
 *   hand-written rather than derived from Zod, because the provider accepts only
 *   a subset of JSON Schema and a generated one tends to include constructs it
 *   rejects. Asking for the right shape is a hint, not a guarantee.
 *
 *   storyPlanSchema — the Zod schema every response is validated against before
 *   anything is persisted. This is the authority. A model that ignores the hint
 *   fails here, and the failure is fed back to it as a correction.
 *
 * A test asserts the two stay in step.
 */

const trimmed = (min, max) => z.string().trim().min(min).max(max);

const dialogueLineSchema = z.object({
  speaker: trimmed(1, 120),
  line: trimmed(1, 600),
});

export const characterDraftSchema = z.object({
  tempId: trimmed(1, 60),
  name: trimmed(1, 120),
  role: z.enum(CHARACTER_ROLES),
  age: z.string().trim().max(60).default(''),
  appearance: trimmed(1, 2000),
  outfit: z.string().trim().max(2000).default(''),
  personality: z.string().trim().max(2000).default(''),
  // Replayed verbatim into every image prompt featuring this character, so it
  // must be self-contained: a later page has no other memory of how they look.
  consistencyPrompt: trimmed(1, 2000),
});

export const pageDraftSchema = z.object({
  pageNumber: z.number().int().min(1).max(60),
  title: z.string().trim().max(200).default(''),
  narration: trimmed(1, 4000),
  dialogue: z.array(dialogueLineSchema).max(12).default([]),
  sceneDescription: trimmed(1, 4000),
  characterIds: z.array(z.string().trim().min(1)).max(12).default([]),
  location: z.string().trim().max(200).default(''),
  mood: z.string().trim().max(120).default(''),
  illustrationPrompt: trimmed(1, 4000),
});

export const bookDraftSchema = z.object({
  title: trimmed(1, 200),
  description: trimmed(1, 4000),
  ageGroup: z.enum(AGE_GROUPS),
  language: trimmed(2, 40),
  genre: trimmed(1, 120),
  artStyle: trimmed(1, 120),
  moral: z.string().trim().max(500).default(''),
  pageCount: z.number().int().min(1).max(60),
});

export const storyPlanSchema = z
  .object({
    book: bookDraftSchema,
    characters: z.array(characterDraftSchema).min(1).max(12),
    pages: z.array(pageDraftSchema).min(1).max(60),
  })
  .superRefine((plan, ctx) => {
    const { book, characters, pages } = plan;

    // The declared length and the delivered length must agree, or the review
    // screen and the per-page generation loop disagree about the book's size.
    if (pages.length !== book.pageCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pages'],
        message: `book.pageCount is ${book.pageCount} but ${pages.length} pages were returned. They must match.`,
      });
    }

    const seenNumbers = new Set();
    pages.forEach((page, index) => {
      if (seenNumbers.has(page.pageNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pages', index, 'pageNumber'],
          message: `Duplicate pageNumber ${page.pageNumber}. Numbering must be 1..${pages.length} with no repeats.`,
        });
      }
      seenNumbers.add(page.pageNumber);
    });

    for (let expected = 1; expected <= pages.length; expected += 1) {
      if (!seenNumbers.has(expected)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pages'],
          message: `Missing pageNumber ${expected}. Numbering must run 1..${pages.length} with no gaps.`,
        });
      }
    }

    const tempIds = new Set();
    characters.forEach((character, index) => {
      if (tempIds.has(character.tempId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['characters', index, 'tempId'],
          message: `Duplicate tempId "${character.tempId}". Every character needs a unique tempId.`,
        });
      }
      tempIds.add(character.tempId);
    });

    if (!characters.some((character) => character.role === 'main')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['characters'],
        message: 'At least one character must have role "main".',
      });
    }

    // A page pointing at a character that was never described would generate an
    // illustration with no identity to lock on to.
    pages.forEach((page, pageIndex) => {
      page.characterIds.forEach((id, idIndex) => {
        if (!tempIds.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['pages', pageIndex, 'characterIds', idIndex],
            message: `Page ${page.pageNumber} references unknown character "${id}". Valid ids: ${[...tempIds].join(', ')}.`,
          });
        }
      });
    });

    const used = new Set(pages.flatMap((page) => page.characterIds));
    characters.forEach((character, index) => {
      if (!used.has(character.tempId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['characters', index],
          message: `Character "${character.tempId}" never appears on any page. Remove it or use it.`,
        });
      }
    });
  });

/** The subset-of-JSON-Schema hint sent to the model. */
export const STORY_PLAN_JSON_SCHEMA = Object.freeze({
  type: 'object',
  required: ['book', 'characters', 'pages'],
  properties: {
    book: {
      type: 'object',
      required: [
        'title',
        'description',
        'ageGroup',
        'language',
        'genre',
        'artStyle',
        'moral',
        'pageCount',
      ],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        ageGroup: { type: 'string', enum: [...AGE_GROUPS] },
        language: { type: 'string' },
        genre: { type: 'string' },
        artStyle: { type: 'string' },
        moral: { type: 'string' },
        pageCount: { type: 'integer' },
      },
    },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'tempId',
          'name',
          'role',
          'age',
          'appearance',
          'outfit',
          'personality',
          'consistencyPrompt',
        ],
        properties: {
          tempId: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string', enum: [...CHARACTER_ROLES] },
          age: { type: 'string' },
          appearance: { type: 'string' },
          outfit: { type: 'string' },
          personality: { type: 'string' },
          consistencyPrompt: { type: 'string' },
        },
      },
    },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'pageNumber',
          'title',
          'narration',
          'dialogue',
          'sceneDescription',
          'characterIds',
          'location',
          'mood',
          'illustrationPrompt',
        ],
        properties: {
          pageNumber: { type: 'integer' },
          title: { type: 'string' },
          narration: { type: 'string' },
          dialogue: {
            type: 'array',
            items: {
              type: 'object',
              required: ['speaker', 'line'],
              properties: { speaker: { type: 'string' }, line: { type: 'string' } },
            },
          },
          sceneDescription: { type: 'string' },
          characterIds: { type: 'array', items: { type: 'string' } },
          location: { type: 'string' },
          mood: { type: 'string' },
          illustrationPrompt: { type: 'string' },
        },
      },
    },
  },
});

/**
 * Turns validation failures into an instruction the model can act on. Paths are
 * kept because "pages.3.narration" tells it exactly what to fix, where "invalid
 * input" does not.
 */
export function describeIssues(issues, limit = 12) {
  const lines = issues
    .slice(0, limit)
    .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`);

  if (issues.length > limit) {
    lines.push(`- ...and ${issues.length - limit} further problems.`);
  }

  return lines.join('\n');
}

export default { storyPlanSchema, STORY_PLAN_JSON_SCHEMA, describeIssues };
