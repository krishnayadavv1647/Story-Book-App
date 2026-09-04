import { defineConfig } from 'vitest/config';

/**
 * Root-level contract tests. These assert cross-cutting guarantees that no
 * single workspace owns — the JavaScript-only rule and the secret boundary
 * between server and browser bundle.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/contract/**/*.test.js'],
    testTimeout: 30_000,
  },
});
