import mongoose from 'mongoose';
import { AI_PROVIDERS, JOB_STATUS, JOB_TYPES } from './enums.js';

/**
 * One unit of AI work, whoever performs it.
 *
 * Two indexes carry the idempotency guarantees:
 *   - (ownerId, requestHash) unique — the same request submitted twice returns
 *     the existing job instead of paying for a second one.
 *   - (provider, externalTaskId) unique — a provider callback delivered twice
 *     resolves to exactly one job, so duplicate callbacks cannot double-settle
 *     or double-write.
 */
const generationJobSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: JOB_TYPES, required: true },
    provider: { type: String, enum: AI_PROVIDERS, required: true },
    model: { type: String, required: true },
    promptVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PromptVersion', default: null },

    status: { type: String, enum: JOB_STATUS, default: 'queued', index: true },
    progress: { type: Number, default: 0, min: 0, max: 100 },

    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 3, min: 1 },
    pollAttempts: { type: Number, default: 0, min: 0 },
    nextPollAt: { type: Date, default: null },

    // Stable hash of the normalised request. Drives deduplication.
    requestHash: { type: String, required: true },
    idempotencyKey: { type: String, default: null },
    externalTaskId: { type: String, default: null },

    // Redacted request summary — never the API key, never the raw system prompt.
    request: {
      prompt: { type: String, default: '', maxlength: 8000 },
      negativePrompt: { type: String, default: '' },
      aspectRatio: { type: String, default: null },
      width: { type: Number, default: null },
      height: { type: Number, default: null },
      style: { type: String, default: null },
      seed: { type: Number, default: null },
      referenceAssetIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' }],
      settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    },

    outputs: [
      {
        _id: false,
        mediaAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
        providerUrl: { type: String, default: null },
        transferredAt: { type: Date, default: null },
      },
    ],
    // Populated for text jobs (story plans) after schema validation passes.
    resultJson: { type: mongoose.Schema.Types.Mixed, default: null },

    cost: {
      providerCostMicros: { type: Number, default: 0 },
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
    },

    error: {
      code: { type: String, default: null },
      message: { type: String, default: null },
      retryable: { type: Boolean, default: false },
      at: { type: Date, default: null },
    },

    callback: {
      receivedCount: { type: Number, default: 0 },
      firstReceivedAt: { type: Date, default: null },
      lastReceivedAt: { type: Date, default: null },
      verified: { type: Boolean, default: false },
    },

    refs: {
      bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', default: null },
      pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookPage', default: null },
      characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', default: null },
      parentJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'GenerationJob', default: null },
    },

    // Set by whichever completion path claims the job first. The claim is what
    // makes a callback and a poll arriving together settle it exactly once.
    settleClaimedAt: { type: Date, default: null },

    queuedAt: { type: Date, default: Date.now },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    latencyMs: { type: Number, default: null },
  },
  { timestamps: true },
);

generationJobSchema.index({ ownerId: 1, requestHash: 1 }, { unique: true });
// `sparse` would NOT work here: these fields default to null, and a sparse index
// only skips documents where the field is absent — every unclaimed job would
// collide on `null`. A partial filter on the real type is the correct guard.
generationJobSchema.index(
  { provider: 1, externalTaskId: 1 },
  { unique: true, partialFilterExpression: { externalTaskId: { $type: 'string' } } },
);
generationJobSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
generationJobSchema.index(
  { status: 1, nextPollAt: 1 },
  { partialFilterExpression: { nextPollAt: { $type: 'date' } } },
);
generationJobSchema.index(
  { 'refs.bookId': 1, status: 1 },
  { partialFilterExpression: { 'refs.bookId': { $type: 'objectId' } } },
);
generationJobSchema.index(
  { 'refs.pageId': 1 },
  { partialFilterExpression: { 'refs.pageId': { $type: 'objectId' } } },
);
generationJobSchema.index({ type: 1, status: 1, createdAt: -1 });

generationJobSchema.virtual('isTerminal').get(function isTerminal() {
  return ['succeeded', 'failed', 'cancelled'].includes(this.status);
});

generationJobSchema.set('toJSON', { virtuals: true });

export const GenerationJob = mongoose.model('GenerationJob', generationJobSchema);
export default GenerationJob;
