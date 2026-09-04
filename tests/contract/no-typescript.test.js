import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
]);

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, found);
    else found.push(path.relative(ROOT, full));
  }
  return found;
}

/**
 * The stack is JavaScript only. This is a hard product constraint, so it is
 * asserted rather than left to review.
 */
describe('JavaScript-only constraint', () => {
  const files = walk(ROOT);

  it('contains no TypeScript source files', () => {
    const offenders = files.filter((f) => /\.(ts|tsx|mts|cts)$/.test(f));
    expect(offenders).toEqual([]);
  });

  it('contains no TypeScript project configuration', () => {
    const offenders = files.filter((f) => /(^|[\\/])tsconfig[^\\/]*\.json$/.test(f));
    expect(offenders).toEqual([]);
  });
});
