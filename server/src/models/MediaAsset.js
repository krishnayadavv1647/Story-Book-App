import mongoose from 'mongoose';
import { MEDIA_KINDS, MEDIA_STATUS, MODERATION_STATUS } from './enums.js';

/**
 * Every binary the product owns. Bytes live in object storage; this document
 * holds only the pointer and metadata — no base64 blobs in MongoDB.
 *
 * Provider images are always transferred into our own bucket before being shown
 * to a user, so a book never depends on an upstream URL that can expire.
 */
const mediaAssetSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: MEDIA_KINDS, required: true },
    status: { type: String, enum: MEDIA_STATUS, default: 'pending', index: true },

    storage: {
      driver: { type: String, default: 's3' },
      bucket: { type: String, default: null },
      key: { type: String, default: null },
      etag: { type: String, default: null },
      sizeBytes: { type: Number, default: 0 },
      contentType: { type: String, default: null },
      width: { type: Number, default: null },
      height: { type: Number, default: null },
    },
    checksumSha256: { type: String, default: null },

    // Where it came from, when it was produced upstream.
    origin: {
      provider: { type: String, default: null },
      model: { type: String, default: null },
      externalTaskId: { type: String, default: null },
      sourceUrl: { type: String, default: null },
      generationJobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GenerationJob',
        default: null,
      },
    },

    moderation: {
      status: { type: String, enum: MODERATION_STATUS, default: 'pending' },
      reviewedAt: { type: Date, default: null },
      labels: { type: [String], default: [] },
    },

    refs: {
      bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', default: null },
      pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookPage', default: null },
      characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', default: null },
    },

    // Set on scratch uploads; the TTL index below reaps anything never claimed.
    tempExpiresAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

mediaAssetSchema.index({ ownerId: 1, kind: 1, createdAt: -1 });
// Every one of these fields defaults to null, so the filter must be partial on
// the real type — a sparse index would index the nulls and, for `storage.key`,
// let a single pending asset block every other one.
mediaAssetSchema.index(
  { 'refs.bookId': 1 },
  { partialFilterExpression: { 'refs.bookId': { $type: 'objectId' } } },
);
mediaAssetSchema.index(
  { 'refs.pageId': 1 },
  { partialFilterExpression: { 'refs.pageId': { $type: 'objectId' } } },
);
mediaAssetSchema.index(
  { 'refs.characterId': 1 },
  { partialFilterExpression: { 'refs.characterId': { $type: 'objectId' } } },
);
mediaAssetSchema.index(
  { 'storage.key': 1 },
  { unique: true, partialFilterExpression: { 'storage.key': { $type: 'string' } } },
);
mediaAssetSchema.index(
  { checksumSha256: 1 },
  { partialFilterExpression: { checksumSha256: { $type: 'string' } } },
);
// TTL — unclaimed temporary uploads expire on their own.
mediaAssetSchema.index(
  { tempExpiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { tempExpiresAt: { $type: 'date' } } },
);

export const MediaAsset = mongoose.model('MediaAsset', mediaAssetSchema);
export default MediaAsset;
