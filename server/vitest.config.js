import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.js'],
    // mongodb-memory-server needs room to download/boot a mongod on first run.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Every test file boots its own mongod. Letting all of them start at once
    // has crashed the instance on Windows ("Instance closed unexpectedly"), so
    // cap the pool — still parallel, but with a survivable number of servers.
    poolOptions: { forks: { minForks: 1, maxForks: 4 } },
    env: {
      NODE_ENV: 'test',
      // Fixed, obviously-fake secrets so the suite can sign tokens. Production
      // requires real ones — see the `secret()` guard in src/config/env.js.
      JWT_ACCESS_SECRET: 'test-access-secret-not-for-production-use-0001',
      JWT_REFRESH_SECRET: 'test-refresh-secret-not-for-production-use-002',
      COOKIE_SECRET: 'test-cookie-secret-000',
      BCRYPT_ROUNDS: '4',
      // The whole suite shares one client IP, so the production auth limit of 10
      // would throttle the tests themselves. The limiter is covered on its own
      // terms in src/middleware/__tests__/rateLimit.test.js.
      RATE_LIMIT_AUTH_MAX: '100',
      RATE_LIMIT_GENERATION_MAX: '200',
      RATE_LIMIT_CHAT_MAX: '200',
      RATE_LIMIT_EXPORT_MAX: '200',
      RATE_LIMIT_UPLOAD_MAX: '200',
      // A fake key so the provider attempts a call; `fetch` is stubbed per test.
      GEMINI_API_KEY: 'test-gemini-key',
      // One initial attempt plus one correction, so the retry path is exercised
      // without three round trips per test.
      GEMINI_MAX_RETRIES: '1',
      KIE_API_KEY: 'test-kie-key',
      KIE_CALLBACK_SECRET: 'test-kie-callback-secret',
      // Polling is driven explicitly in tests so timing is deterministic; the
      // inline scheduler is a thin setTimeout wrapper around pollOnce.
      QUEUE_DRIVER: 'bullmq',
      STORAGE_DRIVER: 'memory',
    },
  },
});
