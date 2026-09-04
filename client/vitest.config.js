import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    // Rendering a whole route through jsdom is slow, and the suite runs many
    // files at once. The 5s default was failing real, passing tests purely on
    // CPU contention; capping the pool and allowing headroom fixes the flake
    // without loosening a single assertion.
    testTimeout: 15_000,
    poolOptions: { forks: { minForks: 1, maxForks: 4 } },
  },
});
