/**
 * `npm run dev:stub` — the in-memory database from `dev-memory-db.js`, with the
 * AI providers pointed at the local stub instead of the real ones.
 *
 * The env is set here rather than with `cross-env` so this needs no extra
 * dependency and behaves the same on Windows and POSIX. Only ever development:
 * pointing a real deployment at 127.0.0.1 would simply fail to connect.
 */
const STUB = `http://127.0.0.1:${process.env.AI_STUB_PORT ?? 5099}`;

process.env.GEMINI_BASE_URL = STUB;
process.env.KIE_BASE_URL = STUB;
// The providers refuse to call without a key; these are placeholders for a
// server that is not the real one.
process.env.GEMINI_API_KEY ||= 'dev-stub-key-not-a-real-credential';
process.env.KIE_API_KEY ||= 'dev-stub-key-not-a-real-credential';

await import('./dev-memory-db.js');
