import mongoose from 'mongoose';

/**
 * Append-only record of consequential actions — admin operations, permission
 * changes, provider config edits, destructive deletes.
 *
 * `changes` holds a field-level diff with values already redacted by the caller.
 * IP addresses are stored hashed, never in the clear.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: null },
    // Set when an admin acts on behalf of, or upon, another account.
    onBehalfOfUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    action: { type: String, required: true, maxlength: 120 },
    subjectType: { type: String, required: true, maxlength: 60 },
    subjectId: { type: mongoose.Schema.Types.ObjectId, default: null },

    changes: [
      {
        _id: false,
        field: { type: String, required: true },
        before: { type: mongoose.Schema.Types.Mixed, default: null },
        after: { type: mongoose.Schema.Types.Mixed, default: null },
      },
    ],

    result: { type: String, enum: ['success', 'failure'], default: 'success' },
    reason: { type: String, default: null, maxlength: 500 },

    requestId: { type: String, default: null },
    ipHash: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 512 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ subjectType: 1, subjectId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const IMMUTABLE = 'Audit log entries are immutable';

auditLogSchema.pre('save', function blockUpdate(next) {
  if (!this.isNew) return next(new Error(IMMUTABLE));
  return next();
});

for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne']) {
  auditLogSchema.pre(op, function blockUpdateQuery(next) {
    next(new Error(IMMUTABLE));
  });
}

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
