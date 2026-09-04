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
    // `select: false` — a hash must be asked for explicitly, never returned by default.
    // Required for everyone EXCEPT a Google-only account, which authenticates
    // through Google and never sets one.
    passwordHash: {
      type: String,
      required: function passwordRequiredUnlessGoogle() {
        return !this.googleId;
      },
      select: false,
    },
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
