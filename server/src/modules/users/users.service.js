import bcrypt from 'bcryptjs';
import { User, RefreshToken } from '../../models/index.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

/** The account as the settings screen shows it. Never the hash. */
export function publicProfile(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt,
    preferences: user.preferences,
    createdAt: user.createdAt,
  };
}

export async function updateProfile({ user, patch }) {
  if (patch.name !== undefined) user.name = patch.name;
  if (patch.preferences) {
    user.preferences = { ...user.preferences.toObject?.() ?? user.preferences, ...patch.preferences };
  }

  await user.save();
  return publicProfile(user);
}

/**
 * Changes the password.
 *
 * The current password is required even though the session already proves who
 * this is: a borrowed, unlocked browser should not be enough to lock the owner
 * out of their own account. Every other session is revoked afterwards, because
 * changing a password is what someone does when they think it is compromised.
 */
export async function changePassword({ user, currentPassword, newPassword }) {
  const withHash = await User.findById(user._id).select('+passwordHash');
  const matches = await bcrypt.compare(currentPassword, withHash.passwordHash);

  if (!matches) {
    throw ApiError.badRequest('That is not your current password.', {
      code: 'WRONG_PASSWORD',
    });
  }

  if (await bcrypt.compare(newPassword, withHash.passwordHash)) {
    throw ApiError.badRequest('The new password must be different.', { code: 'SAME_PASSWORD' });
  }

  withHash.passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await withHash.save();

  const revoked = await RefreshToken.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'password_changed' } },
  );

  return { changed: true, sessionsRevoked: revoked.modifiedCount ?? 0 };
}

export default { publicProfile, updateProfile, changePassword };
