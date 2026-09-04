# StoryBook Studio

An AI storybook SaaS. Users describe a story, review a generated plan, design
consistent characters, generate illustrated pages, edit them, and export a
print-ready book.

**Stack:** MongoDB · Express · React · Node — JavaScript only, no TypeScript
(enforced by `tests/contract/no-typescript.test.js`).

---

## Getting started

```bash
npm install
npm run dev:memdb
```

Client runs on <http://127.0.0.1:5173>; the API is proxied at `/api/v1` from the
same origin, so no CORS setup and no `.env` are needed for local work.

`dev:memdb` starts a throwaway in-memory MongoDB, so there is nothing to install
and nothing to clean up — the data disappears when you stop it. Use `npm run dev`
with a real `MONGODB_URI` when you want persistence.

Without `GEMINI_API_KEY` and `KIE_API_KEY` the app runs but story planning and
illustration report that they are not configured. Object storage falls back to an
in-memory store when `STORAGE_BUCKET` is unset, so generated images work locally
without an S3 or R2 account.

A **replica set** is required in production: the credit ledger and job state
transitions use multi-document transactions (`withTransaction` degrades
gracefully on a standalone server so local development works).

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Client and server together (needs a MongoDB at `MONGODB_URI`) |
| `npm run dev:memdb` | Same, against a throwaway in-memory MongoDB — no database to install, data discarded on exit |
| `npm run dev:stub` | `dev:memdb` plus a local stand-in for Gemini and Kie.ai, so the whole pipeline runs without API keys. Development only — see `server/scripts/dev-ai-stub.js` |
| `npm run dev:stub:api` | The same, without the client — for when a Vite dev server is already running elsewhere |
| `npm run build` | Production client bundle |
| `npm test` | Server, client and contract suites |
| `npm run test:e2e` | Playwright (`npx playwright install chromium` first) |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run verify` | lint → build → test, in that order |

`verify` builds before testing on purpose: the secret-leak contract test
inspects `client/dist`, and skips itself if the bundle has not been built.

## Layout

```
client/   React + Vite + React Router + TanStack Query + Tailwind
server/   Express + Mongoose, layered route → validator → controller → service → provider
tests/    contract/ (cross-cutting guarantees) and e2e/ (Playwright)
references/  design-source-map.md — which design each screen is built from
```

Server layering is strict: controllers never call providers, providers never
touch Mongoose, and feature folders never re-implement provider logic.

## Secrets

Gemini, Kie.ai, storage and database credentials are **server-side only**. Vite
inlines every `VITE_*` value into the browser bundle, so no secret may ever use
that prefix. `tests/contract/no-secret-leak.test.js` asserts this against both
the source tree and the built bundle.

## Design sources

Screens are built from approved Figma and Canva designs, never from generic SaaS
assumptions. **`references/design-source-map.md` is the authority** for which
source owns which screen, and records open conflicts and gaps. Read it before
any UI work.

A screen is not accepted until its implementation has been screenshotted at the
approved viewport and compared against its mapped source.

## Configuration

Each workspace owns its own environment, so server secrets never sit beside the
client's public values:

| File | For | Notes |
|---|---|---|
| `server/.env.example` → `server/.env` | The API | Database, secrets, Gemini, Kie.ai, storage |
| `client/.env.example` → `client/.env` | The browser bundle | `VITE_*` only, and **every value is public** — Vite inlines them |

Most settings are commented out in the templates: those are the defaults the
server already uses. A blank or absent line means "use the default", so the only
lines to fill in are the ones that genuinely have no sensible one — the database
URI, the three secrets, and your provider keys.

## Deploying

The server is a plain Node process and the client is a static bundle. Nothing
here is tied to a particular host.

```bash
npm ci
npm run build          # client/dist
npm start              # server on PORT
```

**Before the first deploy**

| Step | Why |
|---|---|
| Copy `server/.env.example` to `server/.env` and fill it in | A contract test asserts the template lists every variable the server reads. Most lines are commented defaults — a blank line means "use the default" |
| Set `NODE_ENV=production` | Secrets stop being optional, and indexes are built explicitly rather than on the fly |
| Set `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET` | Generate separately: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Point `MONGODB_URI` at a **replica set** | Credit debits and job transitions run in transactions; a standalone server silently degrades to unwrapped writes |
| Set `STORAGE_BUCKET` and its keys | Without one the app falls back to an in-memory store that is lost on restart |
| Set `GEMINI_API_KEY` and `KIE_API_KEY` | Without them planning and illustration return a clear "not configured" error |
| Set `PUBLIC_URL` | Kie.ai callbacks are delivered to it; without it the app falls back to polling |
| Set `CORS_ORIGIN` to the client's origin | The refresh cookie is `SameSite` and scoped to `/api/v1/auth` |

**Health**

| Path | Meaning |
|---|---|
| `/api/v1/health` | The process is up. Answers before the database connects |
| `/api/v1/ready` | The database is connected. Use this one for load-balancer readiness |

The server answers `/health` immediately and reports `503` on `/ready` until Mongo
is reachable, so an orchestrator can tell "still starting" from "broken".

## Status

| Phase | State |
|---|---|
| 1 — Foundation and contracts | ✅ Complete |
| 2 — Design system and app shell | ✅ Complete (tokens, 16 primitives, Shell B) |
| 3 — Auth and account | ✅ Complete (email verification and mail delivery deferred) |
| 4 — Dashboard | ✅ Complete |
| 5 — Story Book Agent + Gemini | ✅ Complete (needs a `GEMINI_API_KEY` to run for real) |
| 6 — Review Your Story Plan | ✅ Complete |
| 7 — Character workflow | ✅ Complete |
| 8 — Kie.ai image generation | ✅ Complete (needs a `KIE_API_KEY` to run for real) |
| 9 — Book Editor | ✅ Complete |
| 10 — Preview, Export, My Books | ✅ Complete (PDF + PNG; EPUB not in scope) |
| 11 — Credits, notifications, settings, admin | ✅ Complete (no payment provider connected) |
| 12 — Security, performance, deployment, E2E | ✅ Complete |

The design system reference lives at `/design-system` in development only.
