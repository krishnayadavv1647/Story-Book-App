import mongoose from 'mongoose';
import { NOTIFICATION_TYPES } from './enums.js';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, default: '', maxlength: 1000 },
    // Relative in-app path, e.g. /books/:id/editor.
    actionPath: { type: String, default: null },
    refs: {
      bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', default: null },
      characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', default: null },
      exportJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExportJob', default: null },
      generationJobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GenerationJob',
        default: null,
      },
    },
    severity: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
    readAt: { type: Date, default: null },
    // Read notifications are reaped by the TTL index below.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: 'date' } } },
);

export const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
