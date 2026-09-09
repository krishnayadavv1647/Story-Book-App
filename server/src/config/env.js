import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where the environment is read from.
 *
 * `server/.env` is the file to use, and `server/.env.example` is its template —
 * each workspace owns its own environment, so server secrets never sit next to
 * the client's public `VITE_*` values. A `.env` at the repository root is still
 * read as a fallback, for hosts that mount a single file there. Server-local
 * first: dotenv never overwrites a value already set, so the closer file wins
 * and a real environment variable beats both.
 *
 * This used to resolve to the root only. With no root file present, every
 * setting silently fell back to its default and nothing said so, which is a
 * miserable thing to debug. `ENV_FILES_LOADED` is reported at startup.
 */
const CANDIDATES = [
  path.resolve(here, '../../.env'), // server/.env
  path.resolve(here, '../../../.env'), // repository root
];

/**
 * The test suite supplies its own environment and must not read anybody's local
 * file: a developer's `.env` would otherwise decide whether the tests pass, and
 * a machine with a different model or cost configured would fail for reasons
 * that have nothing to do with the code.
 */
export const ENV_FILES_LOADED =
  process.env.NODE_ENV === 'test' ? [] : CANDIDATES.filter((file) => existsSync(file));

for (const file of ENV_FILES_LOADED) dotenv.config({ path: file });

/** Coerce "true"/"false"/"1"/"0" into a real boolean. */
const bool = (fallback) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : v === 'true' || v === '1'));

/**
 * A string setting with a default.
 *
 * The point is the empty case: `KIE_BASE_URL=` in a .env file arrives as `''`,
 * and `z.string().default(x)` only fills in for `undefined` — so a blank line
 * silently replaced the default with an empty string and broke the setting.
 * Leaving a line blank now means exactly what it looks like: use the default.
 */
const str = (fallback) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? fallback : v.trim()));

const int = (fallback) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : Number(v)))
    .pipe(z.number().int());

const csv = (fallback) =>
  z
    .string()
    .optional()
    .transform((v) =>
      (v === undefined || v === '' ? fallback : v)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const isProd = NODE_ENV === 'production';

/**
 * Secrets are required in production and optional in development/test so the
 * suite can boot without a populated .env. Never log a parsed value.
 */
// Zod re-validates a `.default()` through the inner schema, so the permissive
// branch has to accept the empty string explicitly — `.min(n).optional()
// .default('')` would reject its own default.
const secret = (min = 32) =>
  isProd
    ? z.string().min(min)
    : z
        .union([z.literal(''), z.string().min(min)])
        .optional()
        .default('');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(5000),
  SERVER_PUBLIC_URL: z.string().url().default('http://localhost:5000'),
  CLIENT_ORIGIN: csv('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/storybook_studio'),
  MONGODB_DB_NAME: str('storybook_studio'),

  JWT_ACCESS_SECRET: secret(),
  JWT_REFRESH_SECRET: secret(),
  JWT_ACCESS_TTL: str('15m'),
  JWT_REFRESH_TTL: str('30d'),
  COOKIE_SECRET: secret(16),
  COOKIE_DOMAIN: str('localhost'),
  COOKIE_SECURE: bool(isProd),
  // How the refresh-session cookie is scoped across sites. `lax` is right when
  // the client and API share a site (local dev via the Vite proxy, or a
  // same-domain deploy). Set `none` when the frontend is on a DIFFERENT origin
  // from the API — otherwise the browser refuses to send the cookie on the
  // SPA's cross-site `/auth/refresh` call and the session never sticks. `none`
  // forces Secure (browsers require it), so it needs HTTPS on both ends.
  COOKIE_SAMESITE: z.enum(['lax', 'none', 'strict']).default('lax'),
  BCRYPT_ROUNDS: int(12),

  /**
   * Credits — what generation costs and what a new account opens with.
   *
   * Every account starts on CREDITS_SIGNUP_GRANT and pays the prices below out
   * of it. They are settings rather than constants so pricing can be changed
   * for a deploy without a code change; existing balances are untouched by a
   * change here, and history keeps the price that was actually charged.
   *
   * A worked example at the defaults: a 12-page book costs 10 for the plan,
   * 5 × 14 for its pages and two covers, and 5 per character designed — about
   * 90 credits, so an opening balance covers roughly five books.
   */
  CREDITS_SIGNUP_GRANT: int(500),
  CREDITS_STORY_PLAN: int(10),
  CREDITS_IMAGE: int(5),
  CREDITS_CHARACTER: int(5),
  CREDITS_CHAT: int(1),

  // Sign in with Google — server-side Authorization Code flow. All three live
  // here, on the server, and never in the client:
  //   · GOOGLE_CLIENT_ID     — the OAuth client id (public).
  //   · GOOGLE_CLIENT_SECRET — the client secret (guarded; see SERVER_ONLY…).
  //   · GOOGLE_REDIRECT_URI  — where Google returns the user. Blank falls back
  //     to `${SERVER_PUBLIC_URL}/api/v1/auth/google/callback`, which is what to
  //     register under the credential's "Authorized redirect URIs" in Google.
  // Google sign-in is enabled only when the id AND the secret are both set.
  GOOGLE_CLIENT_ID: str(''),
  GOOGLE_CLIENT_SECRET: str(''),
  GOOGLE_REDIRECT_URI: str(''),

  // Transactional email, through Resend. Optional: with either the key or the
  // sender missing the server sends no mail at all — in development the
  // password-reset link is written to the log instead, exactly as before.
  //   · RESEND_API_KEY  — the API key (guarded; see SERVER_ONLY…).
  //   · MAIL_FROM       — the From header, e.g. `StoryBook Studio
  //     <no-reply@yourdomain.com>`. Resend refuses to send from a domain that
  //     has not been verified in the account, so this has no useful default.
  //   · MAIL_REPLY_TO   — optional Reply-To, when the From is a no-reply box.
  RESEND_API_KEY: str(''),
  MAIL_FROM: str(''),
  MAIL_REPLY_TO: str(''),
  MAIL_TIMEOUT_MS: int(15_000),

  RATE_LIMIT_WINDOW_MS: int(60_000),
  RATE_LIMIT_AUTH_MAX: int(10),
  RATE_LIMIT_CHAT_MAX: int(30),
  RATE_LIMIT_GENERATION_MAX: int(20),
  RATE_LIMIT_UPLOAD_MAX: int(30),
  RATE_LIMIT_EXPORT_MAX: int(10),
  RATE_LIMIT_CALLBACK_MAX: int(240),
  RATE_LIMIT_DEFAULT_MAX: int(300),

  GEMINI_API_KEY: str(''),
  GEMINI_BASE_URL: z.string().url().default('https://generativelanguage.googleapis.com'),
  GEMINI_INTERACTIONS_PATH: str('/v1beta/interactions'),
  GEMINI_MODEL: str('gemini-2.5-flash'),
  GEMINI_THINKING_LEVEL: z.enum(['minimal', 'low', 'medium', 'high']).default('low'),
  GEMINI_TIMEOUT_MS: int(60_000),
  GEMINI_MAX_RETRIES: int(2),
  GEMINI_TEMPERATURE: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? 0.8 : Number(v))),
  // A whole book plan (metadata + cast + every page) comes back in one JSON
  // response, so richer per-page narration needs real headroom or the JSON is
  // truncated and fails to parse. This is a ceiling billed by actual usage, so
  // raising it costs nothing until the output genuinely needs the room.
  GEMINI_MAX_OUTPUT_TOKENS: int(32768),

  KIE_API_KEY: str(''),
  KIE_BASE_URL: str('https://api.kie.ai'),
  KIE_API_VERSION: str(''),
  KIE_IMAGE_MODEL: str('nano-banana-pro'),
  KIE_CREATE_PATH: str('/api/v1/jobs/createTask'),
  KIE_STATUS_PATH: str('/api/v1/jobs/recordInfo'),
  KIE_CALLBACK_URL: str(''),
  KIE_CALLBACK_SECRET: str(''),
  KIE_TIMEOUT_MS: int(60_000),
  // Transient 5xx / 429 / timeout retries per request. Only failures where the
  // provider clearly did not accept the work are retried, so no duplicate task
  // can be created.
  // The provider refuses a longer prompt outright: "The text length cannot
  // exceed the maximum limit". Measured at 1000 for z-image.
  KIE_MAX_PROMPT_CHARS: int(1000),
  KIE_MAX_RETRIES: int(2),
  KIE_RETRY_BASE_MS: int(700),
  KIE_MAX_POLL_ATTEMPTS: int(60),
  KIE_POLL_INTERVAL_MS: int(3000),

  STORAGE_DRIVER: z.enum(['s3', 'local', 'memory']).default('s3'),
  // Where the `local` driver keeps its bytes. Development only.
  STORAGE_LOCAL_DIR: str(''),
  STORAGE_ENDPOINT: str(''),
  STORAGE_REGION: str('auto'),
  STORAGE_BUCKET: str(''),
  STORAGE_ACCESS_KEY_ID: str(''),
  STORAGE_SECRET_ACCESS_KEY: str(''),
  STORAGE_FORCE_PATH_STYLE: bool(true),
  STORAGE_PUBLIC_BASE_URL: str(''),
  STORAGE_SIGNED_URL_TTL_S: int(900),
  UPLOAD_MAX_BYTES: int(10_485_760),

  QUEUE_DRIVER: z.enum(['inline', 'bullmq']).default('inline'),
  REDIS_URL: str(''),
  QUEUE_CONCURRENCY: int(5),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Print variable NAMES and reasons only — never the offending values.
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  console.error(`Invalid environment configuration:\n${problems.join('\n')}`);
  throw new Error('Invalid environment configuration');
}

export const env = Object.freeze(parsed.data);
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * Names of variables that must never reach the browser bundle. Used by the
 * secret-leak contract test.
 */
export const SERVER_ONLY_SECRET_KEYS = Object.freeze([
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'COOKIE_SECRET',
  'MONGODB_URI',
  'GEMINI_API_KEY',
  'KIE_API_KEY',
  'KIE_CALLBACK_SECRET',
  'GOOGLE_CLIENT_SECRET',
  'RESEND_API_KEY',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
  'REDIS_URL',
]);

export default env;
