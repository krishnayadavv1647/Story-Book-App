import mongoose from 'mongoose';

/**
 * One row per issued refresh token (a session).
 *
 * Only a SHA-256 hash of the token is stored, so a database leak cannot be
 * replayed. Tokens rotate on every use: the old row is marked `rotated` and
 * points at its replacement. Presenting an already-rotated token is a replay,
 * and the whole `family` is revoked.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true },
    family: { type: mongoose.Schema.Types.ObjectId, required: true },
    replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'RefreshToken', default: null },
    status: {
      type: String,
      enum: ['active', 'rotated', 'revoked'],
      default: 'active',
    },
    userAgent: { type: String, default: null, maxlength: 512 },
    ipHash: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ userId: 1, status: 1 });
refreshTokenSchema.index({ family: 1 });
// TTL — expired sessions are reaped by MongoDB rather than by a job.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
export default RefreshToken;
