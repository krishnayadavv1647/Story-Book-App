import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { USER_ROLES, USER_STATUS } from './enums.js';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      // Structural check only; deliverability is proven by the verification mail.
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    /**
     * `select: false` — a hash must be asked for explicitly, never returned by
     * default.
     *
     * Optional, because there are three ways in and only one of them uses a
     * password: an emailed one-time code and Sign in with Google both leave
     * this null. The schema cannot say which door an account came through, so
     * it no longer pretends to; `verifyPassword` returns false without a hash,
     * which is what actually keeps the password route shut on those accounts.
     * The register endpoint still demands a password of its own callers.
     */
    passwordHash: { type: String, default: null, select: false },
    // The Google account's stable subject id (`sub`), set when an account is
    // created through or linked to Sign in with Google. Null for password-only
    // accounts. Uniqueness is enforced by a partial index below so the many
    // null values never collide.
    googleId: { type: String, default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    avatarUrl: { type: String, default: null },
    role: { type: String, enum: USER_ROLES, default: 'user', index: true },
    status: { type: String, enum: USER_STATUS, default: 'active', index: true },
    emailVerifiedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    locale: { type: String, default: 'en' },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
      emailNotifications: { type: Boolean, default: true },
    },

    // Only the hash is kept, and never returned — the raw token lives solely in
    // the emailed link. A separate collection would buy nothing here.
    passwordReset: {
      tokenHash: { type: String, default: null, select: false },
      expiresAt: { type: Date, default: null, select: false },
      requestedAt: { type: Date, default: null, select: false },
    },

    /**
     * The one-time code emailed for a passwordless sign-in.
     *
     * Only the hash is kept, exactly as for a password reset — a leaked database
     * must not hand anybody a working code. `attempts` is what makes six digits
     * safe: the code is burned after OTP_MAX_ATTEMPTS wrong guesses, so it
     * cannot be walked through inside its lifetime.
     */
    loginCode: {
      codeHash: { type: String, default: null, select: false },
      expiresAt: { type: Date, default: null, select: false },
      attempts: { type: Number, default: 0, select: false },
      requestedAt: { type: Date, default: null, select: false },
    },

    /**
     * What is left to spend on generation.
     *
     * The running total, and the only figure read on the hot path — every
     * movement is also written to the CreditLedger, which is where a balance is
     * explained rather than merely stated. A new account opens on
     * CREDITS_SIGNUP_GRANT.
     *
     * `min: 0` is a backstop, not the guard: spending is a conditional update
     * that refuses to match an account without the balance for it, so two
     * requests arriving together can never both take the last credit.
     */
    credits: { type: Number, default: () => env.CREDITS_SIGNUP_GRANT, min: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ createdAt: -1 });
// Unique only among real Google ids. A partial filter (not `sparse`) is what
// makes this safe with the `null` default: sparse would still index every
// password account's null and collide, so it is scoped to string values.
userSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } },
);

/** Write-only virtual: assigning it queues a hash on save. */
userSchema
  .virtual('password')
  .set(function setPassword(plain) {
    this.$locals.plainPassword = plain;
  })
  .get(function getPassword() {
    return undefined;
  });

// Hashing runs on `validate`, not `save`, so `passwordHash` is populated before
// the `required` check for it is evaluated.
userSchema.pre('validate', async function hashPassword(next) {
  const plain = this.$locals.plainPassword;
  if (!plain) return next();
  this.passwordHash = await bcrypt.hash(plain, env.BCRYPT_ROUNDS);
  this.$locals.plainPassword = undefined;
  return next();
});

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.isAdmin = function isAdmin() {
  return this.role === 'admin';
};

export const User = mongoose.model('User', userSchema);
export default User;
