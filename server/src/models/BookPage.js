import mongoose from 'mongoose';
import { PAGE_STATUS, BOOK_PAGE_TYPES } from './enums.js';

/**
 * One revision of a page's content. Revisions are append-only: accepting a new
 * one flips `activeRevisionId` and leaves every earlier revision intact, which
 * is what makes "previous accepted revisions remain recoverable" true.
 */
const revisionSchema = new mongoose.Schema(
  {
    label: { type: String, default: '' },
    source: {
      type: String,
      enum: ['gemini', 'kie', 'user', 'ai_edit', 'import'],
      required: true,
    },
    narration: { type: String, default: '' },
    dialogue: { type: [{ _id: false, speaker: String, line: String }], default: [] },
    sceneDescription: { type: String, default: '' },
    illustrationPrompt: { type: String, default: '' },
    mediaAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    generationJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'GenerationJob', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: true },
);

const bookPageSchema = new mongoose.Schema(
  {
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Canonical 1-based position. The (bookId, order) unique index below is why
    // reordering must run as a transaction that first shifts affected rows to a
    // negative offset — never as a naive per-row update.
    order: { type: Number, required: true, min: 1 },

    // The role this page plays. `story` is the default so every page that
    // existed before this field — all of them story pages — keeps its meaning
    // with no migration; the covers, title and ending pages are set explicitly.
    type: { type: String, enum: BOOK_PAGE_TYPES, default: 'story', index: true },

    title: { type: String, default: '', maxlength: 200 },
    narration: { type: String, default: '', maxlength: 4000 },
    dialogue: { type: [{ _id: false, speaker: String, line: String }], default: [] },
    sceneDescription: { type: String, default: '', maxlength: 4000 },
    illustrationPrompt: { type: String, default: '', maxlength: 4000 },
    characterIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Character' }],
    location: { type: String, default: '' },
    mood: { type: String, default: '' },

    mediaAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },

    // When off, this page's illustration is generated from the scene alone and
    // the cast's locked appearance is not replayed into it. On by default,
    // because a character who changes between pages is the usual complaint.
    characterConsistency: { type: Boolean, default: true },

    layout: {
      preset: {
        type: String,
        enum: [
          // The default: a full-bleed illustration on one leaf and the words on
          // the facing one, measured from the reference book. The rest arrange a
          // picture and a paragraph on a single leaf, and are still offered in
          // the editor — but a page that has to hold both is where the empty
          // space and the broken layouts came from.
          'spread',
          'image-top',
          'image-bottom',
          'image-left',
          'image-right',
          'full-bleed',
          'text-only',
        ],
        default: 'spread',
      },
      backgroundColor: { type: String, default: '#FFFFFF' },
    },
    typography: {
      fontFamily: { type: String, default: 'inherit' },
      fontSize: { type: Number, default: 18, min: 8, max: 96 },
      lineHeight: { type: Number, default: 1.5, min: 1, max: 3 },
      textAlign: { type: String, enum: ['left', 'center', 'right', 'justify'], default: 'left' },
      color: { type: String, default: '#111111' },
    },

    status: { type: String, enum: PAGE_STATUS, default: 'pending', index: true },
    lastError: { type: String, default: null },
    lastGenerationJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GenerationJob',
      default: null,
    },

    revisions: { type: [revisionSchema], default: [] },
    activeRevisionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

// Stable page identity + explicit ordering, enforced by the database.
bookPageSchema.index({ bookId: 1, order: 1 }, { unique: true });
bookPageSchema.index({ bookId: 1, status: 1 });
bookPageSchema.index({ ownerId: 1, updatedAt: -1 });

bookPageSchema.virtual('activeRevision').get(function activeRevision() {
  if (!this.activeRevisionId) return null;
  return this.revisions?.id(this.activeRevisionId) ?? null;
});

bookPageSchema.set('toJSON', { virtuals: true });

export const BookPage = mongoose.model('BookPage', bookPageSchema);
export default BookPage;
