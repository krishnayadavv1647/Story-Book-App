import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const bookParamSchema = z.object({ bookId: objectId });
export const pageParamSchema = z.object({ bookId: objectId, pageId: objectId });

/** `#RGB` or `#RRGGBB`. Anything else would reach the renderer as raw CSS. */
const hexColor = z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Not a colour');

export const LAYOUT_PRESETS = [
  // The default: a full-bleed illustration on one leaf, the words on the facing
  // one. Measured from the reference book; see PageRender.
  'spread',
  'image-top',
  'image-bottom',
  'image-left',
  'image-right',
  'full-bleed',
  'text-only',
];

const layoutSchema = z
  .object({
    preset: z.enum(LAYOUT_PRESETS),
    backgroundColor: hexColor,
  })
  .partial();

const typographySchema = z
  .object({
    fontFamily: z.string().trim().max(120),
    fontSize: z.number().int().min(8).max(96),
    lineHeight: z.number().min(1).max(3),
    textAlign: z.enum(['left', 'center', 'right', 'justify']),
    color: hexColor,
  })
  .partial();

/**
 * Only the fields the review and editor screens can edit. Anything else —
 * order, status, mediaAssetId, revisions — is owned by the server and must not
 * be settable from a page-edit request.
 */
export const updatePageSchema = z
  .object({
    layout: layoutSchema,
    typography: typographySchema,
    characterConsistency: z.boolean(),
    title: z.string().trim().max(200),
    narration: z.string().trim().max(4000),
    sceneDescription: z.string().trim().max(4000),
    illustrationPrompt: z.string().trim().max(4000),
    location: z.string().trim().max(200),
    mood: z.string().trim().max(120),
    characterIds: z.array(objectId).max(12),
    dialogue: z
      .array(z.object({ speaker: z.string().trim().max(120), line: z.string().trim().max(600) }))
      .max(12),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to update' });

export const addPageSchema = z.object({
  at: z.coerce.number().int().min(0).max(60).optional(),
});

export const reorderSchema = z.object({
  order: z.array(objectId).min(1).max(60),
});

/** The editor asks the server to pick a layout rather than choosing blindly. */
export const magicLayoutSchema = z.object({}).optional();

/**
 * Setting a page's artwork from an uploaded asset. `mediaAssetId` is not in the
 * patch schema on purpose — a client that could set it freely could point a page
 * at any asset id in the database. This takes the id through its own endpoint,
 * where ownership is checked.
 */
export const setPageArtworkSchema = z.object({ assetId: objectId });

export const rewritePageSchema = z.object({
  instruction: z.string().trim().max(600).optional(),
});

export default {
  bookParamSchema,
  pageParamSchema,
  updatePageSchema,
  magicLayoutSchema,
  rewritePageSchema,
  setPageArtworkSchema,
  LAYOUT_PRESETS,
  addPageSchema,
  reorderSchema,
};
