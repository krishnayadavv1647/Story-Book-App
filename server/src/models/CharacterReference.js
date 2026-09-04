import mongoose from 'mongoose';

/**
 * A reference image bound to a character — either uploaded by the user or
 * produced by a generation job. These are the assets replayed into every later
 * image request so identity survives across pages and books.
 */
const characterReferenceSchema = new mongoose.Schema(
  {
    characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mediaAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', required: true },
    kind: { type: String, enum: ['upload', 'generated', 'derived'], required: true },
    pose: {
      type: String,
      enum: ['front', 'side', 'three_quarter', 'full_body', 'expression', 'unspecified'],
      default: 'unspecified',
    },
    caption: { type: String, default: '', maxlength: 500 },
    isPrimary: { type: Boolean, default: false },
    weight: { type: Number, default: 1, min: 0, max: 1 },
    generationJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'GenerationJob', default: null },
  },
  { timestamps: true },
);

characterReferenceSchema.index({ characterId: 1, createdAt: -1 });
characterReferenceSchema.index({ characterId: 1, mediaAssetId: 1 }, { unique: true });
characterReferenceSchema.index({ ownerId: 1 });
// At most one primary reference per character.
characterReferenceSchema.index(
  { characterId: 1, isPrimary: 1 },
  { unique: true, partialFilterExpression: { isPrimary: true } },
);

export const CharacterReference = mongoose.model('CharacterReference', characterReferenceSchema);
export default CharacterReference;
