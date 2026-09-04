import mongoose from 'mongoose';
import { CHARACTER_ROLES, CHARACTER_STATUS } from './enums.js';

/**
 * A reusable character. `identity` is the consistency contract: once locked,
 * every downstream image request must carry the same consistencyPrompt, seed
 * and reference assets, so the character looks the same on every page and in
 * every future book.
 */
const characterSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storyWorldId: { type: mongoose.Schema.Types.ObjectId, ref: 'StoryWorld', default: null },

    name: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, enum: CHARACTER_ROLES, default: 'main' },
    age: { type: String, default: '' },
    gender: { type: String, default: '' },
    appearance: { type: String, default: '', maxlength: 2000 },
    outfit: { type: String, default: '', maxlength: 2000 },
    personality: { type: String, default: '', maxlength: 2000 },
    artStyle: { type: String, default: '' },

    identity: {
      locked: { type: Boolean, default: false },
      // Verbatim text appended to every image prompt featuring this character.
      consistencyPrompt: { type: String, default: '', maxlength: 2000 },
      seed: { type: Number, default: null },
      referenceAssetIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' }],
      lockedAt: { type: Date, default: null },
      lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      // Hash of the fields above; a mismatch means the lock was bypassed.
      fingerprint: { type: String, default: null },
    },

    // Front / side / three-quarter / full-body sheet.
    previews: [
      {
        _id: false,
        pose: {
          type: String,
          enum: ['front', 'side', 'three_quarter', 'full_body', 'expression'],
          required: true,
        },
        mediaAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', required: true },
        isPrimary: { type: Boolean, default: false },
      },
    ],

    primaryMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    status: { type: String, enum: CHARACTER_STATUS, default: 'draft', index: true },
    lastError: { type: String, default: null },
    lastGenerationJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GenerationJob',
      default: null,
    },

    // Set while the character is still a Gemini-proposed draft (e.g. "character_1").
    tempId: { type: String, default: null },
    usageCount: { type: Number, default: 0 },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

characterSchema.index({ ownerId: 1, status: 1, updatedAt: -1 });
characterSchema.index({ ownerId: 1, isArchived: 1, name: 1 });
characterSchema.index(
  { storyWorldId: 1 },
  { partialFilterExpression: { storyWorldId: { $type: 'objectId' } } },
);

export const Character = mongoose.model('Character', characterSchema);
export default Character;
