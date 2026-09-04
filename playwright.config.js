import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      // The approved desktop designs are 1792x896 and 1920x1080; the smoke run
      // uses the smaller of the two so it matches the Canva screens.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1792, height: 896 } },
    },
  ],

  webServer: {
    command: 'npm run dev:client',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
