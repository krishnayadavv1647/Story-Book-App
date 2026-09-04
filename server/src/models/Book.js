import mongoose from 'mongoose';
import {
  AGE_GROUPS,
  BOOK_STATUS,
  BOOK_BINDINGS,
  PAPER_FINISHES,
  BOOK_ORIENTATIONS,
} from './enums.js';

/**
 * A book owns its metadata and plan. Page content lives in BookPage so that a
 * single page can be regenerated without rewriting the book document — the
 * invariant that "regenerating one page cannot silently mutate others".
 */
const bookSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storyWorldId: { type: mongoose.Schema.Types.ObjectId, ref: 'StoryWorld', default: null },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    // The line that sits under the title on the generated cover. Short on
    // purpose: it has to stay readable at card size, where the cover is barely
    // 200px wide.
    subtitle: { type: String, default: '', trim: true, maxlength: 160 },
    // Printed small in the outer margin of every page that carries words, and
    // under the title on the cover — the reference book's running head.
    author: { type: String, default: '', trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 4000 },
    ageGroup: { type: String, enum: AGE_GROUPS, default: '6-9' },
    language: { type: String, default: 'en' },
    genre: { type: String, default: '' },
    artStyle: { type: String, default: '' },
    moral: { type: String, default: '', maxlength: 500 },
    pageCount: { type: Number, default: 10, min: 1, max: 60 },
    tags: { type: [String], default: [] },

    status: { type: String, enum: BOOK_STATUS, default: 'draft', index: true },
    publishedAt: { type: Date, default: null },
    coverMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    /**
     * Where `coverMediaId` came from.
     *
     * `page` is the old behaviour and still the fallback — the first finished
     * illustration stands in as a thumbnail. `generated` is a real cover, drawn
     * from the cover prompt with the title and subtitle inside the artwork, and
     * a page image must never quietly replace one.
     */
    coverSource: { type: String, enum: ['page', 'generated'], default: 'page' },
    characterIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Character' }],

    // The accepted Gemini plan. Kept for regeneration context and for diffing.
    plan: {
      summary: { type: String, default: '' },
      promptVersionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PromptVersion',
        default: null,
      },
      sourcePrompt: { type: String, default: '', maxlength: 8000 },
      generatedAt: { type: Date, default: null },
      acceptedAt: { type: Date, default: null },
      // Part of the regeneration request hash, so a double-click collides with
      // the in-flight job instead of paying for a second plan.
      regenerationCount: { type: Number, default: 0 },
    },

    generation: {
      currentJobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GenerationJob',
        default: null,
      },
      pagesTotal: { type: Number, default: 0 },
      pagesReady: { type: Number, default: 0 },
      pagesFailed: { type: Number, default: 0 },
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      lastError: { type: String, default: null },
    },

    /**
     * The one-shot run: prompt in, finished book out.
     *
     * The product's normal path walks the author through plan review, character
     * design and illustration as separate steps. Every one of them is a screen
     * and a button, and for someone who just wants the book their settings
     * already describe, that is four decisions they never asked to make. With
     * autopilot on, each stage starts the next as it settles — see
     * `advanceAutopilot` — and the author watches one progress screen.
     *
     * `stage` is what makes that safe: it is claimed with a conditional update,
     * so two images settling in the same instant cannot both start the next
     * stage.
     */
    autopilot: {
      enabled: { type: Boolean, default: false },
      stage: {
        type: String,
        enum: ['characters', 'pages', 'cover', 'done', null],
        default: null,
      },
      // Whether the cast is drawn from their written description alone, or
      // anchored to photographs the author supplied.
      characterImages: { type: String, enum: ['generate', 'upload'], default: 'generate' },
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      // A stage that could not run. The run continues regardless — a book with
      // one vague character still beats no book — so this is a note, not a stop.
      lastError: { type: String, default: null },
    },

    /**
     * Print production settings. Every field has a default, so a book made
     * before this existed simply reads as an 8×8 paperback with a 0.125in bleed
     * — the children's-book default — rather than needing a migration. The
     * print-geometry engine turns these into real pixel/point dimensions.
     */
    print: {
      size: { type: String, default: '8x8' },
      orientation: { type: String, enum: BOOK_ORIENTATIONS, default: 'square' },
      binding: { type: String, enum: BOOK_BINDINGS, default: 'paperback' },
      paperFinish: { type: String, enum: PAPER_FINISHES, default: 'matte' },
      bleed: { type: Boolean, default: true },
      cropMarks: { type: Boolean, default: false },
      dpi: { type: Number, default: 300, min: 72, max: 1200 },
      bleedIn: { type: Number, default: 0.125, min: 0, max: 0.5 },
      safeMarginIn: { type: Number, default: 0.25, min: 0.1, max: 1 },
      // Only read when `size` is 'custom'.
      customWidthIn: { type: Number, default: null },
      customHeightIn: { type: Number, default: null },
    },

    isArchived: { type: Boolean, default: false },
    lastOpenedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Ownership + status is the dashboard and My Books access path.
bookSchema.index({ ownerId: 1, status: 1, updatedAt: -1 });
bookSchema.index({ ownerId: 1, isArchived: 1, updatedAt: -1 });
bookSchema.index(
  { storyWorldId: 1 },
  { partialFilterExpression: { storyWorldId: { $type: 'objectId' } } },
);
bookSchema.index({ title: 'text', description: 'text' });

bookSchema.virtual('progressPercent').get(function progressPercent() {
  const total = this.generation?.pagesTotal ?? 0;
  if (total === 0) return 0;
  return Math.round(((this.generation.pagesReady ?? 0) / total) * 100);
});

bookSchema.set('toJSON', { virtuals: true });

export const Book = mongoose.model('Book', bookSchema);
export default Book;
