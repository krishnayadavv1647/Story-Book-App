import crypto from 'node:crypto';

import { env } from '../config/env.js';

/**
 * Reversible encryption for secrets we must be able to read back — currently a
 * user's own provider API keys (BYOK), stored on their `User` doc.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than yielding garbage. The 32-byte key is derived from a dedicated secret so
 * the encryption key is not shared with token signing or cookies. In production
 * `APIKEY_ENC_SECRET` is required; in dev/test it falls back to `COOKIE_SECRET`
 * so the app boots without extra config.
 *
 * Format: `v1:<iv>:<tag>:<ciphertext>`, each segment base64. The `v1` prefix
 * leaves room to rotate the scheme later.
 */
const VERSION = 'v1';

let cachedKey;

function key() {
  if (cachedKey) return cachedKey;
  const secret = env.APIKEY_ENC_SECRET || env.COOKIE_SECRET;
  if (!secret) {
    throw new Error('APIKEY_ENC_SECRET (or COOKIE_SECRET) must be set to encrypt secrets');
  }
  cachedKey = crypto.scryptSync(secret, 'sb-apikey-v1', 32);
  return cachedKey;
}

/** Encrypts a non-empty string. Returns the compact `v1:…` envelope. */
export function encryptSecret(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Nothing to encrypt');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/**
 * Decrypts a `v1:…` envelope back to the original string. Returns `null` for a
 * null/empty input or anything that does not verify — a corrupt or foreign
 * value never throws its way up into a request handler.
 */
export function decryptSecret(payload) {
  if (!payload || typeof payload !== 'string') return null;
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ct = Buffer.from(parts[3], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export default { encryptSecret, decryptSecret };
