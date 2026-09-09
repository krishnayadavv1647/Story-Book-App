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
illustration report that they are not configured — they are the server's keys,
and users pay for generation in credits (see below). Object storage falls back to an
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

Gemini, Kie.ai, Resend, storage and database credentials are **server-side
only**. Vite
inlines every `VITE_*` value into the browser bundle, so no secret may ever use
that prefix. `tests/contract/no-secret-leak.test.js` asserts this against both
the source tree and the built bundle.

## Credits

Generation runs on the **server's** provider keys, and users pay for it in
credits rather than bringing keys of their own. Every account opens on
`CREDITS_SIGNUP_GRANT` (500) and is charged before the provider is called —
about 90 credits for a 12-page book at the default prices, so an opening balance
covers roughly five.

| Rule | Why |
|---|---|
| Spend first, refund on failure | A user pays for work they receive. Every failure path — a provider error, a rejected image, a plan discarded by the safety review, a cancelled job — gives the credits back |
| Spending is a conditional update | `credits: { $gte: amount }` in the query, not a read-then-write, so two requests arriving together cannot both take the last credit |
| Every movement leaves a ledger row | `User.credits` is the running total; `CreditLedger` is why it is that number. An account's rows sum to its balance |
| Refunds are idempotent | A provider callback and a poll can settle the same failed job at once; the ledger's unique `idempotencyKey` means only one refund lands |

Prices live in `server/src/modules/credits/pricing.js`, sourced from the
`CREDITS_*` environment settings. There is no billing provider: credits are
handed out by an admin, either directly or by putting the account on a plan.

## Signing in with a code, and embedding in another app

**No account is usable until its address is proved.** Registering creates the
account and emails a code; no session comes back until that code is typed. An
account that predates the rule meets it once, on its next password sign-in — the
password is accepted, a code goes out, and the reply is `EMAIL_NOT_VERIFIED`
rather than a rejection. Sign in with Google is exempt: Google already proved
the address.

The same two public endpoints let a reader sign in with a code instead of a
password — and an address nobody has used before gets an account, so they are
the sign-up path as well. That is what lets another app (a bonus-app bundle,
say) register somebody from its own screens without holding a secret of ours.

```
POST /api/v1/auth/otp/request   { email, name? }  -> always the same 200
POST /api/v1/auth/otp/verify    { email, code }   -> { accessToken, user } + refresh cookie
```

From the partner app's browser:

```js
const API = 'https://your-api.example.com/api/v1';

// 1. The reader types their address. An account is created if it is new.
await fetch(`${API}/auth/otp/request`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ email, name }),
});

// 2. They type the 6-digit code that arrives. This returns a session.
const res = await fetch(`${API}/auth/otp/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ email, code }),
});
```

Three settings make that work across origins:

| Setting | Why |
|---|---|
| `CLIENT_ORIGIN` includes the partner's origin | Otherwise CORS refuses the request |
| `COOKIE_SAMESITE=none` (and HTTPS on both ends) | The refresh cookie is cross-site here. With it set, opening StoryBook Studio afterwards finds the session already there — which is what makes the reader land signed in |
| `credentials: 'include'` on every call | The browser sends and stores the refresh cookie only when asked to |

`SIGNUP_PLAN_KEY` names the plan every brand-new account is put on, whichever
way it signed up, which is how a welcome or bundled-app bonus is delivered: the
plan's credits land the moment the account exists. `scripts/create-signup-plan.js`
creates one. Set it and `CREDITS_SIGNUP_GRANT` should usually be 0, or an account
opens with both.

**Know what this trades away.** The endpoints take no API key, by choice — the
partner app needs no server of its own. So anyone who can reach them can enter
an address they control and collect whatever `SIGNUP_PLAN_KEY` grants. The
auth rate limit, the per-address resend cooldown and the attempt cap on each
code hold back abuse, not entitlement. Leave `SIGNUP_PLAN_KEY` blank and the
endpoints are an ordinary passwordless sign-in with nothing to farm.

The code itself is stored hashed, expires in `OTP_CODE_TTL_MINUTES`, and is
burned after `OTP_MAX_ATTEMPTS` wrong guesses — six digits is a million
combinations, which is walkable inside ten minutes without that cap. Every reply
to `/otp/request` is identical whether or not the address is registered, so the
endpoint cannot be used to find out who has an account.

## Admin

`/admin`, open to an account with the `admin` role and deliberately absent from
the sidebar. The **first** admin has to be made from outside the app — the only
screen that can grant the role is behind the role itself:

```bash
node server/scripts/make-admin.js you@example.com
```

Four tabs: **Overview** (counts, provider and storage status), **Accounts**,
**Plans** and **Audit**.

| Action | Notes |
|---|---|
| Adjust credits | Signed: add or take away, straight onto the ledger |
| Assign a plan | Grants the plan's `creditsGranted` and opens a subscription; the previous one is closed first, so at most one is ever live |
| Suspend / reactivate | Suspending revokes every session immediately, rather than waiting for the access token to expire |
| Promote / demote | Changes the `admin` role |
| Create and price plans | Name, price, credits granted, limits, features |

Two guards worth knowing. An admin **cannot change their own role or status** —
the last admin demoting themselves would be unrecoverable from inside the app.
And a plan an account is on is **deactivated rather than deleted**, so that
account's subscription still resolves to something.

Plans are drafted invisibly: `visibleToUsers` is off by default and is a
separate switch from `isActive`. Readers see only active, visible plans, on
their Credits screen. `priceCents` is a label — there is no checkout — and the
`limits` are recorded but not yet enforced anywhere.

Every one of these actions writes an `AuditLog` row, which is what the Audit tab
reads.

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
| `server/.env.example` → `server/.env` | The API | Database, secrets, Gemini, Kie.ai, Resend, storage |
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
| On an EXISTING database, run `node server/scripts/backfill-credits.js` | Accounts created before credits existed have no `credits` field, and spending is a conditional update that cannot match a missing one — without this they can sign in but never generate |
| Set `RESEND_API_KEY` and `MAIL_FROM` | The password-reset link is emailed through Resend. Without them nothing is sent, and a user who forgets their password has no way back in. `MAIL_FROM` must use a domain verified in the Resend account |
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
