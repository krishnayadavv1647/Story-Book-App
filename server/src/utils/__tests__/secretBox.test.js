import { describe, it, expect } from 'vitest';

import { encryptSecret, decryptSecret } from '../secretBox.js';

describe('secretBox', () => {
  it('round-trips a value through encrypt/decrypt', () => {
    const key = 'AIza-super-secret-provider-key-123';
    const box = encryptSecret(key);

    expect(box).not.toContain(key); // stored form never reveals the plaintext
    expect(box.startsWith('v1:')).toBe(true);
    expect(decryptSecret(box)).toBe(key);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encryptSecret('same-value')).not.toBe(encryptSecret('same-value'));
  });

  it('returns null for tampered, foreign, or empty input rather than throwing', () => {
    const box = encryptSecret('a-key-worth-guarding');
    const tampered = `${box.slice(0, -4)}AAAA`;

    expect(decryptSecret(tampered)).toBeNull();
    expect(decryptSecret('not-an-envelope')).toBeNull();
    expect(decryptSecret('')).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });

  it('refuses to encrypt an empty value', () => {
    expect(() => encryptSecret('')).toThrow();
  });
});
