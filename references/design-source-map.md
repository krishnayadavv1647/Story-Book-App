# StoryBook Studio — Design Source Map

**Status:** v0.4 — all approved sources located and inspected
**Owner:** Lead Engineering Agent
**Last verified:** 2026-09-01

This map is the single authority for which connected design a screen is built from.
No screen may be implemented before it has a row here with `Approval = APPROVED`
and a reachable source.

---

## 1. Connector status

| Connector | Account | Access | Usable |
|---|---|---|---|
| Figma MCP (`40dcbc9a…`) | krishna yadav / krishnayadavv1647@gmail.com | Team `team::1627294917418690961`, **View** seat, starter tier | Yes — file `eQzIIC5gfOmGE392HvA7aC` ("StoryBook Studio – Dashboard & Story Plan"). Contains **one page only**: `0:1` "01 Dashboard" |
| Canva MCP (`7fcb5869…`) | team `oBZGRRW1NgComAUhnEqSWo` | Full | Yes — 5 designs total in the account |
| `plugin:design:figma` (second Figma server) | — | Not authorized | No — needs OAuth in an interactive session |

> **Canva URL caution:** Canva `edit_url` / `view_url` values **rotate on every API call**
> (the same design returned 5 different URLs across 5 calls). Only the `design_id`
> and `page_id` are stable. Always address Canva designs by `design_id`.

---

## 2. Screen-level source map

### 2a. Canva-sourced screens (present and inspected)

| # | Screen | Connector | Design ID | Page / frame ID | Desktop size | Approval | Impl status |
|---|---|---|---|---|---|---|---|
| 1 | Character Creation / Selection | Canva | `DAHT3Z1D79U` — "StoryBook Studio - Character UI Clean Editable" | `PBRpN2xwn6XVfc3c` (p1) | 1792 × 896 | APPROVED | **Built — compared, §6** |
| 2 | Book Editor | Canva | `DAHT3a8GF_Q` — "StoryBook Studio - Book Editor Clean Editable" | `PBm68K1Hk8Rgfzk7` (p1) | 1792 × 896 | APPROVED | Built (Phase 9) |
| 3 | Book Preview & Export | Canva | `DAHT3Yy2mJA` — "StoryBook Studio - Preview Export Clean Editable" | `PBBpfGCXStNqYGcN` (p1) | 1792 × 896 | APPROVED | Built (Phase 10) |
| 4 | Story Book Agent | Canva | `DAHT3XT5CZg` — *(untitled)* | `PBKfJJp2trCh3m7M` (p1) | 1786 × 881 | APPROVED for its **centre column only** (C-1) | **Built — compared, §6** |

### 2b. Figma-sourced screens

| # | Screen | Connector | File key | Node | Desktop size | Approval | Impl status |
|---|---|---|---|---|---|---|---|
| 5 | Dashboard | Figma | `eQzIIC5gfOmGE392HvA7aC` | page `0:1` "01 Dashboard" → frame `1:2` "Dashboard / 1920x1080" | 1920 × 1080 | APPROVED | **Built — compared, §6** |
| 6 | Review Your Story Plan | Figma | `H98QB4Tdo6iH2EaXCerUlv` | frame `1:2` "Review Story Plan / 1920x1080" | 1920 × 1080 | APPROVED | **Built — compared, §6** |
| 8 | Book card (component, not a screen) | Figma | `hY9EcRsQJIcA35YpTPfxeE` — "StoryBook Studio — Realistic Book Cards" | page `0:1` "Book Cards" → frame `1:3` "Realistic Book Cards Preview", cards `1:4` and `1:9` | 222 × 277 per card | APPROVED — supplied by the owner 2026-09-03 | **Built — §7, "Book cards became books"** |

**Token source of record:** frame `1:2` of `H98QB4Tdo6iH2EaXCerUlv`. It is the newest, most complete
and most precisely measured screen, and its values are reproduced verbatim in
`client/src/styles/index.css`. Neither Figma file defines Figma variables
(`get_variable_defs` returns `{}`), so tokens were read from raw node values.

### 2c. Superseded / non-authoritative

| # | Screen | Connector | Design ID | Size | Status |
|---|---|---|---|---|---|
| 7 | Dashboard / "Explore" mockup | Canva | `DAHT3Vqa-yk` — "High-Quality UI Mockup for Story Book Studio" | 1920 × 1080 | **SUPERSEDED (proposed)** — oldest asset in the account; `design_type: unknown` (raster mockup, not "Clean Editable"); uses a different logo, a dark forest hero and a shell that contradicts §3. Dashboard is Figma-primary per spec. Do not build from this without explicit approval. |

### 2d. In product scope with NO design source in either connector

These have no Figma frame and no Canva design. They cannot be built to "approved design"
fidelity and must either receive a design or be explicitly authorised as
system-derived (built from the §3 design system by extension).

| Area | Screens |
|---|---|
| Generation | Book generation progress / partial-failure / retry surface |
| User areas | My Books, My Characters, Media Library, Exports, Subscription & Credits, Settings, Notifications |
| Admin | Overview, Users, Books, Characters, Generation jobs, Plans, Credit rules, Transactions, AI providers/models, Moderation, Support, Settings, API usage, Failed jobs, Audit history |
| System | 404 / 500, empty states, offline, permission-denied |

### 2e. System-derived screens (no source, designed from the token scale)

Built from the measured tokens and the Phase 2 primitives rather than copied from
a frame. They are **not** design-accurate and must not be described as such; if a
frame arrives later, the implementation yields to it.

| # | Screen | Route | Authorised | Status |
|---|---|---|---|---|
| 8 | Sign in | `/sign-in` | User, 2026-09-01 | Built |
| 9 | Sign up | `/sign-up` | User, 2026-09-01 | Built |
| 10 | Forgot password | `/forgot-password` | User, 2026-09-01 | Built |
| 11 | Reset password | `/reset-password` | User, 2026-09-01 | Built |

**Design rules followed**, so the screens read as the same product:

- One bordered card on `--sb-page`, no shadow — the system is border-led.
- Form on `--sb-surface` at the same 36 px control scale as every other form.
- Showcase panel in `--sb-ink` with lime accents, echoing the Dashboard hero.
  It is decorative, so below 1024 px it is dropped rather than stacked, which
  would push the form under the fold.
- Inter throughout at the established ramp: 25 px title, 14 px subtitle,
  13 px body, 12 px labels.
- Only the lime primary and the white secondary button variants; no new colours.

**Two additions beyond any drawn frame**, both recorded here because they change
an approved component or invent a control:

| Addition | Where | Why |
|---|---|---|
| Sign-out control | Sidebar account card | The frame draws avatar, name and credits only. An app with no way to sign out is not shippable. |
| Password hint ("At least 12 characters") | Sign up | States the rule before submission instead of after a rejection. |

---

## 3. Canonical app shell — **Shell B**, settled (see C-4)

Measured from Figma `H98QB4Tdo6iH2EaXCerUlv` frame `1:2`, cross-checked against
Dashboard `eQzIIC5gfOmGE392HvA7aC` frame `1:2`. Implemented in
`client/src/components/layout/` and defined once in `client/src/config/navigation.js`.

- **Sidebar** 274 px, white, 1 px right border, full height. Rows inset 10 px left
  and 16 px right (248 wide), icon at x20, label at x50, 37 px pitch.
  - Brand: book glyph + "StoryBook Studio", with a panel-collapse toggle.
  - Primary nav: Explore, Create Storybook, My Books, Character Design, Story Worlds,
    Book Preview, Published Books, Series.
  - "Story Agent" — a bordered 40 px **header only**; its four sub-items
    (Story Book Agent, Characters, Memory, Skills) sit below and outside that border.
  - Lower nav (38 px pitch): Projects, Team, Training, Bonuses.
  - Footer: "⌘ ALL FEATURES", "⚡ Upgrade", "Notifications", account card.
- **Topbar** 64 px: `STORY_BOOK_STUDIO` in `--sb-lime-text` + `<CONTEXT> ACTIVE` in muted grey.
- **Active nav state:** `--sb-lime-soft` fill, 7 px radius, semibold label.
- **Content column:** inset 28 px from the sidebar, 30 px from the right.
- **Sticky action bar** at page bottom: left status (`✓ saved`), centre step
  (`Step 2 of 3`), right secondary + lime primary buttons.
- **Palette:** ✅ **measured and implemented** (Phase 2.1). Exact values live in
  `client/src/styles/index.css` and are pinned by `tests/contract/design-tokens.test.js`,
  which fails if any token drifts from the Figma source.

  | Token | Value | Role |
  |---|---|---|
  | `--sb-page` | `#fbfbfb` | app background |
  | `--sb-surface` | `#ffffff` | cards, inputs, sidebar, topbar |
  | `--sb-border` | `#dbdee0` | every hairline |
  | `--sb-ink` | `#121214` | primary text |
  | `--sb-ink-muted` | `#61636b` | secondary text |
  | `--sb-lime` | `#b0ff00` | primary action fill, user avatar |
  | `--sb-lime-soft` | `#edffba` | selected nav row, info callout |
  | `--sb-lime-border` | `#a3d400` | info callout border |
  | `--sb-lime-text` | `#59bf00` | topbar wordmark |
  | `--sb-lime-mark` | `#6bd900` | sidebar logo glyph |
  | `--sb-tag` | `#f2f2f2` | tag chips |
  | `--sb-pill` | `#ebeded` | count pill |
  | `--sb-avatar` | `#e0e0e0` | character avatar placeholder |

  Typeface is **Inter** (400 / 600 / 700). Radii are 6 px (inputs, tags, row actions),
  7 px (icon buttons, active nav, footer buttons), 8 px (cards, 42 px buttons),
  10 px (cover art). Control heights: 26 / 30 / 34 / 36 / 40 / 42 px.
  No approved screen defines a danger, warning or success colour — those three
  tokens are system extensions and any UI using one is not design-accurate.

---

## 4. Open conflicts and blockers

### C-1 — Story Book Agent uses a foreign product shell (**materially conflicting**)

`DAHT3XT5CZg` renders the **"Cinema Studio"** application, not StoryBook Studio:

- Brand mark reads "Cinema Studio" (two logo layers overlapping / garbled).
- Sidebar is: Explore, Cinema Story Builder, Short Drama, Character Design, Universe,
  Cinema Player, Series, Series Studio, Story Agent → (Story Book Agent, Agents, Memory,
  Skills), Projects, Team, Training, **"Boruses"** [sic], All Features → (Hook Studio,
  Hook Generator).
- This contradicts the §3 shell used by all three approved screens.

Only the **centre column** is StoryBook-relevant and appears intentional:
greeting "✦ Good evening, Krishna"; composer card with the prompt
"WHAT STORY WOULD YOU LIKE TO CREATE?"; a `+` attach control; two dropdown pills
("Story Book Agent", "Book Settings"); a submit arrow; six suggestion chips
(Create a magical bedtime story / Write an adventure about friendship /
Make a personalized birthday book / Create an educational animal story /
Turn my idea into a 10-page book / Upload and illustrate my story); and a footer
meter row (`AI WRITER: ▓▓▓` · `IMAGE ENGINE: ▓▓▓`).

**Lead recommendation:** adopt the §3 shell for every screen, and take from
`DAHT3XT5CZg` **only the centre column**. Awaiting user confirmation — the rules
require stopping rather than silently mixing two shells.

### B-1 — Figma file key unknown — ✅ **RESOLVED 2026-09-01**

File key supplied: `eQzIIC5gfOmGE392HvA7aC`. Account holds a **View** seat — sufficient
for reading, not for writing back to Figma.

### C-2 — Dashboard exists in both tools — ✅ **RESOLVED**

Figma frame `1:2` is confirmed authoritative. The Canva asset `DAHT3Vqa-yk` is
superseded (§2c) and must not be built from.

### C-3 — Three different sidebars exist across the approved sources

| Shell | Source | Primary nav | Agent group | Lower nav | Extra |
|---|---|---|---|---|---|
| **A** *(canonical)* | Canva screens 1–3 | Home, Story Generator, My Books, Characters, Book Editor, Templates | AI Assistant → Story Book Agent, Chat History, Memory | Projects, Team, Tutorials | — |
| **B** | Figma Dashboard `1:2` | Explore, Create Storybook, My Books, Character Design, Story Worlds, Book Preview, Published Books, Series | Story Agent → Story Book Agent, Characters, Memory, Skills | Projects, Team, Training, Bonuses | "⌘ ALL FEATURES" group |
| **C** | Canva `DAHT3XT5CZg` | *Cinema Studio labels* — Explore, Cinema Story Builder, Short Drama, Character Design, Universe, Cinema Player, Series, Series Studio | Story Agent → Story Book Agent, Agents, Memory, Skills | Projects, Team, Training, "Boruses" | "ALL FEATURES" → Hook Studio, Hook Generator |

Shells B and C are structurally identical (8 + group-of-4 + 4 + All Features);
B is StoryBook-labelled, C is Cinema Studio-labelled.

**New evidence (2026-09-01, after the Story Plan file arrived):** Shell B is now
confirmed on **both** Figma screens — Dashboard `1:2` and Review Story Plan `1:2` —
with identical nav labels and ordering. The two differ only in sidebar width
(260 px vs 274 px; Story Plan is the newer file). Shell B is therefore not a
one-off: it is the consistent Figma shell, and it is StoryBook-branded, unlike
the Cinema Studio shell that was rejected.

This reopens the decision below — see C-4.

**User decision (2026-09-01):** *"apply the layout from the three designs you selected;
the 'Cinema Studio' layout shouldn't appear. Keep the rest of the design exactly as it
is — just change the layout, but keep the overall design identical."*

**Resolution applied:** **Shell A is the single `AppShell` for every screen.** Screen
content is reproduced exactly as designed in its own mapped source; only the shell is
normalised. This applies to the Figma Dashboard as well as to `DAHT3XT5CZg`, because
shipping shells A and B side by side is the outcome the decision rejects.

### C-4 — Which shell is canonical: A (Canva ×3) or B (Figma ×2)? **OPEN**

| | Shell A | Shell B |
|---|---|---|
| Screens | Character UI, Book Editor, Preview & Export | Dashboard, Review Story Plan |
| Tool | Canva | Figma |
| Canvas | 1792 × 896 | 1920 × 1080 |
| Sidebar | ~247 px | 260 px / 274 px |
| Primary nav | 6 items | 8 items |
| Agent group | AI Assistant → 3 | Story Agent → 4 |
| Lower nav | 3 items | 4 items + All Features |

Choosing A drops eight destinations that Shell B draws — Explore, Story Worlds,
Published Books, Series, Skills, Training, Bonuses, All Features — from two
approved screens. `StoryWorld` is a required model, so Story Worlds at minimum
needs a home. Choosing B means the three Canva screens render inside a wider
sidebar with more nav rows than they were drawn with.

Both shells are StoryBook-branded and internally coherent, so this is a product-IA
decision, not a fidelity defect.

**User decision (2026-09-01): Shell B — the Figma one.** It supersedes the earlier
Shell A instruction, which was given about the Cinema Studio screen before either
Figma screen had been seen.

**Applied:** `client/src/config/navigation.js` is the single definition of the
sidebar, measured from `H98QB4Tdo6iH2EaXCerUlv` frame `1:2`. The three Canva
screens (Character UI, Book Editor, Preview & Export) therefore render inside a
274 px Shell B sidebar rather than the ~247 px Shell A one they were drawn with.
Their *content* remains exactly as designed — only the shell is normalised.

Two shell details are **system-derived**, having no approved frame:
- the **collapsed** sidebar state (a collapse control is drawn, but no collapsed frame exists);
- nav rows whose routes are not built yet resolve to the 404 page until their phase lands.

### G-1 — "Review Your Story Plan" has no design — ✅ **RESOLVED 2026-09-01**

Supplied as a separate Figma file, `H98QB4Tdo6iH2EaXCerUlv` frame `1:2`. It covers
the editable book-information form (title, description, age group, language, genre,
art style, pages, moral), the page outline with an expanded first row (narration,
scene description, character/location tags) and collapsed rows, per-row edit /
duplicate / delete actions, Add Page, the Book Summary / Characters Detected /
Generation Estimate rail, and the autosave footer with Back and Continue.

Two scope items in the master spec are **not** in the frame and need a decision
before Phase 6 is accepted: **reorder** (no drag affordance is drawn) and an explicit
**tags editor** (tags render read-only). Everything else is covered.

---

## 5. Fidelity gate (applies to every screen before it is accepted)

1. Re-read the mapped source at its approved viewport.
2. Screenshot the implementation at the same viewport.
3. Diff hierarchy, sizing, spacing, typography, colour and every interaction state.
4. Record the comparison result in the row's Impl status.
5. Never claim pixel parity without step 2 having actually run.

---

## 6. Fidelity comparison log

### AppShell (Sidebar + Topbar) vs `H98QB4Tdo6iH2EaXCerUlv` frame `1:2` — 2026-09-01

Rendered at 1920 × 1080 and compared by measuring live element geometry, which is
stricter than eyeballing a screenshot.

| Property | Figma | Rendered | Δ |
|---|---|---|---|
| Sidebar width | 274 | 274 | 0 |
| Topbar x / w / h | 274 / 1646 / 64 | 274 / 1646 / 64 | 0 |
| Nav item x / width | 10 / 248 | 10 / 247 | 1 |
| Nav icon x | 20 | 20 | 0 |
| Nav label x | 50 | 50 | 0 |
| Primary nav label centres | 96.5 … 355.5 | 96 … 355 | ≤ 0.5 |
| Story Agent header | 10 / 372 / 248 × 40 | 10 / 374 / 247 × 40 | 2 |
| Agent sub-row x / width | 28 / 230 | 28 / 229 | 1 |
| Agent sub label centres | 432, 472, 506, 540 | 433, 469, 505, 541 | ≤ 3 |
| Lower nav label centres | 582.5 … 696.5 | 583 … 697 | ≤ 0.5 |
| Content column x | 302 | 302 | 0 |

**Defects found and fixed during this comparison**

1. The brand row and the whole nav below it sat 11–14 px high, because a fixed
   height carried `padding-top` — the padding shrank the content box instead of
   offsetting it. Changed to a margin.
2. The Story Agent group was implemented as one bordered card wrapping header and
   sub-items. The frame draws a bordered **header only**, with the sub-items
   below and outside the border. Corrected.
3. Lower nav used the primary 37 px pitch; the frame uses 38 px there.

**Accepted deviations**

| Item | Deviation | Reason |
|---|---|---|
| Brand wordmark | 3 px above the frame | The frame puts the wordmark 3 px below the collapse button's centre. Matching it would misalign the two; the button centre is kept as the rule. |
| Token set | Story Plan values used throughout | The two Figma frames disagree on four neutrals: border `#dbdee0`/`#dee0e3`, ink `#121214`/`#17171a`, ink-muted `#61636b`/`#6b6e75`, lime-soft `#edffba`/`#e8ffab`. Story Plan is the source of record; `tests/contract/design-tokens.test.js` asserts the Dashboard variants are *not* adopted, so the choice cannot drift silently. |
| Sidebar footer block | Bottom-pinned rather than in flow at y744 | The two approved Figma frames disagree on the trailing gap (86 px vs 60 px), so it is not a design rule. Pinning is the responsive-correct behaviour. |
| Collapsed sidebar | System-derived | A collapse control is drawn; no collapsed frame exists. |
| Nav icons | Lucide, chosen by meaning | The sources draw placeholder glyphs (▱, ♙, ⊕ …), not real icons. |

### Dashboard vs `eQzIIC5gfOmGE392HvA7aC` frame `1:2` — 2026-09-01

Rendered at 1920 × 1080 against a live API, measured from the DOM.

| Property | Figma | Rendered | Δ |
|---|---|---|---|
| Hero height / radius | 362 / 16 | 362 / 16 | 0 |
| Hero wordmark / subtitle | 48 / 17 px | 48 / 17 px | 0 |
| Hero CTA | 164 × 48, r8, 15 px | 164 × 48, r8, 15 px | 0 |
| Card gutter | 22 | 22 | 0 |
| Card radius | 10 | 10 | 0 |
| Card title / description | 14 / 12 px | 14 / 12 px | 0 |
| Tab label + lime underline | 14 px, 3 px | 14 px, 3 px | 0 |
| "Your Storybooks" heading | 22 px | 22 px | 0 |
| Content column x | 302 (shell rule) | 302 | 0 |
| Template card width | 238 | 244 | 6 |

**Defect found and fixed:** the hero CTA rendered 42 px instead of 48. `h-12`
passed through `className` did not override the size class, because
`tailwind-merge` does not recognise the project-specific `h-control-2xl` as a
height utility and so kept both. Fixed properly by adding a `2xl` button size to
the scale instead of overriding it at the call site — the same trap would have
caught every later screen.

**Accepted deviations**

| Item | Deviation | Reason |
|---|---|---|
| Card width | 244 vs 238 | The grid fills the content column; the frame leaves 42 px of slack on the right. A fixed 238 px card would leave a ragged gap at every other viewport. Gutter, radius and type are exact. |
| Hero inset | 302 vs 284 | The frame insets the hero 24 px from the sidebar but the card grid 48 px. One content column is used instead, at the shell's 28 px rule. |
| Hero artwork | **Superseded 2026-09-02** | The frame drew three flat blocks ("MAGICAL STORY", figure, lantern) standing in for illustration that did not exist. The owner supplied real artwork (`client/public/banner.png`), so the blocks were removed and the image fills the hero. A left-to-right scrim carries the wordmark, because the artwork's own light and dark move around under different crops. |
| Templates / Genre tab strip | **Removed 2026-09-02** | The frame placed a Templates/Genre tab strip between the hero and the book grid. It was filled by `templates.catalogue.js` — six invented books drawn as flat colour blocks with a Lucide glyph. On a real account they read as though they were the owner's books, and two of them ("Aarav and the Whispering Forest", "Little Moon Keeper") even shared titles with genuine ones. Removed at the owner's request, along with the `GET /books/templates` and `GET /books/genres` endpoints that served it. The owner's own library now occupies the position. Genre remains a real field on a book and is still chosen in the Story Agent — only the invented catalogue is gone. |
| Book cards | System-derived | The frame ends just below the "Your Storybooks" heading, so no book card, empty state, skeleton or error state is drawn. Built from the geometry measured off the frame's template cards (238 × 340 cover, 22 px gutter), which is all those cards are still used for. |


### Story Book Agent vs Canva `DAHT3XT5CZg` — 2026-09-01

Centre column only, per the C-1 decision; the surrounding Cinema Studio shell is
replaced by Shell B. Exact pixel parity is not meaningful across two different
canvas sizes (1786 × 881 vs 1920 × 1080), so composition, order and states were
compared rather than coordinates.

| Element | Drawn | Built |
|---|---|---|
| Greeting | "✦ Good evening, {name}", centred, amber sparkle | Same, time-of-day aware |
| Composer label | "WHAT STORY WOULD YOU LIKE TO CREATE?" | Same, uppercase 12px muted |
| Composer controls | attach `+`, agent pill, Book Settings pill, submit arrow | Same order and shapes |
| Suggestion starters | 6 chips, 2 columns × 3 rows | Same six, same order |
| Engine meters | "AI WRITER" / "IMAGE ENGINE" bars | Same, bound to real server status |

**Deviations, all recorded deliberately**

| Item | Deviation | Reason |
|---|---|---|
| Shell | Shell B, not the drawn Cinema Studio shell | User decision (C-1 / C-4). |
| Chip icons | Lucide, not emoji | The project rule is icon components, not glyphs. |
| Agent pill | Static, not a dropdown | It is drawn with a chevron, but only one agent exists. Reporting the active one is honest; a menu with a single entry is not. |
| Attach `+` | Present but disabled | Reference uploads need the media module (Phase 8). Drawn, so it is shown, but it cannot pretend to work. |
| Engine meters | Bound to `GET /story/engines` | Drawn as filled bars with no stated meaning. Wiring them to real configuration state makes them useful instead of decorative. |
| Token streaming | Not implemented | The plan is a schema-validated JSON document; a half-parsed one cannot be shown. Progress and cancel are implemented instead. Chat streaming remains open. |

### Age-group bands corrected — 2026-09-01

`AGE_GROUPS` was invented in Phase 1 as `0-3 / 3-5 / 5-8 / 8-12 / 12+`, which
cannot represent the **"6–9 years"** the Review Story Plan frame actually offers
(node `1:78`). Corrected to `0-3 / 3-5 / 6-9 / 9-12 / 12+` across the enum, the
Book and StoryWorld defaults, the plan schema and the client settings sheet.


### Review Your Story Plan vs `H98QB4Tdo6iH2EaXCerUlv` frame `1:2` — 2026-09-01

Measured at 1920 × 1080 against a live API, on a plan generated end to end
through the real pipeline (a stubbed provider endpoint returning a valid plan).

| Property | Figma | Rendered | Δ |
|---|---|---|---|
| Content column x | 302 | 302 | 0 |
| Column gutter | 30 | 30 | 0 |
| Page H1 | 25 px | 25 px | 0 |
| Input height | 36 | 36 | 0 |
| Narration / Scene field height | 68 | 68 | 0 |
| Body text | 13 px | 13 px | 0 |
| Footer bar height | 72 | 72 | 0 |
| Main column width | 1038 | 1028 | 10 |
| Right rail width | 520 | 515 | 5 |

**Defect found and fixed:** the narration and scene fields rendered 85 px against
the frame's 68 — the shared `Textarea` defaults to three rows. Fixed at the call
site with `rows={2}` rather than changing the primitive, which other screens
depend on.

**Accepted deviations**

| Item | Deviation | Reason |
|---|---|---|
| Column widths | 5–10 px narrow | A visible scrollbar takes ~15 px from the content column, and the card's own 16 px padding sets the inner field widths. Ratio, gutter and all control heights are exact. |
| Reorder | Drag handle added per row | The frame draws no drag affordance, but reorder is in the written scope and was authorised. Offered by pointer **and** arrow keys — a drag-only control is unusable without a mouse, and this list runs to sixty rows. |
| Tags | Chips are editable | The frame draws them read-only. They are the page's characters and its location, so "editable tags" is implemented as editing that real data rather than inventing a parallel free-text field the design never shows. |
| Generation estimate | Real figures | The frame prints "240 credits" for a 10-page book, which does not follow from any configured credit cost. The estimate is computed from `CREDITS_COST_*` instead, so the number the user sees is the number they will be charged. |
| Page count field | Raising it appends pages; lowering is refused | The frame shows a plain select. Silently deleting written pages to satisfy a number would destroy work with no undo. |


### Create Your Characters vs Canva `DAHT3Z1D79U` — 2026-09-01

Measured at 1920 × 1080 on a book generated end to end through the real pipeline.
The Canva canvas is 1792 wide with a ~247 px sidebar while the app renders Shell B
at 1920 with a 274 px one, so **proportions and control sizes** are compared, not
absolute coordinates.

| Property | Canva | Rendered | Δ |
|---|---|---|---|
| Column ratio (details : preview) | ~476 : 960 = 2.02 | 510 : 1028 = 2.02 | 0 |
| Content column x | shell rule | 302 | 0 |
| Page H1 | 25 px | 25 px | 0 |
| Input height | 36 | 36 | 0 |
| Mode tabs | 3 equal, full width | 3 equal, full width | 0 |
| Footer bar | 72 tall, status · step · actions | 72, same | 0 |
| Role selector | 3-way segmented, active lime | same | 0 |

**Defect found and fixed:** the two columns were built 50/50. The design is closer
to 1:2 — Character Details takes about a third, the preview and cast the rest.

**Accepted deviations**

| Item | Deviation | Reason |
|---|---|---|
| Upload Character / Generate with AI modes | Rendered, disabled | Both need the media and image modules (Phase 8). Drawn so the layout is right; disabled so nothing pretends to work. |
| Reference dropzone | Rendered, inert | Same reason. Says so in place of accepting a file. |
| Regenerate / Edit Details / Download Sheet | Rendered, disabled | Same reason. |
| Character preview poses | Empty slots labelled Front / Side / 3/4 View / Full Body | No illustration exists yet; the four-pose frame is reproduced without claiming images that are not there. |
| Lock look control | **Added** | The frame draws no lock, but identity lock is in the written scope and is what keeps a character consistent across pages. Placed in the Character Details header, and it disables exactly the fields that reach the image model. |
| Consistency prompt field | **Added** | Not drawn, but it is the text replayed into every illustration. Leaving it invisible would make the lock unexplainable. |
| "Select existing" picker | **Added** beside the Add Character tile | The design names the mode but draws no picker for it. |


### Phase 8 — image generation surfaces, 2026-09-01

No new screen. The Character screen's gated controls became live:

| Control | Was | Now |
|---|---|---|
| "Generate with AI" mode | Disabled | Enabled |
| Generate / Regenerate | Disabled | Live — starts a Kie.ai task |
| Character Preview front pose | Empty slot | Shows the generated image |
| Download Sheet | Disabled | Opens the stored image |
| Reference dropzone | Inert | Live — see the completion note below |
| "Upload Character" mode | Disabled | Live — see the completion note below |
| Edit Details | Disabled | **Still disabled** — belongs to the book editor |

### Navigation trimmed to what exists — 2026-09-02

**User decision.** Six rows were removed from the sidebar: **Story Worlds,
Series, Projects, Team, Training, Bonuses**.

All six are drawn in the approved Figma frames, so this is a deliberate
departure from the design. None of them has a screen, a data model, or a place
in the written scope, and they had been rendered as permanently inert rows. The
user asked for them to go rather than sit there greyed out indefinitely.

| Before | After |
|---|---|
| 8 primary rows, 2 of them inert | 6 primary rows, all of them live |
| A 4-row lower group, entirely inert | Removed |

`PRIMARY_NAV` now contains no item carrying `arrives`, and a test asserts it —
so a dead row cannot quietly return to the primary nav.

What remains not-yet-built: the Story Agent sub-items (Characters, Memory,
Skills) and ALL FEATURES. Those are still drawn, still inert, and still say which
phase they arrive in.

### Transactions were never actually executed — 2026-09-02

Gemini started working, and the very next request failed:

> `Cannot call create() with a session and multiple documents unless ordered: true is set`

Four multi-document writes inside `withTransaction` were missing `ordered: true`
— the whole cast and every page, in both `generateStoryPlan` and
`regeneratePlan`. So on a real cluster, **no story plan could be saved at all**.

It only appeared now because the database changed. `withTransaction` falls back
to calling straight through with **no session** when the server is standalone,
and the suite ran on a standalone in-memory MongoDB. No session meant no error —
the entire transactional path, the one guarding credits and whole-book writes,
had never once run as a transaction.

**Fix:** `ordered: true` on the four writes, plus
`story-generation/__tests__/transactions.test.js`, which runs against a real
single-node replica set (`MongoMemoryReplSet`) so a session is genuinely passed.
It asserts the cast and pages are all written, that a failed write leaves
nothing behind, and that the wallet and the ledger agree. Removing `ordered:
true` fails two of its tests; the rest of the suite still passes without it,
which is exactly the blind spot that let this ship.

### Gemini corrected against the live API — 2026-09-02

Story generation had **never worked against real Gemini**. It only ever ran
against a stub written to the same wrong assumptions, so the suite was green and
the feature was broken. Found the moment a real key was configured.

| Assumption | Reality | Effect |
|---|---|---|
| The reply is in `output_text` | There is no `output_text`. The reply is assembled from `steps[]`, where `thought` holds reasoning and `model_output` holds the answer | Every read returned `''`, so every plan failed as "the response was empty" |
| `response_format: { type: 'text', mime_type, schema }` requests structured output | `response_format` **is** the schema. `type` is the JSON-schema type | The shape was accepted and ignored, so the model answered however it liked — `logline` instead of `description`, no `characters` at all |

The published example at `ai.google.dev/api/interactions.md.txt` shows
`{ type: 'json_schema', json_schema: { name, schema } }`. The live API rejects
it outright: *"The value 'json_schema' is not supported for 'type' at
'response_format'."* The API's own error was taken as authoritative over the
document.

**Measured before and after**, same prompt, real key:

| | Before | After |
|---|---|---|
| Attempts | 3 (two self-corrections) | 1 |
| Latency | 31.2s | 11.8s |
| Page titles | missing | present |

Both failure modes were quiet — an ignored field and a missing one — which is
why the stub hid them. The dev stub and the test stubs now answer in the live
shape, and `gemini.client.test.js` pins both facts.

### Phases 11 and 12 — account surfaces, security, deployment, 2026-09-02

No approved frame covers any of these; all SYSTEM-DERIVED (§2d), built from the
measured tokens and the Phase 2 primitives.

| Screen | Route | What it actually does |
|---|---|---|
| Credits | `/billing` | Balance, the real price of every action, and the immutable ledger behind it |
| Notifications | `/notifications` | Rows written by the server when work finishes — a book illustrated, an export finished or failed |
| Settings | `/settings` | Name, preferences, and a password change that signs every other session out |
| Character Design | `/characters` | The account-wide character library |
| Admin | `/admin` | Counts, provider configuration and credit grants. Admin-only |

**Accepted deviations**

| Item | Deviation | Reason |
|---|---|---|
| "Upgrade" nav row | Renamed **Credits**, leads to the credits screen | No payment provider is connected. A row labelled Upgrade would promise a checkout that does not exist. |
| Buying credits | Absent, not mocked | A checkout button that cannot take money is worse than no button. The screen says so in as many words. |
| Admin | Not in the sidebar | The frames draw no admin row, and an operations screen is not customer navigation. Reachable at `/admin`; the server refuses every request from a non-admin. |
| Theme control | Present, only light built | The preference is stored and honoured by the API; the dark palette is not built, and the field says so. |

**Security work (Phase 12)**

| Finding | Fix |
|---|---|
| `POST /books/:id/export` was unthrottled | CPU-heavy rendering behind `exportLimiter` |
| `POST …/pages/:id/rewrite` was unthrottled | Model call behind `generationLimiter` |
| Admin search interpolated user input into a `RegExp` | Escaped, and asserted by a test that `.*` matches nothing |
| No cross-cutting guarantee that routers require a session | `tests/contract/api-surface.test.js` — 33 checks over every route file, aware of router mounting |
| `.env.example` drifted from `env.js` | A contract test asserts it lists every variable, and holds no real secret |

**Race found by the end-to-end test.** `POST /generation/books/:id/images` answered
`started: N` before the fan-out had marked any page queued. The client refetched
progress immediately, saw `inFlight: 0`, concluded nothing was running and
stopped polling — so a book generated and charged while the screen said
"Nothing has been illustrated yet" forever. Pages are now marked `queued` before
the response, and a page whose job fails to start is marked `failed` rather than
stranded in `queued`. Both are pinned by tests.

### Phase 10 — Preview & Export, My Books, 2026-09-02

Built from Canva `DAHT3Yy2mJA` (1792 × 896), page `PBBpfGCXStNqYGcN`, inside
Shell B. Route `/books/:bookId/preview`.

| Element | Frame | Built |
|---|---|---|
| Header | back link, title, subtitle, status pill, Share Preview, Export Book | Same |
| Columns | preview 1008 · export 442, 20px gap | Same ratio, `minmax(0, Nfr)` |
| View switcher | Book View / Single Page / Thumbnails | Same three |
| Spread | two pages side by side with chevrons | Same, through the editor's `PageRender` |
| Paging | Previous, −/%/+, Fit, Next, bleed toggle | Same |
| Export panel | Export / Publishing tabs, format cards, quality, page size, page options, branding, file summary | Same |
| Bottom bar | saved status · Final Step · Back to Editor / Export Book | Same |

**Accepted deviations**

| Item | Deviation | Reason |
|---|---|---|
| eBook (EPUB) format | Drawn, disabled, labelled "EPUB — not built yet" | PDF and PNG are the written scope. Offering EPUB would be a button that lies. |
| Images format | One tall PNG holding every page, labelled as such | An export has to arrive as a single downloadable file. Stacking says what it contains instead of hiding a zip dependency. |
| Watermark toggle | No "Pro" badge | There is no paid tier yet, so the toggle simply works. A Pro badge would advertise a plan that does not exist. |
| Page Size | Five real sizes from the renderer | The frame names one. The list is what the PDF engine can actually produce. |
| Share Preview | Rendered, disabled | Sharing needs public links — a later phase. |

**What it actually does**

| Action | Backing |
|---|---|
| Export PDF | `pdfkit`, drawn from stored page data — cover, pages, back cover, page numbers, watermark, crop marks |
| Export PNG | `@napi-rs/canvas`, same geometry module as the PDF so the two agree |
| Readiness | `GET /books/:id/export/options` reports the exact pages missing art or text, before anything is spent |
| Publish | `POST /books/:id/publish` — a real `published` status and timestamp, listed under Published Books |
| Cost | 1 credit, refunded on any failure; the same export asked twice returns the file already paid for, and a book edited since is a new request |

**Defect found by the tests.** `MediaAsset` stores its key at `storage.key`, not
`storageKey`. Reading the wrong path made `loadPages` return no image for every
page — exports succeeded, and silently contained no pictures. The test that
loads a page's bytes directly is what caught it.

**New screens: My Books and Published Books** — SYSTEM-DERIVED (§2d). The frames
draw both nav rows but neither screen. Built from the measured tokens, reusing
the Dashboard's card shape. Each card reports the book's state and links to the
step that state implies, so the screen answers "where did I leave off".

### Phase 9 — Book Editor, 2026-09-01

Built from Canva `DAHT3a8GF_Q` (1792 × 896), page `PBm68K1Hk8Rgfzk7`, inside the
canonical Shell B. Route `/books/:bookId/editor`.

**Measured against the frame**

| Element | Frame | Built |
|---|---|---|
| Header | back link, title + rename pencil, status pill, Preview / Share / Export | Same order and shapes |
| Columns | pages 287 · canvas 732 · inspector 428, 20px gaps | Same ratio, as `minmax(0, Nfr)` so it survives a narrower viewport |
| Canvas toolbar | undo, redo, zoom −/%/+, fit, grid — in a pill | Same, same order |
| Page actions | Rewrite Text · Regenerate Image · Magic Layout | Same three |
| Inspector | tabs Page / Text / Image, then Delete Page | Same |
| Bottom bar | saved status · "Page 1 of 10" · Previous / Next Page | Same |

**Accepted deviations**

| Item | Deviation | Reason |
|---|---|---|
| Shell | Shell B, not the drawn Canva shell | User decision (C-1 / C-4). |
| Inspector sections | The frame draws tabs *and* collapsible Illustration / Text & Typography sections holding the same controls. Built as tabs only: Page = layout/background/style, Text = Text & Typography, Image = Illustration. | The two are the same controls twice. One home per control. |
| Page reorder | Explicit up/down buttons under "Manage Pages", not drag handles | A keyboard user can reach it, and it cannot half-happen. The drawn grip is kept as the affordance. |
| Layout swatches | Six, not the four drawn | The model has supported six presets since Phase 1; drawing four would have hidden two that work. |
| Preview / Share / Export | Rendered, disabled, with a reason | They belong to Phases 10–11. Drawn so the header is right; disabled so nothing pretends to work. |
| Page Style | Named bundles that write real typography values | The frame names "Classic Storybook" without saying what it does. It now applies a font, size, leading and alignment. |

**What the screen actually does**

| Action | Backing |
|---|---|
| Edit title / text / scene prompt | `PATCH /books/:id/pages/:pageId`, debounced 700ms so typing does not wait on the network |
| Layout, background, typography | Same endpoint, written immediately. Nested patches flatten to dotted paths so a partial update stays partial |
| Undo / redo | A session history that records the values each patch overwrote, replayed through the same write path |
| Rewrite Text | `POST …/rewrite` — a real Gemini call, 1 credit, refunded on any failure. The previous wording is appended as a revision **before** the new text is written |
| Regenerate Image | The Phase 8 per-page job |
| Upload Image | `POST …/artwork`, which checks the asset belongs to the caller and clears its upload TTL |
| Magic Layout | Deterministic server-side rule from what the page holds; it reports *why* it chose what it chose |
| Character Consistency | `characterConsistency` per page; when off, the cast's locked look is left out of that page's prompt |
| Add / duplicate / delete / reorder | The existing transactional page endpoints |

**Layout defect found in the browser and fixed.** The three columns were
`287fr_732fr_428fr`, and `fr` tracks are min-content sized: below the 1792 frame
the inspector was pushed off screen and the pages rail overflowed its row.
`minmax(0, …)` on both axes, with the shell content column switched to a flex
column that does not scroll, is what makes each panel scroll inside itself.

### Navigation — unbuilt destinations no longer 404, 2026-09-01

**Defect found in use.** Shell B draws 19 destinations. Only three have screens
(`/`, `/create`, `/agent`), and every other row was rendered as a live link, so
16 of 19 sidebar clicks landed on the not-found page. The app read as broken.

| Change | Detail |
|---|---|
| `arrives` on each unbuilt nav item | Names the phase that builds it (`Phase 10` / `Phase 11`) |
| Unbuilt rows | Still drawn — the frames draw them — but rendered as inert, muted rows with a tooltip, not links |
| `/create` | Now a real route: creating a storybook **is** the agent conversation, so it redirects to `/agent` |
| `BUILT_NAV_PATHS` | New export; a route-coverage test asserts every one resolves, so a nav link can never silently start 404ing again |

The alternative — a "coming soon" placeholder screen per destination — was
rejected: it costs a click to learn the same thing, and scaffolds 16 screens
that do nothing. A row that is visibly not-yet-built says it at a glance.

Direct URL entry to an unbuilt path still reaches the 404, which is correct.

### Phase 8 completed — 2026-09-01

The three items left open above are now built and verified against a running
stack (registration → plan → cast → illustration → stored image).

| Item | State | Notes |
|---|---|---|
| Reference dropzone | **Live** | `POST /media/upload` (multipart). The MIME type is a hint only — the bytes are checked against PNG/JPEG/WebP magic numbers, so a shell script labelled `image/png` is refused `415`. Verified live. |
| "Upload Character" mode | **Live** | Uploads then attaches in one action; an upload the user never gets to use would just sit in storage until its TTL. |
| Four-pose sheet | **Live** | `POST /generation/characters/:id/sheet` starts front / side / three-quarter / full-body as four jobs, surfaced as the "Full sheet" action. Slots still show an image only when one exists. |
| Per-page book generation | **Live** | New system-derived screen, below. |

**Mode tabs — accepted deviation.** The frame draws three modes (Select
Existing / Upload Character / Generate with AI) as if each swapped the panel
beneath, but their controls belong to different panels: the picker is in Story
Characters, the dropzone and the generate actions are in Character Details.
Rather than leave two of three tabs inert now that all three work, selecting a
mode scrolls its control into view. The alternative — moving three unrelated
controls into one switching panel — would depart from the drawn layout much
further than this does.

**New screen: Illustrate Your Book** — SYSTEM-DERIVED (§2d). No approved frame
covers generation progress, so it is built from the measured tokens and the
Phase 2 primitives. Route `/books/:bookId/generate`.

The design goal is that **a partial failure reads as a partial failure**: every
page carries its own state, a failed page is retryable on its own, and the pages
that succeeded stay visible rather than hiding behind one error banner.

| Element | Treatment |
|---|---|
| Header | `PageHeader`, back to Characters, primary "Illustrate all pages" |
| Progress | Token bar + "N of M ready · K failed" |
| Page grid | 2 / 3 / 4 columns by breakpoint, 4:3 image slot per page |
| Page state | `StatusBadge` — Ready, Illustrating, Queued, Waiting, Failed |
| Failed page | Provider message in place, plus its own "Retry this page" |
| Not started | Callout saying so, and that charging is per page |
| Sticky bar | Status + Back + Continue to Book Editor |

**Two defects found by the tests and fixed**

| Defect | Effect | Fix |
|---|---|---|
| `inFlight` counted never-started pages | `isRunning` was true before anything ran, so the primary action was **permanently disabled on a fresh book** and the "nothing illustrated yet" callout never showed | `pending` and `inFlight` are now counted separately, server-side |
| Stale credit balance | The sidebar kept showing the balance from before a run — the one number the user is watching, wrong | `refreshSession()` after any credit-spending run; covered by a test that fails without it |

### Dark cinematic theme migration — 2026-09-02

The whole application moved from the light lime/white palette to a dark
cinematic one. This was a **colour migration only**: no layout, route, flow,
form field, copy or backend contract changed.

**Source of the palette.** A dark dashboard reference image supplied by the
owner, together with an explicit token list in the brief. The token list is
authoritative and is reproduced verbatim in `client/src/styles/index.css`. The
image is a mockup, not a connector asset, so it is recorded here rather than in
§2.

**What is superseded and what is not.** Colour from the two Figma frames
(`H98QB4Tdo6iH2EaXCerUlv` 1:2, `eQzIIC5gfOmGE392HvA7aC` 1:2) is superseded.
Every *measured dimension* from those frames still stands and is unchanged: the
type scale, radii, control heights, sidebar width (274px), topbar height (64px),
content inset (28px), card gutter (22px) and cover aspect. The earlier fidelity
comparisons in §6 therefore remain valid for geometry.

**Deliberate departures from the reference image.** Both were directed in
writing in the brief, and the brief was treated as authoritative over the image:

| Element | Reference image | Implemented | Why |
|---|---|---|---|
| Selected sidebar row | Teal gradient fill | **Gold gradient fill**, dark on-gold ink | The brief's §4 is explicit and repeated: remove the green/teal gradient from the active navigation button and use the same gold gradient as the Create Storybook CTA. |
| Active tab underline | Teal rule | **Gold rule** | The brief's §5 requires a gold underline or gold text on the active tab. |

**Elements in the image that were NOT re-added.** The image predates two
requested removals and shows them: the Templates/Genre tab strip with six
invented template cards, and the sidebar entries Story Worlds, Series, Projects,
Team, Training and Bonuses. The owner asked for all of these to be removed in
earlier sessions, and the brief's §7 forbids changing navigation structure, so
they stay removed. The image's "9999 credits" and "50 storybooks" are mockup
data.

**Semantic rules the theme enforces.**

| Role | Colour | Rule |
|---|---|---|
| The one main action on a screen | Gold gradient | Declared once as `.surface-gold` (and `.surface-gold-nav` for the sidebar row, same tokens, shallower shadow). A screen gets one, never a row. |
| Selection, focus, supporting state | Teal | Selected cards, chosen modes, active list rows, focus rings, hover borders. |
| Destructive | `--danger` red | Never restyled to gold. The fill is a tint and the text keeps full colour, because red text on a red wash fails contrast. |
| Success / warning / info | Own semantic colours | Each carries an icon as well as a colour, so meaning survives without hue. |

**Accessibility decisions worth recording.**

- The sidebar avatar uses `--teal-muted`, not `--teal-primary`. White on
  `--teal-primary` measures about 3.4:1, which a 12px bold initial cannot carry.
- Gold is only ever a *background*, with `--text-on-gold` (#221600) as its ink.
  A contract test fails the build if `text-gold` is ever placed on a
  `surface-gold` element.
- The global `:focus-visible` outline is teal and declared once, so every
  control agrees on one focus treatment.

**Tokens that cannot take an opacity modifier.** Unchanged rule, now enforced
across all of `client/src` rather than only `components/`: our tokens hold hex
and rgba values, not bare RGB channels, so `bg-teal-soft/40` compiles to nothing
and the element renders with no background at all. One live instance of this bug
existed on the Notifications page and was fixed during the migration. Any
translucent colour needs its own token.

**Guarded by** `tests/contract/design-tokens.test.js`, which asserts the palette
values, that the retired lime/white hexes appear nowhere, that every token class
used in source actually compiles to a rule in the built stylesheet, that the
gold gradient is written in exactly one place, and that no raw Tailwind palette
colour is reached for.

**Visual verification, 2026-09-02.** Performed against the *production build*
(`vite preview`), not the dev server — see the note below. Screens walked and
compared: Sign in (AuthLayout), Dashboard/Explore, Story Book Agent, Create Your
Characters, Book Editor, Preview & Export, Credits, Settings, Notifications,
404, and a dialog (Book settings). Measured in the page rather than eyeballed:
`body` background computes to `rgb(2, 9, 13)`; the selected sidebar row computes
to the gold gradient with `rgb(34, 22, 0)` ink at **7.96:1** contrast; body text
sits at **20.05:1**.

**A dev-server trap worth recording.** Vite does not hot-reload
`tailwind.config.js`. During verification the running dev server was still
serving `.text-ink { color: var(--sb-ink) }` from the old config while
`index.css` had already hot-reloaded the new variables — so every token class
pointed at a variable that no longer existed, the declarations were invalid, and
text fell back to the UA default. It *looked* plausible on a dark ground, which
is what makes it dangerous. **Restart the dev server after any change to
`tailwind.config.js`.** `client/vite.config.js` now carries a `preview` proxy so
the built app can be verified end-to-end against the real API.

### Context strip removed, gold banner edge, quieter rules — 2026-09-02

Three owner-directed changes after the theme migration landed.

**1. The topbar context strip is gone.** Both Figma frames draw a 64px bar across
the top of the content column reading `STORY_BOOK_STUDIO • <SCREEN> ACTIVE`. It
was identical on every screen, contained no control (`onTogglePanel` was never
passed by any caller), and restated a context that each screen's own `PageHeader`
already gives. Removed app-wide rather than on the Dashboard alone, because
leaving it on the other eighteen screens would read as a bug. `Topbar.jsx`, its
barrel export, the `--topbar-h` token, the `spacing.topbar` key and the `status`
prop on `AppShell` (passed by all nineteen pages) went with it. `shell.test.jsx`
now asserts the strip is **absent**, so it cannot drift back in. Reinstating it
means one element in `AppShell` plus the component.

**Deviation from the Figma frames**, recorded here because §6's AppShell and
Dashboard comparisons measured that bar as matching at 64px. Those measurements
stand; the element is simply no longer rendered.

**2. The Dashboard banner carries a gold edge.** `border border-gold-border`
(`#f3c13d`) — deliberately the same token as the Create Book button's border, so
the banner and the CTA inside it read as one lit object rather than a photograph
that stops at a hard edge.

**3. Default rules are much fainter.** `--border-default` 0.34 → **0.14** and
`--border-muted` 0.16 → **0.07**. At a third opacity, a teal hairline on a
near-black ground reads as a bright white outline around every card, which is
louder than the content it contains; cards already carry their own gradient and
drop shadow, so the border only needs to define an edge. `--border-strong` is
unchanged at 0.64 — it is the selected/hovered/focused affordance and has to be
seen. Verified in the page: card borders compute to
`rgba(21, 154, 151, 0.14)`, the hero edge to `rgb(243, 193, 61)`, and `main`
now begins at viewport top.

### Covers fill their card; Story Agent group removed — 2026-09-02

**Book covers run to the card's edges.** Both Figma frames inset the cover 18px
at the top and give it a 9px radius of its own inside a 10px card. On a dark
card that inset reads as a gap rather than a margin, and the two radii leave a
sliver of card ground at each corner. Removed at the owner's request: the card
now carries `overflow-hidden` and clips the cover with its own 10px radius, and
`CoverArt` has no radius of its own. `CardGridSkeleton` matches, so the grid does
not reflow when data lands. Measured after the change: the cover's offset from
the card on all three sides is exactly 1px — the border, and nothing else.

**The "Story Agent" group is gone from the sidebar.** Both frames draw it as a
bordered, collapsible card below the primary nav. Removed at the owner's request.

Nothing became unreachable. Its only built row was Story Book Agent at `/agent`,
and the other three (Characters, Memory, Skills) had no screen. **"Create
Storybook" now points at `/agent` directly rather than at the `/create`
redirect**, so that row lights up while you are on the agent screen — with the
group gone it is the only row that marks it, and a sidebar where the current
screen highlights nothing is worse than one row fewer. `/create` still resolves,
for any link that already used it.

Removed with it: `AGENT_GROUP` from the navigation config, the `AgentRow`
component, and the `agentGroupOpen` / `toggleAgentGroup` UI state, which had no
reader left. `shell.test.jsx` now asserts the group is **absent** and that the
agent is still reachable, so it cannot drift back in.

**Border tuning.** The owner has since tuned `--border-default` by hand
(currently `rgba(7, 48, 47, 0.63)`) and `--border-strong` was dropped to 0.26.
The palette tripwire in `tests/contract/design-tokens.test.js` caught each edit
and was re-synced deliberately — that is the test working, not noise. One
consequence needed fixing: with the rules turned right down, form fields drawn
on the same ground as their card had no visible edge at all. Inputs now sit on
`--surface-elevated`, so a field is found by its surface rather than its
outline — the correct treatment for a dark theme, and it holds at any border
opacity.

### The paper label on book cards — 2026-09-02

Book cards now carry a **white label** under the cover, with black title text —
requested by the owner, and applied to the Dashboard grid and to My Books
(which is also what `/preview` and `/published` render).

This is a real surface in the token layer, not a `bg-white` at the call site. A
book card is a physical object in this product — cover plus printed label — so
the label is the one light surface in a dark app, and anything placed on it has
to be legible against white:

| Token | Value | Why |
|---|---|---|
| `--paper` | `#ffffff` | the label ground |
| `--paper-ink` | `#121214` | title — 17.7:1 on white |
| `--paper-ink-muted` | `#5c6063` | meta — 6.4:1 on white. The app's own `--text-secondary` is about **2:1** there and cannot be read. |
| `--paper-line` | `rgba(18,18,20,0.12)` | a rule that shows on white |
| `--paper-hover` | `#f1f3f4` | hover ground for a control on the label |

**Three problems the first pass had, and the fix for each.**

1. **The labels did not match.** The grid stretches every card to the tallest
   one, but the label only took its natural height — so a one-line title left
   the card's dark ground showing below its label while a two-line title did
   not. The label is now `flex-1`. Measured after: every card's label sits 1px
   from the card's bottom edge, which is the border and nothing else.
2. **The meta line was unreadable** — `text-ink-muted` on white. Now
   `--paper-ink-muted`.
3. **Controls had nowhere to stand.** My Books cards carry two buttons and a
   status badge. A dark `secondary` button on a white label reads as a hole
   punched in it, so `Button` gained an `onPaper` variant, and the status badge
   moved onto the cover — which is where the Dashboard card already put it, so
   the two card types now agree.

**Deviation note.** Neither Figma frame draws a book card at all (the Dashboard
frame ends just below the "Your Storybooks" heading), so there is no measured
source to depart from here. The template cards the frames *do* draw are
dark-on-dark; this is a deliberate divergence from that treatment.

### "Book Preview" removed from the sidebar — 2026-09-02

Removed at the owner's request. It was a duplicate destination, not a screen:
previewing needs a book chosen first, so `/preview` only ever redirected to
`/books` — the same screen "My Books" opens. Two rows, one destination.

The `/preview` route still resolves, so any existing link keeps working, and
`/books/:bookId/preview` (the real per-book preview) is untouched. The primary
nav is now Explore, Create Storybook, My Books, Character Design, Published
Books. `shell.test.jsx` asserts that exact list, so the row cannot drift back.

Both Figma frames draw a Book Preview row, so this is a deviation from them —
the third in this navigation after the six unbuilt rows and the Story Agent
group.

### Book cards became books — 2026-09-03

Supplied source: Figma `hY9EcRsQJIcA35YpTPfxeE`, frame `1:3`. This is the first
approved design for a book card — §2b previously recorded that neither screen
drew one, which is why the card had been system-derived since Phase 2.

**What the frame draws.** A closed book seen slightly from the front, built from
four stacked rectangles rather than one flat cover, each tilted a fraction of a
degree so a row of them reads as a shelf:

| Layer | Node | Rect (of 222 × 277) | Fill |
|---|---|---|---|
| Back Cover Edge | `1:5` | 14, 2, 202 × 267, r7 | `linear-gradient(90deg, #FAF0D1 0%, #B8A685 45%, #F5E8C7 72%, #8A7357 100%)` |
| Page Block | `1:6` | 203, 6, 16 × 255, r4 | `#E5D6B2` |
| Cover Artwork | `1:7` | 4, 0, 202 × 267, r7 | `#142E2E`, 1px `rgba(255,255,255,0.12)` |
| Rounded Spine | `1:8` | 0, 0, 13 × 267, r6 | `linear-gradient(90deg, rgba(199,222,214,.72) 0%, rgba(36,71,71,.82) 26%, rgba(10,26,28,.76) 72%, rgba(173,199,191,.62) 100%)` |

Shadow `8px 12px 8px rgba(0,0,0,0.52)`; tilt `+0.8°` on `1:4`, `-0.7°` on `1:9`.

**Deviation: the tilt is not built.** Dropped at the owner's request after seeing
it in the grid. At card size the negative angle read as a crooked book rather
than a deliberate one, and a row whose books do not share a baseline looks
misaligned rather than casually stacked — the frame draws two cards, where the
effect works; a library draws twelve, where it does not. Every book hangs
straight. Everything else in the frame is built as measured.

Implemented in `client/src/components/books/BookCover.jsx` as percentages of the
222 × 277 card, so the book keeps its proportions at every column width. The two
gradients and the two flat fills are tokens (`--book-*`) and shared classes
(`.surface-book-*`) rather than call-site colours, on the same reasoning as
`.surface-gold`.

**The paper label is gone — this reverses the 2026-09-02 entry above.** Requested
by the owner. The title and subtitle now live *inside* the cover artwork: the
server draws covers from `COVER_BASE_PROMPT`
(`server/src/modules/image-generation/prompts.js`), which letters both lines into
the picture. Printing them again underneath would say everything twice, and the
white band has no place on a book anyway — a book has a cover, not a caption.

Three things had to hold for that to be safe:

1. **The title still reaches assistive technology, exactly once.** With a cover
   image, `CoverArt` puts the title in the image's `alt` — the title *is* the
   image's content. Without one, the fallback sets the same two lines in type.
   Never both, so a link is never named twice over.
2. **The page count and genre are not lost**, only unpainted: they stay in the
   accessibility tree as `sr-only` text.
3. **A book with no generated cover is still identifiable.** The old fallback was
   a flat block with a gold glyph, which under a caption band was fine and
   without one would have been an anonymous rectangle. It now sets the title and
   subtitle in type on the frame's own `#142E2E` ground.

**The fore edge is drawn as leaves, not a bar** — asked for after seeing the flat
cream strip the frame specifies (`1:6`, `#E5D6B2`). `.surface-book-pages` now
lays two repeating gradients over that fill, at 2.2px and 5.1px so the leaves
never fall into a readable rhythm, plus a shading gradient across the stack. Each
leaf is a *pair* of stops — a shadow in the gap and a lit face beside it —
because at the width this strip is actually drawn (about 17px on a 240px card) a
single dark hairline antialiases to a tint and disappears; the eye reads the
light/dark step instead. A deviation from the frame's flat fill, and the one
place the card adds material the frame does not draw.

**Published and failed carry no chip** — the owner's rule, held in
`client/src/components/books/bookStatus.js` so the two screens cannot drift
apart. Both are states the surrounding screen already answers for: Published
Books is entirely published books, and a failed book is reported page by page on
the Illustrate screen, which is also where the retry lives, and raises a
notification when it happens. A chip is the one thing allowed to sit over a
generated cover's own lettering, so it has to earn the space.

**My Books keeps its two actions.** They moved out of the label onto the page's
own dark ground, so `Button`'s `onPaper` variant is no longer used there and the
hard-coded `#dba51c` override it carried is gone.

**The status chip sits on the cover but outside its link.** A link is named by
what it contains, and folding the chip in would rename the link every time the
book changed state — "Little Moon Keeper" one minute, "Little Moon Keeper
Generating" the next. `BookCover` takes it as a `badge` prop and renders it as a
sibling of the link for that reason.

### "Character Design" removed from the sidebar — 2026-09-03

Removed at the owner's request. The primary nav is now Explore, Create Storybook,
My Books, Published Books; `shell.test.jsx` asserts that exact list, so the row
cannot drift back.

Both approved Figma frames draw this row, so this is a deviation from them — the
fourth in this navigation, after the six unbuilt rows, the Story Agent group and
Book Preview.

**Unlike those, this one is not a duplicate.** Book Preview was removed because
it only ever redirected to a screen another row already opened; the six unbuilt
rows had no screen at all. `/characters` is a real, unique screen — the
account-wide character library — and the sidebar was its only way in. The route
still resolves, so a bookmark keeps working, but nothing in the UI points at it
any more. Editing a character was always done inside a book
(`/books/:bookId/characters`), and that path is untouched, so no *task* became
impossible; only the account-wide list became unreachable. Worth a link from the
per-book Characters screen if it is ever wanted back.

### The Story Agent became a conversation — 2026-09-03

Asked for at the owner's request: "es page ka interface ek dum Claude jaisa", and
a bug — a paragraph longer than two lines scrolled out of sight *while it was
being typed*, so you could not read back your own draft.

**The bug first, because it is the reason the rest was asked for.** The composer's
textarea was `rows={2}` with `resize-none`: a fixed two-line box that scrolled
internally from the third line on. It now measures its own content and grows —
`MIN_HEIGHT` 46px, `MAX_HEIGHT` 320px (about fifteen lines), scrolling only past
that, because beyond it the composer would start pushing the conversation off the
screen. Measured from `height: auto` each time, since `scrollHeight` reports the
element's stretched height rather than its content's once a height is set.

**Two states, where the design draws one.** Canva `DAHT3XT5CZg` draws only the
empty screen — greeting, composer, six starters, engine meters — with a
transcript implicitly growing beneath a greeting that never leaves. That works
for one exchange and not for six: the box you are typing in slides further down
the page with every reply. So:

| | Empty | In conversation |
|---|---|---|
| Greeting | shown | gone |
| Starters | six pills | gone (already true before) |
| Engine meters | shown | gone |
| Transcript | — | takes the height, scrolls, follows to the bottom |
| Composer | in the centred column | docked below the transcript |

`AppShell` already scrolls only its content column, so the conversation state
passes it `overflow-hidden` and owns the height itself — the transcript scrolls
inside, which is what lets the composer stay put.

**Other changes to match:** the drawn label above the input is now `sr-only` (the
placeholder says the same thing, and a composer that captions itself reads as a
form field); the input is 15px with relaxed leading rather than 13px; the shell
takes a 16px radius — a new `2xl` step in the radius scale, larger than anything
the approved frames draw, because this is the one screen that is a conversation
rather than a form; every control in the row is a pill; the six starters are
pills that wrap rather than a two-column grid of full-width cards; and the box
lights its border on `focus-within`, since the textarea has no border of its own.

**Messages** follow the same convention: what you said is set apart in a bubble
on the right, what the agent said is plain prose at full width. Two coloured
bubbles facing each other made the agent's reply look like a notification rather
than an answer.

### One prompt in, a finished book out — 2026-09-03

Asked for at the owner's request, in their words: giving a prompt used to hand
back a *plan*, and then the author had to walk through plan review, character
design and "illustrate" as three more screens of buttons — "woh chize users ke
liye bahut complex ho jaayegi".

**What runs now.** Sending an idea creates the plan, then draws the cast, then
every page, then the cover, and lands on one screen that watches all of it. The
shape of the book is not asked for again: it is already in Book Settings, behind
the composer's own pill.

**The one question.** How the cast should look — designed from the story, or
drawn from photographs the author uploads. It is asked because it is the only
thing neither the idea nor Book Settings can answer, and because a photograph is
the difference between a story about a child and a story about *their* child.
Photographs land on the lead: the cast does not exist until the plan does, so
there is no cast list to assign them to, and the lead is who an author uploading
a photo means. `CharacterLookModal` states that on the option itself.

**Nothing was removed.** Plan review, Characters, the editor and the preview are
all still built, still routed and still linked; they are simply no longer the
only way through. A run that stalls or a stage that fails is recoverable from the
generation screen, which keeps every manual control it had.

**Why it is driven by settlement rather than a waiting loop.** Each stage starts
the next as its last image lands — a character settling checks whether any of the
cast is still being drawn, the last page settling starts the cover. There is no
sleeping loop to get wrong, and a run picks itself back up from a provider
callback that arrives after a restart. `Book.autopilot.stage` is claimed with a
conditional update, so two images settling in the same instant cannot both start
the next stage.

**Two things that stay true of the manual path.** Every stage still screens its
prompt, still charges, and still refunds on failure — a run is the same services
in the same order, with nobody pressing the buttons. And the whole run is priced
before it starts: it is refused outright if the wallet cannot cover cast, pages
and cover together, rather than stopping halfway with a cast and no book.

**The generation screen reports stages, not just pages.** A run draws the cast
before it touches a page and the cover after the last one, so page counters alone
are either all zero or all full for most of a run — the screen would look frozen
twice. `bookGenerationProgress` now carries the stage and the cast, and the
screen's poll keeps running between stages on `autopilot.isRunning`.

**Known gap.** The question does not quote a price. The character count is not
known until the plan exists, so any figure shown before it would be a guess; the
run instead refuses with the exact number when the wallet is short.

### "Share Preview" became "Open Preview" — 2026-09-03

Canva `DAHT3Yy2mJA` draws a **Share Preview** button in the Preview & Export
header. It was built disabled, captioned "Sharing arrives with Phase 11", and the
publishing tab said the same thing in prose. Asked for at the owner's request, in
their words: "share preview se matlab yeh hai ki uske click karte hi book browser
pe show ho jaaye."

So it opens the book, in the browser. It does **not** share a link with anyone:
`/books/:bookId/read` is behind `RequireAuth` like every other book route, and
the publishing tab still says publishing does not put the book on the internet.
A shareable link is still unbuilt.

**Renamed, because a button named Share that does not share is worse than a
button that does not match the frame.** It is "Open Preview" with an external-link
icon, and it opens a new tab — reading the book is something you do beside the
export settings, not instead of them.

**New screen: the reader** (`BookReaderPage`) — SYSTEM-DERIVED (§2d). No frame
draws it. The Preview screen draws a preview *pane*: a small sheet beside an
export panel, sized for checking pages while you work. This is the other thing
"preview" means — the finished book filling the browser with nothing else on it.

| Decision | Why |
|---|---|
| Outside `AppShell` | The sidebar is the app. A book being read is not the app, and 274px of navigation beside it would only make the book smaller. |
| Pages through `PageRender` | The same renderer the editor and both exporters use, so what is read is what gets printed. |
| Cover shown as artwork, not through `PageRender` | It is a leaf of the book, not a page of it — no narration, no layout. Books with no generated cover simply open on page one. |
| Same query key as the Preview screen | Arriving from it is instant rather than a second fetch of a book already in hand. |
| Arrow keys and Escape | A book is read with the arrow keys, and anything filling the screen closes with Escape. |

### The preview fills its pane — 2026-09-03

Two faults in one, both reported by the owner: the book sat small in the middle
of a mostly empty panel, and every page had a scrollbar down its own text.

**One cause.** `Sheet` laid each page out at whatever width it was given —
`300px x zoom`, hard-coded, about 255px in an 1100px column — while the type
inside stayed at reading size. So the page was both too small for the pane and
too small for its own text, and the overflowing text got a scrollbar.

**The fix is to stop resizing the layout.** `PageSheet` now draws every page at
one fixed paper size (640 x 800) and CSS-scales it to whatever box it is in. Type,
margins and the image split keep their proportions at any size, so a thumbnail is
the same page as a full-size spread rather than the same page with enormous text
crammed into it — and nothing overflows, because the layout never changes size.

**And the spread is measured against the room it has.** A `ResizeObserver` on the
stage gives the pane's real width and height; a page is the largest it can be
without cropping, whichever limit bites first. That also fixes what the zoom
numbers mean: **100% is the book filling the pane**, "Fit" is 100%, below it the
book is smaller and above it the pane pans. The stage only scrolls above 100% —
at or below, a scrollbar could only be a rounding error showing through.

**`PageRender` clips rather than scrolls.** Both exporters crop text that does not
fit the paper, so a preview that scrolled instead was promising room the page
does not have. The editor canvas and the reader inherit this, which is correct:
the Text tab is where long narration is written and seen in full.

The reader uses the same `PageSheet`, so a page reads identically in the pane, in
the browser and in the PDF.

### The turn is `react-pageflip` now — 2026-09-03

Replaced the hand-rolled CSS turn at the owner's request, with their settings.
The CSS version rotated a flat plane about the gutter; paper does not fold flat,
and the library simulates the sheet properly — it bends, catches a shadow along
the fold, and follows the pointer if you drag it.

Two things it replaced outright, and both are better for it:

- **`usePortrait`** does what the `SPREAD_FROM` media query did, but from the room
  the book actually has rather than from the viewport. `useMediaQuery` is now
  unused by the reader.
- **`showCover`** does what the hand-built cover leaf did: the cover is a hard
  board shown alone, so the first opening is page one facing its own words.

The hand-rolled `turn-forward` / `turn-back` keyframes and `.surface-book-gutter`
went with it — the library draws the fold shadow itself (`drawShadow`,
`maxShadowOpacity`).

**Two things had to be fixed on top of the library, both found by measuring.**

1. `size="stretch"` fits the book to its container's *width* and derives the
   height from the ratio, so a wide container made a book taller than the screen
   — the cover ran off the bottom. `fitWidth` works back from the height instead,
   and the same calculation decides the shape: if two leaves fit side by side at
   full height the book is opened, otherwise it is held at one.
2. Orientation is read off that calculation rather than from `getOrientation()`.
   Asked on mount, the library answers `portrait` from a book it has not measured
   yet and then never corrects it, because nothing has *changed* — so a spread
   reported itself as a single leaf and the page counter said "illustration" with
   the words plainly beside it.

A leaf that is not showing is hidden by the library, which keeps it out of the
accessibility tree — correct, and it means tests must reach those leaves by text
or alt rather than by role.

### The reader became a book — 2026-09-03

Asked for at the owner's request: two pages side by side on a computer, one on a
phone, the cover first, and the pages actually turning.

SYSTEM-DERIVED (§2d) — no frame draws a reader. `BookStage` holds the three
things that make it a book rather than a slideshow of pictures:

| | |
|---|---|
| **the spread** | Two leaves belonging to one object, joined by a gutter the light falls into. `.surface-book-gutter` is on both leaves and deepest where they meet; without it a spread is two cards side by side. Only above 900px, where a page in a spread is still wide enough to read — below that a book is held open at one page, and that is what a phone gets. |
| **the cover** | Closed, first, drawn by the same `BookCover` the library cards draw. Opening a book on the shelf and opening it here are the same object. |
| **the turn** | A leaf rotating about the gutter: `preserve-3d`, a face on each side with `backface-visibility: hidden`, perspective on the stage. Its back face is the page it is turning to, because that is what the back of a page is. A crossfade would say "another picture"; this says "another page". |

**The turn is driven by the index changing, not by the click that changed it.**
The arrows, the dots, the keyboard and the book's own edges therefore all turn a
page the same way, rather than only the one path that happened to call the
animation. `prefers-reduced-motion` skips it and cuts straight to the opening.

**`min-w-0` on the stage is load-bearing**, and was a real bug found by measuring
rather than by looking. A page is laid out at paper size — 640px — and only
scaled visually, so a flex item's automatic minimum size is its content's 640px
*per leaf*. Without `min-w-0` that floors the spread at 1280px whatever the
window, overriding the aspect ratio: measured 1280px in a 947px pane.

**Still outstanding from the same request**, and not attempted here: a text
editor in the Book Editor, per-page layout and font pickers, and the typography
and spacing of generated pages. The last of those was to be taken from a
reference book the owner shared as a Gemini link, which does not open — it
redirects to the Gemini home page and asks to sign in — so there is nothing to
analyse yet.

### The printed page, measured from the reference book — 2026-09-03

The owner supplied *The Key in the Pocket* (10 landscape spreads, 792 x 612pt)
and asked for its layout, cover and typography. Two pages of it are kept in
`references/book-reference/` so these numbers can be checked against their source.

**What it does, measured rather than eyeballed** (PyMuPDF render at 1400px, then
pixel analysis; one leaf is 700 x 1082):

| | Reference | Built as |
|---|---|---|
| Leaf proportion | 700 x 1082 → 0.647 | `PAPER` 648 x 1000, `LEAF_ASPECT` |
| Paper | `#F5F5F5` | `--paper-page` |
| Body ink | `#000000` | `--page-ink` |
| Running head | `#6E7176`, small caps, ~0.18em tracked, top outer corner | `--page-head` |
| Folio | `#C8C8C9`, bottom outer corner | `--page-folio` |
| Body size | ~30px on a 700px leaf → 4.3% of leaf width | `PAGE_METRICS.bodySize` |
| Leading | 47px pitch ÷ 30px → 1.55 | `PAGE_METRICS.leading` |
| Side margins | 20% each, measure ~60% of the leaf | `PAGE_METRICS.sideMargin` |
| Text block | centred vertically (top 25%, bottom 75%) | `justify-center` |
| Illustration | full bleed on the facing leaf, no margin at all | the `spread` preset |
| Face | transitional serif | EB Garamond |

**The layout is the fix, not the font.** The old page was one 4:5 rectangle
holding a picture in the top half and a paragraph floated in the middle of the
bottom half — so a short page left a third of the paper empty ("khaali jagah
bahut jyada"), a long one overflowed and grew a scrollbar, and no two pages
agreed ("layout bigad raha hai"). In the reference, **one page is an opening**:
the picture has a whole leaf and the words have a whole leaf, and neither has to
make room for the other. `spread` is now the default preset, in the model and in
the validators; the six single-leaf presets remain and are still offered.

**A book now has an author.** `Book.author`, set from the account name when the
plan is persisted and editable in Book Information. It is the reference's running
head, printed in the outer margin of every leaf that carries words.

**Four faces are loaded, and the editor picks between them** — EB Garamond
(default), Lora, Nunito and Baloo 2, one from each family a picture book might
want. A face named in the picker but not loaded would silently fall back to
Georgia and the control would appear to do nothing, so the list and the
`<link>` in `index.html` are kept in step.

**Not done, and not attempted:** the PDF and PNG exporters still render the old
portrait single-page layout. They need to be moved to landscape spreads before an
exported file looks like what the reader now shows.

**A note on the cover.** The reference does *not* letter its title into the
artwork: it prints a translucent band across the lower fifth of the cover and
typesets the title and byline into it, in the same serif. That is more reliable
than asking an image model to spell — which is what this product currently does,
at the owner's earlier explicit request. Left as it is; worth revisiting.

### The same page on both sides — 2026-09-03

Reported by the owner from a preview: the book opened on two copies of one page.

`buildLeaves` gave **every** page two leaves — an illustration leaf and a words
leaf — because that is what the `spread` layout needs. But a page on any of the
six single-leaf presets puts the picture and the words on one leaf, and
`PageRender` ignores `part` for those. Asked for "the art half" and then "the
text half" of such a page, it drew the whole page both times.

It showed up on the owner's own books rather than on a new one, because `spread`
became the default for *new* pages; theirs were written earlier and are still on
`image-top`.

**How many leaves a page needs is its layout's decision**, so that is where the
count is made now: two for `spread`, one for everything else. The reader's dots
are read off the leaves for the same reason — they used to assume two per page.

**And a way out of the old layout.** A book written before `spread` existed is
still page-by-page on the old one, and switching ten pages by hand is not a fix.
The inspector's layout section now carries *"Use this layout and type on every
page"*, which writes the current page's preset and typography across the book —
one page at a time, so a page that fails leaves the rest applied.

### The credit system is gone — 2026-09-03

Removed in full at the owner's request, along with the sidebar's "ALL FEATURES"
row. Nothing in the product is charged for any more.

**Deleted outright:** `CreditWallet` and `CreditTransaction`, the whole
`modules/credits/` module and its routes, `CreditsPage` and the `/billing`
route, the admin credit-grant endpoint and its control, the signup welcome
grant, `ApiError.insufficientCredits`, every `CREDITS_*` environment variable,
`CREDIT_TX_TYPES`, the `credits_low` / `credits_granted` notification types, and
the `cost.credits` / `cost.creditsRefunded` fields on both job models.

**Rewritten:** every generation path — story plan, plan regeneration, page
rewrite, character image, page image, book cover, autopilot and export — lost its
debit, its refund and its affordability check. Three of those refunds were doing
real work in the failure paths, so what remains had to keep the *other* half of
each: a failed job is still marked failed, a discarded plan is still discarded, a
retried page is still retryable. Only the money went.

**The client** lost the balance in the sidebar, the Credits screen, the wallet
hook, the "Export uses 1 credit" line, the estimate's price row, the welcome-credit
copy on the auth screens, and the `INSUFFICIENT_CREDITS` branch in all six hooks
that had one. `refreshSession` stayed — it is how a rename reaches the sidebar —
but the calls that existed only to refresh a balance are gone.

**What was deliberately kept:** `providerCredits` and `creditsConsumed` on the
Kie provider, and its "account is out of credit" error. Those are the image
provider's billing, not ours.

`Plan`, `Subscription` and `AIProviderConfig` are unused scaffolding; their
credit fields were removed but the models themselves are still registered.

**"ALL FEATURES"** went with it for a different reason: it never had a route, only
an `arrives` marker, so it was a label for a screen that was never built.

### A page no longer leaves a third of itself blank — 2026-09-03

Reported from a preview: pages on `image-top` had the illustration in the top
half and a short paragraph in the bottom half, leaving a large empty band under
the text that "negative impact de rha hai".

**Two causes, one visible.**

1. **The picture was pinned to half the page** whether the words needed the other
   half or not. It now takes whatever the words do not: the text block is sized
   to its content (`shrink-0`, capped at 58% so a very long page cannot squeeze
   the picture to a strip) and the illustration is `flex-1` on a 42% floor. A
   one-line page now gets a picture filling about three quarters of the leaf,
   which is what a picture book looks like.
2. **`justify-center` on the text was doing nothing.** The box was only as tall
   as its own text, so centring it centred it against nothing and the words sat
   jammed under the picture with all the slack pooled below. It has `h-full` now.

The `spread` preset was never affected — the words have their own leaf there and
are centred on it, which is the reference book's own arrangement.

**And the pages are asked to carry more.** The planner was never told how long a
page should be, so it wrote what it liked. `CRAFT_RULES` now gives a per-age word
range — 15-35 for 0-3 up to 120-200 for 12+ — with the reason stated: a single
line under a full-page illustration reads as an unfinished page. They are targets
rather than quotas, because a deliberate one-line beat is a real device; what the
rule is against is *every* page being thin.

### The type is sized to the page — 2026-09-03

Growing the illustration was not the answer the owner wanted: "yaa toh us text ko
aesa dikhao jisse woh page me bhara bhara lage". So the words fill the page
instead.

`fittedSize` sets the type to the amount there is to read. A character at size
`S` takes about `0.5·S` across and `leading·S` down, so `chars · 0.775 · S² ≈
area` and `S` falls out of it; `FILL` (0.78) leaves the page air rather than
packing it to the trim. At a 648px leaf that gives roughly:

| Page | Set at |
|---|---|
| one line (28 chars) | 64px — the cap, a statement page |
| short (94 chars) | 51px |
| ordinary (300 chars) | 32px, near the reference's own 30 |
| long (700+ chars) | 28px, the floor |

Two bounds matter as much as the formula. The **floor is the book's own size**:
a page that says a great deal is still set in the book's face at the book's
size, because shrinking it to fit would make one page unreadable next to the
others. The **cap is 2.3×**: past that a paragraph stops being a paragraph and
becomes a poster.

Deliberately arithmetic rather than measured. This renderer draws the editor, the
preview, the reader and both exporters, and a size that came from measuring a
browser would not survive the trip into a PDF.

An explicit `typography.fontSize` is the author's decision and is left alone —
the fitting only applies where nobody has said otherwise.

The single-leaf presets also got a stable share of the page back (46-58%, with
the picture taking the rest) so that every page of a book has the same rhythm
however much it has to say. `fitted-size.test.js` pins the properties rather than
today's numbers.

### Deleting a book — 2026-09-03

Added at the owner's request. `DELETE /books/:bookId`, and a trash control on each
My Books card behind a confirmation.

**What goes with the book:** its pages, and the generation and export jobs that
made them — a job is a record of work on one book and means nothing without it.

**What does not: the cast.** Characters are account-wide and reusable across
books, so deleting a book must not delete the people in it. A character made for
this book and used nowhere else is left in the library, which is the recoverable
mistake; deleting one another book still draws would not be.

**Artwork is marked deleted rather than purged.** `MediaAsset` already has a
`deleted` status and a `deletedAt`, and the storage drivers store bytes but expose
no remove — so the honest thing is a row saying the asset is gone rather than one
still pointing at a file nobody can reach. Reaping the bytes needs a driver-level
delete, which does not exist yet.

**The dialog names what is lost.** "Are you sure?" asks about nothing; this one
says how many pages go, that it cannot be undone, and that the characters stay.
The control is icon-only and last in the row, because deleting a book is not one
of the two things anyone came to that screen to do.

Ownership is `loadBook`'s job, as everywhere else — the route is guarded the same
way `PATCH` is, so this cannot become a way to delete somebody else's book.

### Delete icon reads red, and the editor opens on Text — 2026-09-03

Two small things at the owner's request.

**The delete icon is red at rest.** `IconButton`'s `danger` tone was `text-ink`
until hover; a delete control should look dangerous before the pointer reaches
it, so it is `text-danger` now. Used in exactly two places, both real deletes
(My Books card, the design-system reference).

**The editor inspector opens on the Text tab, not Page.** The font picker and the
page-text editor were already there — a `<Select>` of the four book faces and a
textarea over `narration`, both wired through `typography.fontFamily` and
`toDottedPaths` so a font change merges rather than replacing the rest — but they
sat behind the Page tab, so an author looking to edit words or change the font
found the AI "Rewrite" button first and assumed that was all there was. Text is
the default tab now, the textarea is taller, and the canvas button is named
"Rewrite with AI" so the plain editor is clearly the other, primary path. Nothing
new was built; what existed was surfaced.

### The editor canvas is the shape of the page now — 2026-09-03

Reported: in the editor the illustration was cut — the standing character lost
its head and feet.

The canvas box was hard-coded to **620 x 460**, a landscape rectangle that is no
page shape at all. A single leaf is portrait (648 x 1000); a spread is two of
them (1296 x 1000). Forcing a portrait leaf into a landscape box turned the
image band into a thin strip, and `object-cover` cropped a 4:3 illustration hard
top and bottom — exactly the head and boots.

`PageCanvas` now sizes the box from the page's own preset — `SPREAD_RATIO` for a
spread, `SINGLE_RATIO` otherwise — off a base height scaled by the zoom, and
passes the real leaf width to `PageRender` so the type and margins scale to the
canvas as they do everywhere else. The page in the editor is now the same shape,
and the same crop, as the reader and the export.
