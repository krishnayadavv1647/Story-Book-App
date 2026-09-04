import mongoose from 'mongoose';
import { MODERATION_STATUS, MODERATION_SUBJECTS } from './enums.js';

/**
 * A record of every safety decision. Because this is a children's product, both
 * inbound prompts and generated output are checked, and every check is written
 * down whether it passed or not.
 */
const moderationEventSchema = new mongoose.Schema(
  {
    subject: { type: String, enum: MODERATION_SUBJECTS, required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, default: null },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    status: { type: String, enum: MODERATION_STATUS, required: true, index: true },
    source: { type: String, enum: ['heuristic', 'provider', 'manual'], required: true },
    labels: { type: [String], default: [] },
    score: { type: Number, default: null, min: 0, max: 1 },
    // A short excerpt for review, never the full user text.
    excerpt: { type: String, default: '', maxlength: 500 },
    ageGroup: { type: String, default: null },

    action: {
      type: String,
      enum: ['allowed', 'blocked', 'rewritten', 'flagged_for_review'],
      required: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNotes: { type: String, default: '' },

    generationJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'GenerationJob', default: null },
    requestId: { type: String, default: null },
  },
  { timestamps: true },
);

moderationEventSchema.index({ ownerId: 1, createdAt: -1 });
moderationEventSchema.index({ status: 1, createdAt: -1 });
moderationEventSchema.index(
  { subject: 1, subjectId: 1 },
  { partialFilterExpression: { subjectId: { $type: 'objectId' } } },
);

export const ModerationEvent = mongoose.model('ModerationEvent', moderationEventSchema);
export default ModerationEvent;
