# Design Parity Pass — Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Inline execution is
> REQUIRED (not subagent-driven): the audit loop depends on session-level MCP tools (Chrome,
> DesignSync) that subagents cannot access.

**Goal:** Make every page/state of the app pixel-indistinguishable from `Atlas MVP.dc.html` at
the same viewport (EN + HE, incl. hover states), with design-only density modules built on
typed stub data — proven by a founder-facing side-by-side comparison sheet.

**Architecture:** Fix global foundations first (font stack + type scale from the design's own
CSS bundle, confirmed against the rendered page), then run a per-page audit loop: A/B
screenshot at identical viewport → checklist every difference → fix (transplant design markup
verbatim if approximation fails twice) → re-shoot until indistinguishable → HE mirror + hover
pass. Density modules are built inside their page's loop behind `lib/<area>/*-stub.ts`
interfaces (same pattern as `lib/workspace/data.ts`).

**Tech Stack:** Next.js 14 App Router, Tailwind, Chrome MCP (screenshots/probes), DesignSync
MCP (design file + bundle), node:test.

**Spec:** `docs/superpowers/specs/2026-07-06-design-parity-pass-design.md`

## Global Constraints

- Branch `feat/design-parity` in worktree `C:\Users\Sagi\Desktop\Atlas-frontend`, dev port 3001.
- Design ground truth precedence: rendered `Atlas MVP.dc.html` computed styles > `_ds_bundle.css`
  values > eyeballing. The bundle mixes iterations (old orange accent #C04A00) — NEVER copy a
  color from the bundle without confirming on the rendered page. Locked palette from M1 stands
  (LIVE #CB4B2E, shell #F5F3EE, rail #0A0A0A, call dark #16150F).
- Design file frozen for the pass: re-sync once in Task 1, record date; do not re-sync mid-pass.
- Every visual claim needs an A/B screenshot pair at viewport 1920×950 (both tabs, same zoom).
- HE mirror + hover states verified per page before that page's task closes — not at the end.
- Existing behaviors must not regress: karaoke sync, quotes, folders, chat streaming,
  live sessionId reset invariant (liveTiming.test.ts), offline fallback no-reset.
- Stage explicit paths only (`git add <paths>`), never `-A`/`.`.
- Shared-surface law: APPEND to `C:/Users/Sagi/Desktop/Atlas/agent-memory/cross-cutting.md`
  BEFORE landing the tailwind type-scale/font change (it retunes every text node app-wide).
- All temp/probe output goes to the scratchpad dir, not the repo.
- Servers for the pass: app `npm run dev -- -p 3001`; design
  `npx -y http-server "design-import" -p 8399` (URL-encode the space:
  `http://localhost:8399/Atlas%20MVP.dc.html`).

---

### Task 1: Freeze ground truth + probe the real foundations

**Files:**
- Modify: `design-import/Atlas MVP.dc.html` (re-synced copy; gitignored — not committed)
- Create: `design-import/reference/ds-bundle.css` (bundle snapshot; gitignored — reference only)
- Create: `docs/superpowers/plans/2026-07-06-parity-audit.md` (audit doc: probe results + state
  matrix + per-page checklists live here; committed)

**Interfaces:**
- Produces: `parity-audit.md` section "Probed foundations" with the confirmed values every later
  task copies from (font stacks, sizes, tracking per node type). Later tasks reference it as
  AUDIT.md.

- [ ] **Step 1: Re-sync the design file** — DesignSync `get_file` project
  `a041c61d-6ab7-4c5c-bbb6-2033636e877c` path `Atlas MVP.dc.html`; harness persists big results
  to a file — extract `.content` via node (NOT through context) and overwrite
  `design-import/Atlas MVP.dc.html`. Keep previous as `.prev2`. Record sync date+line count in
  AUDIT.md. Same for `_ds/atlas-design-system-77541110-ae67-402c-a449-d037d00c0532/_ds_bundle.css`
  → `design-import/reference/ds-bundle.css`.

- [ ] **Step 2: Start both servers** — dev already on :3001 (restart if dead); design:
  `npx -y http-server "C:\Users\Sagi\Desktop\Atlas-frontend\design-import" -p 8399` (background).
  Verify both respond 200.

- [ ] **Step 3: Probe the rendered design** — Chrome MCP: open
  `http://localhost:8399/Atlas%20MVP.dc.html`, run via javascript_tool on representative nodes
  (body paragraph, page title, section label, mono time, serif accent, nav item, transcript line,
  chat bubble):

```js
const probe = (el) => { const s = getComputedStyle(el); return {
  font: s.fontFamily, size: s.fontSize, lh: s.lineHeight, ls: s.letterSpacing,
  weight: s.fontWeight, color: s.color }; };
// collect: JSON.stringify(Object.fromEntries([...document.querySelectorAll(SELECTORS)]
//   .slice(0,40).map((el,i)=>[i+':'+el.className, probe(el)])))
```

  Record results verbatim into AUDIT.md "Probed foundations". Expected (hypothesis from bundle,
  must confirm): body font `IBM Plex Sans Hebrew, Inter, Heebo, system-ui, sans-serif`; scale
  2xs 10/14 · xs 11/16 · sm 13/20 · base 15/24 · lg 17/28 · xl 20/28 · 2xl 24/32 · 3xl 30/38 ·
  4xl 38/46; tracking-normal −0.01em.

- [ ] **Step 4: Build the state matrix** in AUDIT.md — rows = every design page/state, seeded
  from the design's screenshot library names (cal-toggle/cal-tooltip/cal-multi, facet-single/
  facet-multi, co-overview/co-webinars/co-quotes/co-ask, chat-empty/chat-icon, quotes-*,
  overview-*, ws-*, agents-check) + the .dc.html page list; columns = EN shot · HE shot ·
  hover pass · status. Seed each page's checklist with the founder-visible diffs already known
  (from `C:\Users\Sagi\Desktop\Atlas Design Project\Frontend Comparison`):
  calendar (filter chips row, hint line, pill anatomy icon·name·mono-time·hover-affordances,
  today ring, LIVE pill, toggle copy "Full market / My calendar"), company (mono identity line
  sector·ticker·IR, INDICES chips TA-125/TA-90, LIVE·TASE status, reported-quarter module,
  announcements list, tab set incl. Documents naming), call view (CALL SECTIONS default-open
  with timestamped rows + red active dot, facet chips with ×, compact pill player, dark content
  cards in slides/report, Ask-Atlas serif hero "Ask anything about this call"), global (font
  stack + type scale everywhere).

- [ ] **Step 5: Commit** — `git add docs/superpowers/plans/2026-07-06-parity-audit.md` →
  `docs(parity): audit doc — probed foundations + state matrix`.

### Task 2: Global foundations — font stack + type scale

**Files:**
- Modify: `src/app/layout.tsx` (fonts link)
- Modify: `tailwind.config.ts` (fontFamily.sans, fontSize scale, letterSpacing)
- Modify: `src/app/globals.css` (only if probe shows a body-level letter-spacing/feature-setting)

**Interfaces:**
- Consumes: AUDIT.md "Probed foundations" (Task 1) — exact confirmed values.
- Produces: app-wide `font-sans` = design stack; Tailwind size utilities = design scale. All
  later tasks assume text matches by default and only fix layout/anatomy.

- [ ] **Step 1: Append the shared-surface alert** (BEFORE the change) — append one line to
  `C:/Users/Sagi/Desktop/Atlas/agent-memory/cross-cutting.md` via `fs.appendFileSync`/`>>`:
  `[ts] Lane F — landing design font stack (IBM Plex Sans Hebrew/Inter/Heebo) + design type
  scale (base 15px) in tailwind.config; every text node app-wide retunes.`

- [ ] **Step 2: Extend the fonts link** in `src/app/layout.tsx` — add to the existing Google
  Fonts href: `family=Heebo:wght@400;500;600;700&family=IBM+Plex+Sans+Hebrew:wght@400;500;600;700&family=Inter:wght@400;500;600;700` (keep Newsreader + JetBrains Mono).

- [ ] **Step 3: Land the confirmed values in `tailwind.config.ts`** (values below are the
  bundle hypothesis — replace with AUDIT.md probed values if they differ):

```ts
fontFamily: {
  sans: ['"IBM Plex Sans Hebrew"', 'Inter', 'Heebo', 'system-ui', 'sans-serif'],
  display: ['Newsreader', 'Georgia', 'serif'],   // unchanged
},
fontSize: {
  '2xs': ['10px', '14px'], xs: ['11px', '16px'], sm: ['13px', '20px'],
  base: ['15px', '24px'], lg: ['17px', '28px'], xl: ['20px', '28px'],
  '2xl': ['24px', '32px'], '3xl': ['30px', '38px'], '4xl': ['38px', '46px'],
},
letterSpacing: { tighter: '-0.03em', tight: '-0.02em', normal: '-0.01em',
  wide: '0.04em', wider: '0.08em', widest: '0.12em' },
```

- [ ] **Step 4: A/B text crop** — same paragraph/heading design vs app at 1920×950; iterate
  until the crop is indistinguishable (font, size, weight, tracking, line-height).
- [ ] **Step 5: Battery + walkthrough** — `npx tsc --noEmit` · `npm test` · eyes-on all pages
  for layout breakage from the scale change (fix in place; the design scale wins over old
  spacing assumptions).
- [ ] **Step 6: Commit** — `git add src/app/layout.tsx tailwind.config.ts src/app/globals.css`
  → `feat(parity): design font stack + type scale (foundations)`.

### Task 3: Calendar parity

**Files:**
- Modify: `src/components/calendar/CalendarView.tsx`
- Create: `src/lib/calendar/event-meta.ts` + `src/lib/calendar/event-meta.test.ts`
- Modify: `src/lib/i18n/dictionaries/en.ts` + `he.ts` (calendar keys — land atomically)

**Interfaces:**
- Consumes: design calendar page (rendered) + AUDIT.md calendar checklist.
- Produces: `eventKind(call): 'call'|'report'|'webinar'`, `EVENT_KIND_META[kind] =
  { icon, labelKey }` used by pills + filter chips.

- [ ] **Step 1: A/B shoot + finalize checklist** in AUDIT.md (seeded: filter chips
  Reports/Investor calls/Webinars with × remove and + re-add, hint line "Filter by type · +
  adds a type, × removes it · hover any event for its context", pill anatomy: kind icon +
  name + mono 24h time + hover affordance (+ add / ✓ added), today = black circle around
  day number, LIVE pill red, toggle copy "Full market / My calendar", grid hairlines/cell
  proportions, month nav chevrons).
- [ ] **Step 2: Failing test first** — `event-meta.test.ts` (node:test): `eventKind()` maps a
  transcript-backed row → `'call'`, stub webinar row → `'webinar'`, report row → `'report'`;
  add file to package.json test list. Run: fails (module missing).
- [ ] **Step 3: Implement `event-meta.ts`** minimal mapping; test passes.
- [ ] **Step 4: Rebuild pill + chips + hint + toggle** in CalendarView per design markup
  (transplant the design's calendar cell/pill markup verbatim if two fix rounds don't converge).
  Dictionary keys both locales in one atomic node script (`calendar.fullMarket`,
  `calendar.filterHint`, `calendar.followed`, kind labels...).
- [ ] **Step 5: Loop until indistinguishable** — re-shoot A/B EN; then HE mirror; then hover
  states (scripted hover via Chrome MCP on a pill + a chip; capture design's tooltip/context
  behavior — match `01-cal-tooltip*.png`).
- [ ] **Step 6: Battery + commit** — tsc/tests; `git add <paths>` →
  `feat(parity): calendar — chips, pill anatomy, hint, today ring`.

### Task 4: Company overview parity (+ density modules)

**Files:**
- Create: `src/lib/company/overview-stub.ts` + `src/lib/company/overview-stub.test.ts`
- Modify: `src/components/company/CompanyView.tsx`, `CompanyOverview.tsx`
- Modify: `src/lib/i18n/dictionaries/en.ts` + `he.ts`

**Interfaces:**
- Produces:

```ts
export interface CompanyIdentityStub { sector: string; ticker: string; irName: string;
  indices: string[] }                       // e.g. ['TA-125','TA-90']
export interface ReportedQuarterStub { quarter: string; reportedAt: string;  // ISO date
  quoteHe: string; speakerRole: string; jumpSeconds: number; outlookChipKey: string }
export interface AnnouncementStub { dateIso: string;
  tag: 'IMMEDIATE' | 'TRANSACTION' | 'FINANCIALS'; titleHe: string }
export function companyOverviewStub(companyId: string): { identity: CompanyIdentityStub;
  reported: ReportedQuarterStub | null; announcements: AnnouncementStub[] }
```

  Demo content mirrors the design's Tigbur demo (sector Shipping, TGBR, IR Zvika Rabin,
  TA-125/TA-90, Q2 2026 quote, 3 announcements). `jumpSeconds` deep-links into the company's
  real latest transcript when one exists (`/app/live/<id>?t=41`), else renders unlinked.
- Consumes: AUDIT.md company checklist; existing `CompanyView` tabs + data hooks (unchanged
  fetching).

- [ ] **Step 1: A/B shoot + finalize checklist** (seeded: mono identity line
  `sector · ticker · IR: name`, INDICES label + chips, LIVE·TASE top-right status, tabs
  Overview/Quotes/Documents/Webinars — align naming with design copy, MOST RECENT CALL card
  anatomy `Q2 2026 · Investor call` + duration mono, reported-quarter module (card header,
  FROM THE CALL mono label, RTL Hebrew quote in quotes, SPEAKER · CEO caption, `> Jump to 0:41
  in transcript` mono link, outlook chip, Transcript/Slides/Report ghost buttons, "Ask Atlas
  about these results"), LATEST ANNOUNCEMENTS rows (date col, tag chip, RTL title, chevron,
  View all), hover lifts `hover:-translate-y-0.5` + shadow-float per design).
- [ ] **Step 2: Failing test** — `overview-stub.test.ts`: stub returns identity with 2 indices,
  reported quarter with positive jumpSeconds, ≥3 announcements with valid tags; add to test
  list. Fails.
- [ ] **Step 3: Implement stub module**; test passes.
- [ ] **Step 4: Rebuild overview layout** per design markup with the modules; dictionaries
  atomically (indices label, announcement tags, viewAll, fromTheCall, jumpToTranscript...).
- [ ] **Step 5: Loop until indistinguishable** — EN, HE, hovers (card lift, announcement row,
  artifact buttons). Verify quotes tab + folders + add-call flows still work (existing
  behaviors regression).
- [ ] **Step 6: Battery + commit** → `feat(parity): company overview — identity, reported
  quarter, announcements (stub-backed)`.

### Task 5: Investor-call view parity

**Files:**
- Modify: `src/components/live/LiveTranscriptView.tsx`, `LiveBroadcastView.tsx`,
  `TranscriptBody.tsx`, `TranscriptSidePanel.tsx`, `TranscriptChatPanel.tsx`
- Create: `src/lib/live/call-stubs.ts` (slides/report demo cards) + `call-stubs.test.ts`
- Modify: `src/lib/i18n/dictionaries/en.ts` + `he.ts`

**Interfaces:**
- Consumes: AUDIT.md call checklist; existing call theming (`[data-call-theme]` + `.call-*`),
  karaoke machinery (unchanged), replay-engine recipe from state file (capture 381s,
  LIVE_BUFFER_SEC=300, REPLAY_OFFSET=305 → ~75s join window) for the live-state shots.
- Produces: `slideStub(call)` / `reportStub(call)` returning design-demo dark-card content
  (`{ title: string; lines: string[]; meta: string }`) used when no real slides/report linked.

- [ ] **Step 1: A/B shoot + finalize checklist** (seeded: CALL SECTIONS panel default-OPEN with
  call title + date + timestamped speaker rows + red dot on active + row highlight follows
  playback, facet chips with icons and × (Transcript pinned, Slides/Report removable), Dark |
  Light pill exactly as design, compact pill player (logo avatar · title · LIVE dot · progress ·
  mono time · pause · volume) replacing full-width bar, pane headers TRANSCRIPT/SLIDES/REPORT
  with LIVE·karaoke tag placement, transcript segment anatomy (speaker chip + avatar side, mono
  timestamp, caret bar on active edge, paragraph measure), slides/report dark content cards,
  Ask-Atlas panel: serif hero "Ask anything about this call" + subline + composer anatomy
  (@ / icons, send affordance) + aa-panel slide-in).
- [ ] **Step 2: Failing test** — `call-stubs.test.ts`: stubs return non-empty lines, meta
  labels; add to test list; fails → implement → passes.
- [ ] **Step 3: Rebuild per design** (chips, sections default-open, pill player, pane cards,
  hero). Transplant design markup verbatim where two rounds fail — especially the player pill
  and sections rows.
- [ ] **Step 4: Live-state verification** — start replay engine (claim :8788 in cross-cutting
  first, release after): verify beam, karaoke sync, buffer overlay, session-reset invariant
  untouched (`npm test` incl. liveTiming.test.ts), finished-call state too. A/B shoot both
  dark and light themes.
- [ ] **Step 5: Loop until indistinguishable** — EN, HE, hovers (facet chips, sections rows,
  player controls, save-quote toolbar).
- [ ] **Step 6: Battery + commit** → `feat(parity): call view — sections panel, facet chips,
  pill player, ask hero`.

### Task 6: Home + Chat + rail sweep

**Files:**
- Modify: `src/components/app/NavRail.tsx`, `LiveNowPanel.tsx`, `UpcomingCard.tsx`,
  `HomeSearch.tsx`
- Modify: `src/components/chat/ChatView.tsx`, `ChatComposer.tsx`, `ChatHistory.tsx`
- Modify: `src/app/app/workspace/page.tsx`, `src/app/app/agents/page.tsx` (only if their A/B
  shows drift after the type-scale change)

**Interfaces:**
- Consumes: AUDIT.md home/chat/rail/stub-page checklists (built in Task 1; most anatomy shipped
  in M1 — this task is the fine pass under the new type scale).

- [ ] **Step 1: A/B shoot Home, Chat (empty + active), rail (expanded + collapsed), Workspace,
  Agents** — finalize checklists (expect: beam card typography, panel label tracking, search
  field metrics, suggestion chips, bubble metrics, composer field metrics, rail item
  spacing/weights vs design).
- [ ] **Step 2: Fix loop until indistinguishable** — EN, HE, hovers (rail items, upcoming rows,
  suggestion chips, recent-chat rows). Verify chat streaming + citation chips against the real
  backend still render right (send one Hebrew message).
- [ ] **Step 3: Battery + commit** → `feat(parity): home/chat/rail fine pass`.

### Task 7: Comparison sheet + ship

**Files:**
- Create: comparison sheet HTML in scratchpad → published as Artifact (not committed)
- Modify: `C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md` (own section),
  `state-frontend.md`; APPEND: `ready-queue.md`, `cross-cutting.md`

**Interfaces:**
- Consumes: every A/B pair captured across Tasks 2–6 (kept in scratchpad, organized per page).

- [ ] **Step 1: Assemble the sheet** — one Artifact page: per matrix row, design-left /
  ours-right pairs (EN + HE + key hover states) embedded as data URIs, with a status line per
  page and the honest residual-gaps list. This is the founder's parity verdict evidence.
- [ ] **Step 2: Full battery** — `npm test` (all) · `npx tsc --noEmit` · `npm run build` ·
  /verify-app walkthrough EN+HE.
- [ ] **Step 3: Lane ship ritual** — re-read cross-cutting; `git fetch origin && git merge
  origin/main` (resolve package.json test list as UNION); battery again; push
  `feat/design-parity`; APPEND ready-queue entry (evidence = the Artifact link + audit doc);
  update board + state file (lessons → skill-graduation candidates); release any held claims.
- [ ] **Step 4: Report to founder** — comparison sheet link + what changed + residual gaps.

## Self-review notes

- Spec coverage: fonts-first (T2), audit loop per page (T3–T6), density modules w/ stubs
  (T3 chips meta, T4 overview stubs, T5 call stubs), design's screenshots as state matrix (T1),
  comparison-sheet gate (T7), out-of-scope list unchanged (drag-resize, ghost autocomplete,
  Projects, real feeds). Covered.
- No-placeholder check: config values are stated with their source + confirm step; discovery
  steps carry exact procedures (URLs, viewport, probe JS, seeded checklists). The audit loop is
  inherently discovery-driven — checklists ARE the deliverable of each Step 1.
- Type consistency: stub interfaces defined once in their producing task and only consumed as
  written.
