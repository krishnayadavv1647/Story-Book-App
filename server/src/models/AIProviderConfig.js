import mongoose from 'mongoose';
import { AI_PROVIDERS } from './enums.js';

/**
 * Operational settings for a provider/model pair — which model is active, what
 * it costs, how hard we may push it.
 *
 * Credentials are deliberately NOT stored here. API keys live only in the server
 * environment; putting one in the database would put it in backups, in admin
 * responses and in logs.
 */
const aiProviderConfigSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: AI_PROVIDERS, required: true },
    model: { type: String, required: true },
    label: { type: String, default: '' },
    purpose: {
      type: String,
      enum: ['story', 'image', 'image_edit'],
      required: true,
    },

    isActive: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false },

    capabilities: {
      supportsNegativePrompt: { type: Boolean, default: false },
      supportsSeed: { type: Boolean, default: false },
      supportsReferenceImages: { type: Boolean, default: false },
      supportsImageEdit: { type: Boolean, default: false },
      supportsCallback: { type: Boolean, default: false },
      maxReferenceImages: { type: Number, default: 0 },
      aspectRatios: { type: [String], default: [] },
    },

    defaults: {
      aspectRatio: { type: String, default: null },
      width: { type: Number, default: null },
      height: { type: Number, default: null },
      temperature: { type: Number, default: null },
      style: { type: String, default: null },
    },
    providerCostMicros: { type: Number, default: 0, min: 0 },

    limits: {
      timeoutMs: { type: Number, default: 60_000 },
      maxAttempts: { type: Number, default: 3 },
      maxPollAttempts: { type: Number, default: 60 },
      pollIntervalMs: { type: Number, default: 3000 },
      requestsPerMinute: { type: Number, default: 60 },
    },

    health: {
      status: { type: String, enum: ['unknown', 'healthy', 'degraded', 'down'], default: 'unknown' },
      checkedAt: { type: Date, default: null },
      consecutiveFailures: { type: Number, default: 0 },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

aiProviderConfigSchema.index({ provider: 1, model: 1, purpose: 1 }, { unique: true });
// Exactly one default per purpose.
aiProviderConfigSchema.index(
  { purpose: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } },
);
aiProviderConfigSchema.index({ isActive: 1, purpose: 1 });

export const AIProviderConfig = mongoose.model('AIProviderConfig', aiProviderConfigSchema);
export default AIProviderConfig;
