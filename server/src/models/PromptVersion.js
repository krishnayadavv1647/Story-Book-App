import mongoose from 'mongoose';
import { AI_PROVIDERS } from './enums.js';

/**
 * Versioned prompt templates. Every job records which version produced it, so a
 * regression can be traced to the prompt change that caused it and a book can be
 * regenerated with the exact template it was built from.
 */
const promptVersionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    version: { type: Number, required: true, min: 1 },
    provider: { type: String, enum: AI_PROVIDERS, required: true },
    model: { type: String, required: true },

    systemInstruction: { type: String, default: '', maxlength: 20000 },
    template: { type: String, required: true, maxlength: 20000 },
    // JSON Schema the provider output is validated against.
    responseSchema: { type: mongoose.Schema.Types.Mixed, default: null },
    settings: {
      temperature: { type: Number, default: 0.8 },
      topP: { type: Number, default: null },
      maxOutputTokens: { type: Number, default: null },
    },

    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: false },
    activatedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

promptVersionSchema.index({ key: 1, version: 1 }, { unique: true });
// Exactly one active version per prompt key.
promptVersionSchema.index(
  { key: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

export const PromptVersion = mongoose.model('PromptVersion', promptVersionSchema);
export default PromptVersion;
