import mongoose from 'mongoose';
import { AGE_GROUPS } from './enums.js';

/**
 * A reusable setting shared across books — locations, lore, palette and art
 * direction. Keeping it separate from Book is what lets a series stay visually
 * and narratively consistent.
 */
const storyWorldSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: '', maxlength: 4000 },
    genre: { type: String, default: '' },
    artStyle: { type: String, default: '' },
    ageGroup: { type: String, enum: AGE_GROUPS, default: '6-9' },
    palette: { type: [String], default: [] },
    locations: [
      {
        _id: false,
        name: { type: String, required: true },
        description: { type: String, default: '' },
      },
    ],
    loreNotes: { type: String, default: '', maxlength: 8000 },
    // Appended to every illustration prompt generated inside this world.
    styleGuidePrompt: { type: String, default: '', maxlength: 2000 },
    characterIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Character' }],
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

storyWorldSchema.index({ ownerId: 1, isArchived: 1, updatedAt: -1 });
storyWorldSchema.index({ ownerId: 1, name: 1 }, { unique: true });

export const StoryWorld = mongoose.model('StoryWorld', storyWorldSchema);
export default StoryWorld;
