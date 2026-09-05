import bcrypt from 'bcryptjs';
import { User, RefreshToken } from '../../models/index.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { encryptSecret, decryptSecret } from '../../utils/secretBox.js';

/** The providers a user can bring their own key for. */
export const API_KEY_PROVIDERS = ['gemini', 'kie'];

const PROVIDER_LABEL = { gemini: 'Gemini', kie: 'Kie.ai' };
const MISSING_CODE = { gemini: 'GEMINI_KEY_MISSING', kie: 'KIE_KEY_MISSING' };

/** The account as the settings screen shows it. Never the hash, never a key. */
export function publicProfile(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt,
    preferences: user.preferences,
    // Only whether each BYOK key is set — never the key itself.
    apiKeys: {
      gemini: Boolean(user.apiKeys?.gemini),
      kie: Boolean(user.apiKeys?.kie),
    },
    createdAt: user.createdAt,
  };
}

/**
 * Loads and decrypts a user's own provider keys. Used both on the request path
 * (by user id) and on detached poll/callback paths (by `job.ownerId`). Returns
 * `{ gemini, kie }` with `null` for any key that is unset or fails to decrypt.
 */
export async function getUserApiKeys(userId) {
  const user = await User.findById(userId).select('+apiKeys.gemini +apiKeys.kie');
  return {
    gemini: user?.apiKeys?.gemini ? decryptSecret(user.apiKeys.gemini) : null,
    kie: user?.apiKeys?.kie ? decryptSecret(user.apiKeys.kie) : null,
  };
}

/**
 * Returns the decrypted key for `provider`, or throws a clear, Settings-pointing
 * error. This is the one gate that enforces "no system key" — generation cannot
 * proceed without the user's own key.
 */
export async function requireUserApiKey(userId, provider) {
  const keys = await getUserApiKeys(userId);
  const key = keys[provider];
  if (!key) {
    throw ApiError.badRequest(
      `Add your ${PROVIDER_LABEL[provider]} API key in Settings to generate.`,
      { code: MISSING_CODE[provider] },
    );
  }
  return key;
}

/**
 * Sets or clears a user's provider keys. A non-empty string is encrypted and
 * stored; an explicit empty string clears that key. Keys absent from `patch`
 * are left untouched. Never logs a value.
 */
export async function setApiKeys({ user, patch }) {
  const doc = await User.findById(user._id).select('+apiKeys.gemini +apiKeys.kie');
  if (!doc) throw ApiError.notFound();

  for (const provider of API_KEY_PROVIDERS) {
    const value = patch[provider];
    if (value === undefined) continue;
    doc.apiKeys[provider] = value === '' ? null : encryptSecret(value.trim());
  }

  await doc.save();
  return publicProfile(doc);
}

/**
 * The profile with its API-key status. The standard request-loaded user does
 * NOT select the `select:false` key fields, so `publicProfile` would report them
 * as unset — this loads them explicitly so the "key set / not set" flags are
 * correct wherever a profile is returned.
 */
export async function getProfile(userId) {
  const doc = await User.findById(userId).select('+apiKeys.gemini +apiKeys.kie');
  if (!doc) throw ApiError.notFound();
  return publicProfile(doc);
}

export async function updateProfile({ user, patch }) {
  const doc = await User.findById(user._id).select('+apiKeys.gemini +apiKeys.kie');
  if (!doc) throw ApiError.notFound();

  if (patch.name !== undefined) doc.name = patch.name;
  if (patch.preferences) {
    doc.preferences = { ...doc.preferences.toObject?.() ?? doc.preferences, ...patch.preferences };
  }

  await doc.save();
  return publicProfile(doc);
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

export default {
  publicProfile,
  getProfile,
  updateProfile,
  changePassword,
  getUserApiKeys,
  requireUserApiKey,
  setApiKeys,
  API_KEY_PROVIDERS,
};
