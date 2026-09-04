import crypto from 'node:crypto';

/**
 * Key order must not change the hash, or the same request submitted twice would
 * look like two different ones and be charged twice.
 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();

  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

/**
 * A stable fingerprint of a generation request. Paired with the unique
 * (ownerId, requestHash) index on GenerationJob, this is what makes a repeated
 * submit return the existing job instead of paying for a second one.
 *
 * The prompt version and model are part of the hash on purpose: after a prompt
 * change the same words are a genuinely different request and should re-run.
 */
export function requestHash(parts) {
  return crypto.createHash('sha256').update(stableStringify(parts)).digest('hex');
}

export default requestHash;
