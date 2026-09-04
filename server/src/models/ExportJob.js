import mongoose from 'mongoose';
import { EXPORT_FORMATS, EXPORT_QUALITY, EXPORT_STATUS } from './enums.js';

const exportJobSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },

    format: { type: String, enum: EXPORT_FORMATS, required: true },
    quality: { type: String, enum: EXPORT_QUALITY, default: 'standard' },
    options: {
      pageSize: { type: String, default: 'a4' },
      orientation: { type: String, enum: ['portrait', 'landscape'], default: 'portrait' },
      bleedMm: { type: Number, default: 0, min: 0, max: 10 },
      includePageNumbers: { type: Boolean, default: true },
      includeWatermark: { type: Boolean, default: true },
      // null = every page; otherwise an explicit, validated page range.
      pageRange: { type: [Number], default: null },
      filename: { type: String, default: null },
      singleImage: { type: Boolean, default: false },
    },

    status: { type: String, enum: EXPORT_STATUS, default: 'queued', index: true },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 2 },
    requestHash: { type: String, required: true },
    idempotencyKey: { type: String, default: null },

    outputAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    fileSizeBytes: { type: Number, default: 0 },
    pageCount: { type: Number, default: 0 },
    estimatedSizeBytes: { type: Number, default: 0 },

    cost: {
    },
    error: {
      code: { type: String, default: null },
      message: { type: String, default: null },
      at: { type: Date, default: null },
    },

    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    downloadedAt: { type: Date, default: null },
    // Signed download links stop working after this instant.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

exportJobSchema.index({ ownerId: 1, requestHash: 1 }, { unique: true });
exportJobSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
exportJobSchema.index({ bookId: 1, createdAt: -1 });

export const ExportJob = mongoose.model('ExportJob', exportJobSchema);
export default ExportJob;
