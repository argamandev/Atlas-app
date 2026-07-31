# PROGRESS.md

Decision log across sessions — what shipped and *why*. Newest first. Keep entries to ~3-5 bullets.
For the project overview, stack, and conventions, see `CLAUDE.md`.

---

## 2026-08-01 — Design round 2 "Harvey" SHIPPED (Lane F; reviewer-APPROVED after one fix round)

**Status:** merged to `main` (`e977823`) + pushed. 16 commits, 52 files. The founder's second
Claude Design round imported app-wide: ONE light theme replaces the whole theme-cycle system.

- **The theme cycle is gone.** `data-scheme`/`atlas-scheme` and the dark-call token family
  (`callDark`…`callFaint`) are removed; call views are now light like the rest of the app, with
  a one-shot `localStorage` migration in `NavRail` for users carrying an old scheme. A 100-hex
  warm→Harvey sweep was driven by the design's OWN translation table (`Atlas MVP.dc.html`
  line 154), not by eye. New: `lib/live/snipBridge.ts` (TDD) moves the Pinge snip scissors into
  the Ask Atlas composer, so both entry points arm the same crop.
- **One deliberate deviation from the design, on the record:** the import's `railText` `#6B6862`
  scored ~3.6:1 on the `#0A0A0A` rail — under WCAG AA. Founder decision: legibility wins.
  Shipped `#85817A` = **5.109:1**, verified by real luminance math (`probe/rail-contrast.json`),
  recorded at the token so a future parity probe does not "fix" it back to the design value.
- **Verification (two-gate, two rounds):** round 1 returned CHANGES — 1 BLOCKER + 7 WARNING +
  6 NIT, all 14 filed to the ready queue. The BLOCKER was an *evidence-integrity* failure, not a
  code bug: the verification file cited a screenshot for "Ask Atlas panel visible" in which the
  panel is closed, and the branch's headline surface had no committed visual evidence at all.
  Lane F fixed all 14, captured the panel open in EN **and** HE, and closed both residuals it had
  honestly carried (Gemini round-trip from a real snip; live surfaces run against a real `:8788`
  replay engine). Round 2: APPROVED. Supervisor battery on merged main: 108/108 · tsc · build.
- **Lesson filed:** two sessions were live on this branch at once and the supervisor killed the
  lane's dev server after asking the founder whether the port was "leftover" — a question the
  founder cannot answer. The supervisor must detect a live lane itself before touching anything
  in another worktree. No work was lost. See `agent-memory/cross-cutting.md` 2026-07-31.

---

## 2026-07-23 — Review-warnings sweep SHIPPED (Lane M; reviewer-APPROVED, zero findings)

**Status:** merged to `main` (`78af6fe`) + pushed. All 6 earmarked reviewer WARNINGs from
the pinge + multiview verdicts fixed in one small branch (4 commits, 14 files) — deliberately
merged BEFORE the founder's new app-wide design round lands on the same surfaces.

- **Chat history hygiene:** snip-only sends no longer poison follow-ups into silent GPT-4.1
  fallback — new pure `lib/chat/history.ts` `sanitizeHistory` (drops empty turns, prefers
  `apiContent` = what the model actually received), applied client-side AND on the untrusted
  body in `/api/chat`. Behaviorally probed against real Gemini (pre-fix history 400'd).
- **Silent degradation made visible** (the rules/app.md defect class): oversized snips now
  refused client-side with a toast (same constant + arithmetic as the server cap — no drift
  possible) · live view toasts snip-capture failures · stub report card carries a
  demo-content pill in both locales (covers no-doc, fetch-error, and 401 paths).
- **Supply-chain fix:** `pdfjs-dist` pinned exact `5.4.296` as a direct dependency, matching
  the committed `public/pdf.min.mjs` copies (was transitive via pdf-parse — a bump would
  have silently desynced viewer and ingest).
- **Verification (two-gate):** atlas-reviewer APPROVED with ZERO findings — verified each
  fix against the original finding text, re-ran 104/104 + tsc itself · supervisor battery
  independent on branch AND merged main: 104/104 (5 new TDD tests) · tsc · build ·
  evidence `docs/evidence/fix-review-warnings/`.

---

## 2026-07-23 — Pinge (snip-to-chat) SHIPPED (Lane M; reviewer-APPROVED, founder one-look passed)

**Status:** merged to `main` (`2d6d409`) + pushed. Same-day founder-brainstormed feature
(2026-07-17: brainstorm → spec → 9-task TDD plan → build → verify): financial tables are
miserable as extracted text, so users snip them **as pixels** and Atlas reads the image.
11 commits, 17 files, +2125/−40 on `feat/pinge` (stacked on merged multiview).

- **The chain:** scissors on the Report pane → OS-style drag-rect → offscreen 2× pdf.js
  re-render crop (zoom-proof PNG ≤1600px, no server round-trip) → thumbnail chips in Ask
  Atlas (≤4, ✕-removable) → `/api/chat` gains additive `attachments` (validated in pure
  `lib/chat/attachments.ts`, auth-gated exactly like `documentRef`) → Gemini `inline_data`
  + Hebrew page captions + page-text grounding ride-along (GPT-4.1 fallback: `image_url`).
  Real e2e: streamed answer cited page 6 and read the table digits from the pixels.
- **Marking-UX unified (founder decision):** PDF text-mark no longer auto-opens chat —
  floating Ask-Atlas button when chat is closed, auto-reference when open; same behavior
  for text marks and snips, finished and live views.
- **Verification (two-gate):** atlas-reviewer APPROVED — 0 blockers, 4 WARNINGs + 4 NITs
  filed in ready-queue (headline: snip-only send poisons follow-up history with an empty
  Gemini text part → silent GPT-4.1 downgrade; client never pre-checks the 2MB attachment
  cap → silent server-side strip) · supervisor battery independent on branch AND merged
  main: 99/99 (13 new TDD tests) · tsc · build · evidence `docs/evidence/feat-pinge/`.
  Founder one-look passed 2026-07-23 ("works amazingly") — real-hand drag confirmed.
- **Why merged before the founder's new design round:** the redesign touches the same
  surfaces (chat panel, call view); merging first keeps the import on a clean base.

---

## 2026-07-17 — Multiview M1 SHIPPED (Lane M; reviewer-APPROVED, founder rounds 2–4 included)

**Status:** merged to `main` (`2c2b464`) + pushed. Mission 4.2's first milestone: a REAL
quarterly-report PDF lives beside the transcript — rendered, markable, and Ask-Atlas-able
(the core differentiator). 24 commits, 38 files, +3180/−129 on `feat/multiview-backend`.

- **The chain, end to end:** additive migration `20260714_012` (`company_documents` +
  `document_pages`, RLS, private bucket — applied to the shared DB) → Hebrew-safe per-page
  extraction (y-group → RTL descending-x with LTR-run handling, quirk-case unit tests) →
  idempotent ingest CLI (Tigbur Q1+Q2 2026 seeded, 31/31 pages) → auth-gated `/api/documents`
  + file stream → pdf.js viewer with selectable Hebrew text layer → marked passage seeds
  Ask Atlas with `documentRef`, grounded on stored page text (auth-gated in `/api/chat`).
- **Why pdf.js is committed to `public/`:** Next 14's webpack mangles the pdfjs-dist 5.4 ESM
  bundle; the viewer imports `public/pdf.min.mjs` natively — re-sync both copies on any bump
  (reviewer WARNING filed: declare pdfjs-dist as a direct pinned dep).
- **Founder rounds 2–4 (all filed):** native yellow-wash PDF selection (no doubled glyphs) ·
  zoom 75–200% + pan + auto-recenter + page nav · rail-black audio bar (token change) ·
  bar-close keeps playback · Multi auto-collapses the rail · `usePlayerTimeDerived()` fixed
  hour-long calls freezing (60fps full-tree re-renders) · real Tigbur Q1-2026 call
  (`PyuMxe88e8g_live`, 275 word-timed segments) via new `retranscribe-call.ts`.
- **Also ships:** `scripts/append-log.mjs` — the fleet's sanctioned append-only log door
  (ad-hoc shell appends are classifier-blocked; allow rule in settings.json).
- **Verification (two-gate):** atlas-reviewer APPROVED — 0 blockers, 2 WARNINGs + 4 NITs, all
  filed as FINDINGs in ready-queue (headline: pdfjs-dist undeclared; stub-report fallback on
  fetch error has no demo marker) · supervisor battery independent on branch AND merged main:
  86/86 · tsc · build · eyes-on e2e evidence: `docs/evidence/feat-multiview-backend/`.
  Open founder item: one-look at the new call's audible playback (Chrome defers media in
  never-visible automation windows).

---

## 2026-07-14 — Environment-audit fixes SHIPPED (supervisor; 25/26 findings, reviewer-APPROVED, warnings fixed pre-merge)

**Status:** merged to `main` (`bd49940`) + pushed. Founder-approved execution of the
2026-07-07 cold-context environment audit (report + disposition: `docs/audits/`). Theme: the
environment's self-correction stopped depending on supervisor memory and mood — rituals are
now mechanical, evidence is durable, and append-only is enforced by hooks, not etiquette.

- **Rituals mechanized:** ARCHITECTURE update + plan/spec stamping moved to merge-time /ship
  steps (retirement never fired for seats that roll on); each merge appends a `MERGE` line
  and ≥3 since the last `LINT` line forces /fleet-lint; the lane re-mission path is a written
  runbook (we'll use it for Lane I).
- **Append-only became physics:** settings.json denies Edit/Write on the two logs; the bash
  gate blocks truncation AND (post-review) deletion/copy-over/dd/noclobber — 60-case gate
  suite green. Supervisor got a narrow dated note/graduation-marker exception so stale lane
  sections stop being uncorrectable.
- **Evidence durability:** Lane I's M1 quality report + real-Zoom captures rescued from the
  deletable worktree into `docs/evidence/ivrit-m1/` + `scripts/out/sessions/`; convention
  README; first agent-memory snapshot under `docs/archive/agent-memory-snapshots/`.
- **Drift killed:** ARCHITECTURE caught up with both merges (two engines, 77 tests, full
  harness table); CLAUDE.md two-engine line; VISION's double "Mission 4" disambiguated;
  8 shipped plans/specs stamped; stale pointers in transcript-review/live-test fixed.
- **Verification:** atlas-reviewer APPROVED (4 WARNINGs + 3 NITs — all warnings + 2 nits
  fixed pre-merge, findings filed in ready-queue) · 77/77 + tsc on branch and merged main ·
  reviewer independently probed the hook with 10 bypass payloads. Open: finding 18 —
  Supabase token rotation stays a FOUNDER action.

---

## 2026-07-14 — Claude Design frontend SHIPPED (Lane F; reviewer-APPROVED, founder parity verdict passed)

**Status:** merged to `main` (`69a98be`) + pushed. Mission 3 delivered: the Claude Design
frontend imported as an exact replica — Home, Calendar, Chat, Company, Call view (live +
finished, Single/Multi facet panes with drag-resize gutters), plus new Workspace + Agents
shell pages — then hardened through SEVEN founder-driven parity rounds until the founder's
verdict: "okay its good". 63 files, +4568/−746, 26 commits across feat/frontend-import +
feat/design-parity (stacked, merged together).

- **Why 7 parity rounds:** the first import was visibly worse than the design source; the
  hard-won truths are that the design uses the SYSTEM font stack (not Inter/Calibri) and TWO
  stacks — headlines are an SF Pro Display stack that resolves to Arial on Windows, verified
  byte-identical by canvas `measureText`. Fonts are probed from the rendered page, never
  assumed from bundle CSS.
- **Founder decisions along the way (all filed):** original charcoal player bar kept over the
  design's docked pill; color-scheme toggle restored (Warm/Black-rail/Black+white); transcript
  pane removable in Multi view (beyond the design); call dark bg `#0A0A0A` = rail.
- **Stubs discipline held:** Workspace/Agents/company-extras fed by typed stub modules with
  unit tests (`lib/{workspace,agents,company,calendar,live}/…`), real pages keep real data
  wiring. Live-viewer invariant code untouched (reviewer verified byte-identical fallback path).
- **Verification (two-gate):** atlas-reviewer APPROVED — 0 blockers, 3 WARNINGs + 6 NITs all
  filed as `FINDING` lines in ready-queue.md (headline follow-ups: fake "Q2 2026" quarter
  hardcoded on Home, company overview stub facts need a demo marker before launch, countdown
  `ringSecsRef` should reset on session change) · supervisor battery independent: 77/77 tests,
  tsc, production build — on the branch AND on main post-merge · founder eyes-on gate on :3001.

---

## 2026-07-04 — IVRIT live pipeline M1 SHIPPED (Lane I; reviewer-APPROVED, founder-tested on real Zoom ×2)

**Status:** merged to `main` (`9c6f0e7` + follow-up `e06ca7a`) + pushed. The fleet's first lane
ship. Lane I's mission line delivered: live Hebrew transcription WITHOUT Recall producing the
text — Recall is now an audio tap only (audio-only bot → silence-aligned 20–45s PCM chunks →
RunPod IVRIT → monotonic word-timeline stitcher → engine on :8788 serving the SAME /state+/pcm
contract, so the app viewer runs unchanged).

- **Why chunked-live works:** RunPod ivrit accepts base64 blobs (no storage churn), warm
  ~2.5s per 35s chunk; quality compare vs Recall captions AND a whole-file IVRIT reference
  showed no chunking content loss (divergences = loanword spellings + filler repeats).
- **Real-world proof:** two founder-attended Zoom tests — round 2 end-to-end (19 chunks all
  on time → karaoke → source end → auto finish → Gemini polish → finished-call page).
  Founder verdict: "works really really good".
- **Round 1 found a latent BOTH-pipeline viewer bug** (stale tab mixes two calls): fixed via
  `sessionId` in /state + viewer reset (`liveSessionChanged`), unit-tested with the real repro.
  Reviewer's one WARNING (offline poll fallback could trip that reset) fixed pre-push
  (`e06ca7a`). Invariant graduated to rules/live.md: viewers SURVIVE ENGINE RESTART.
- **End-of-call UX parity was a founder decision** (filed): engine writes the shared
  `broadcast-*` capture files, existing finish flow works unchanged over IVRIT output.
- **Verification:** 64/64 tests (chunker byte-conservation, stitcher monotonicity on a real
  RunPod fixture, session-reset repro) · tsc · build · /verify-app with eyes — run
  independently by the lane, the cold reviewer, AND the supervisor. Follow-ups filed: engine
  ws-reconnect + PCM memory (blocks 2h calls, M2) · mixed-language Whisper fillers (M2) ·
  `tsconfig.scripts.json` so `scripts/**` gets typechecked (repo-wide gap).

---

## 2026-07-03 — Doc-growth guards SHIPPED (reviewer-APPROVED, 1 nit fixed pre-merge)

**Status:** merged to `main` (`5fb8f6b`) + pushed. Founder-ordered after the supervisor's honest
audit of the md structure named the three ways the docs will rot as the fleet scales — each
weakness filed as a lesson, not left in chat.

- **fleet-lint check 8 — PROGRESS.md compaction:** >1000 lines (884 today) → propose era
  compaction to the founder (distill oldest era + archive raw entries; append-only stays law).
- **fleet-lint check 9 + ship retirement step — stale-plan banners:** shipped plans/specs get a
  `STATUS: SHIPPED` historical banner so no future session executes a dead plan. Stamped in
  place, never moved (moves break cross-doc references). One-time sweep stamped all 30 existing
  files; reviewer verified every stamp.
- **fleet-lint check 5 hardened — ARCHITECTURE.md drift bar:** concrete minimum per lint —
  sample ≥5 named paths (must exist) + verify 1 behavioral claim against code.
- Also: `.obsidian/` gitignored (editor config nearly leaked into a commit via `git add -A` —
  lesson graduated into the ship skill: stage explicitly).
- **Check 8 executed same day (founder-initiated):** the June/Timlul era (25 entries, 779
  lines) compacted to the ERA SUMMARY at the bottom; raw entries verbatim in
  `docs/archive/PROGRESS-2026-06-timlul-era.md`. 903 → 187 lines.

---

## 2026-07-02 — Knowledge-compounding upgrades SHIPPED (Karpathy-lens advisory R1-R5)

**Status:** merged to `main` (`e55c6c5`) + pushed, after a two-round atlas-reviewer gate
(CHANGES: 5 findings → all fixed → APPROVED with the reviewer re-running evidence itself).
Advisory source: an independent agent given Karpathy's LLM-wiki doc + the full environment.

- **`/fleet-lint` skill** — the missing "lint" operation: periodic sweep (every 2-3 merges) for
  board-vs-git drift, doc staleness, contradictions, un-graduated lessons, queue hygiene,
  repeated FINDING classes, un-filed decisions. Timing law: lint BEFORE recycling any memory.
- **Nothing evaporates anymore:** reviewer findings persist as greppable `FINDING` lines in
  ready-queue.md (repeat classes graduate into rules); founder decisions file immediately as
  `DECISION` lines in cross-cutting.md (typed prefixes on both logs); nontrivial answers are
  FILED into docs, not spoken ("chat is not storage" — rules/parallel-work.md).
- **Gate fire-test suite checked into the repo** (`.claude/hooks/gate-tests.mjs`, 36 cases) —
  was previously in session-temp scratch, a dangling pointer the reviewer caught. Meta-proof
  moment: the knowledge-consistency branch was itself caught violating its own new rule.
- **Mission 5 design hook planted:** per-company knowledge wiki added to VISION roadmap
  (Karpathy's pattern as Atlas's intelligence layer); Lane M's prompt now shapes the documents
  table + chat context for a future `company_knowledge` interface.
- Advisor's NOT-now list honored: no search infra, no unified log, no metadata/graph frontmatter,
  no cron-lint — foundation first. Obsidian: adopted as founder's read-only dashboard (pin the
  board + logs + PROGRESS in a vault; full graph workflow waits for Mission 5).

---

## 2026-07-02 — Harness audit fixes + brain upgrades SHIPPED (reviewer-APPROVED)

**Status:** merged to `main` (`bf66d79`) + pushed. An unbiased cold audit (founder-ordered) graded
the Mission-2 environment against the harness playbook; all real findings fixed same-day.

- **`atlas-reviewer` agent** (`.claude/agents/`) — independent cold-context reviewer, now a
  mandatory `/ship` gate before any merge (closes "one agent grades its own work"). Its first
  review (of this very branch) returned APPROVED + 8 findings; the 5 actionable ones were fixed
  pre-merge (per-statement SQL checks, rmdir /s coverage, wider MCP matcher, stale db.md ref).
- **Gate v2 guards BOTH DB doors** — Bash and the Supabase MCP tools — with additive-SQL still
  flowing; all audited regex bypasses closed. 35/35 fire-tests. The gate blocked its own author
  twice during this work (a commit message and a heredoc) — enforcement provably model-proof.
- **Board v2:** MISSION section (supervisor = navigator, each lane's line to the north star) +
  append-only `cross-cutting.md` / `ready-queue.md` (collision-proof). **Feature-retirement
  ritual** added to /ship: distill → PROGRESS → archive state → reset seat → intake next feature.
- **Permissions:** `settings.local.json` no longer pre-approves blanket supabase commands
  (was auto-approving resets against the shared DB). CLAUDE.md trimmed to ~430 tokens;
  app gotchas → `rules/app.md`. **Founder action still open: rotate the Supabase token.**
- Accepted, documented limitations: .env-mention false positives are by-design friction;
  symlink read route + branch-names-containing-"main" false positive are known edge cases.

---

## 2026-07-02 — Mission 2 SHIPPED: the Atlas smart environment (fleet harness)

**Status:** merged to `main` and pushed. Spec `docs/superpowers/specs/2026-07-02-smart-environment-design.md`
(founder-approved via interactive brainstorm) · plan `docs/superpowers/plans/2026-07-02-smart-environment.md`.
Built overnight per founder pre-approval; fleet launches in the morning via `docs/LAUNCH-KIT.md`.

- **Two enforcement hooks, fire-tested:** `pre-bash-gate.mjs` (blocks destructive SQL vs the shared
  DB, unsafe `rm -rf`, `.env` shell access, force-push, lane-push-to-main; 15-case matrix; it
  blocked this session's own test command live) and `post-edit-verify.mjs` (prettier + incremental
  tsc on every edit; broken-file test surfaced the exact error). Two real bugs caught by testing:
  lane *branch* pushes must be allowed, and `Atlas-frontend` passed a naive `startsWith` supervisor
  check (path-prefix bug).
- **The shared brain:** `agent-memory/BOARD.md` + per-lane state files — git-ignored, ONE physical
  copy in the main checkout, reached by absolute path from all worktrees (proven: instant
  cross-worktree sync). Harness itself (settings/hooks/rules/skills) now **tracked in git** so
  every worktree runs identical enforcement (was `.claude/*`-ignored — would have shipped lanes
  with no hooks).
- **Context diet:** CLAUDE.md 279→54 lines (standing facts + doc map); vision/roadmap →
  `docs/VISION.md`; gotchas → `.claude/rules/{parallel-work,db,live}.md`. Cold-session dry run
  PASSED: a fresh agent oriented fully from the environment alone (rules, board, ship flow).
- **Skills:** `/verify-app` (self-seeing loop + per-lane recipes) and `/ship` (lane/supervisor
  ritual) — this very merge was `/ship`'s first real run. One-time prettier baseline (134 files,
  behavior-neutral, 45 tests re-verified) so the format hook never creates diff noise.
- **Assets staged for the lanes:** yesterday's real-call capture archived to
  `scripts/out/sessions/2026-07-01-tamis-live/` (Lane I's test bench). Founder drops
  `design-import/` + `local-assets/demo-report.pdf` in the morning (Lane F / Lane M inputs).

---

## 2026-07-02 — Timlul Wave 1 DELETED (clean-start Phase 1) — merged to main, pushed

**Status:** merged to `main` (`bd7a951`) and pushed to `Atlas-app`. −2,584 lines / 29 files, +3 lines.
Verified: `tsc` clean · 45 tests · clean `next build` (34 routes) · founder click-through · **a real
Recall+Zoom live test end-to-end on the cleaned tree** (bot → captions → 4-min buffer → drain →
finish `completed`, correct call: 2026-07-01, 382.6s).

- **Deleted per `LEGACY.md` Wave 1:** legacy routes (`/home /dashboard /companies /processing /transcript`),
  components (`landing dashboard transcript processing companies platform layout`, `ui/Button`, `ui/Badge`),
  orphaned `useProcessingTimer`, and `src/middleware.ts` (its matcher only guarded deleted legacy routes).
- **Login repointed first** (the trap the guard test can't see — string navigation): `LoginForm` +
  `auth/callback` redirected to the legacy `/dashboard` → now land on **`/app/home`**. PROGRESS had
  claimed this was already done; the code disagreed — fixed for real now.
- **Wave 2 gateway kept** (4 files: `/` page, `LoginForm`, `JoinForm`, `dotted-surface`) until Atlas
  has its own login/landing.
- **Flagged for a dedicated pass (not fixed here):** `/app/*` has no middleware auth gate (the deleted
  middleware never covered it either — pre-existing); ARCHITECTURE.md still lists deleted files
  (Phase 4 rewrite covers it).

---

## ERA SUMMARY — 2026-06-07 → 2026-06-27: the Timlul/V1 era (compacted 2026-07-03)

The 25 raw entries of this era (779 lines) live verbatim in
`docs/archive/PROGRESS-2026-06-timlul-era.md`. Below is everything from them that still
governs today. The era's product knowledge already lives in ARCHITECTURE.md, docs/VISION.md
and `.claude/rules/`; its plans/specs are stamped historical.

**The arc:** transcript-quality gate + correction pipeline locked (06-07→06-10) → vision
level-up to the institutional platform (06-10) → V1 scoped + data layer seeded (06-11) →
transcript experience + chat + design pass (06-13/14) → Railway deploy + first real live
Zoom test (06-14) → rebrand to Atlas (06-15) → live→finished "one call matures" UX
(06-15→17) → live UX polish + keep-LIVE-through-drain (06-18/19) → feat/live-phase2 shipped
after a real 13-min Zoom test (06-20) → Global Live Call, live-tested on a real call
(06-22/26) → shipped to production timlul-ai.com (06-27). Then 07-02: Timlul Wave 1
deleted — clean Atlas start.

**Decisions still in force (dated — references elsewhere resolve here):**
- **2026-06-09/10 — quality-over-metric:** Gemini holistic formatting chosen over GPT-4o
  constrained diff (~40 vs 31 token-errors on the אמפא gold) because analysts read the
  output; deliberate trade-off (referenced from VISION's transcript-quality gate).
- **2026-06-09 — the entity list is the lever, not the model:** Claude Sonnet 4.6 correction
  tested, did not win; the per-company entity DB remains the biggest unexplored quality lever.
- **2026-06-11 — live calls' finished transcripts = Recall raw → Gemini** (no IVRIT
  re-transcription; measured tie, Recall adds speakers/timing free). IVRIT stays for the
  YouTube path. Lane I / Mission 4 deliberately revisits this with our own IVRIT live engine.
- **2026-06-11 — engine bake-off:** Recall-accuracy + Gemini live correction, the 72–188s
  caption delay embraced as the buffer; Gladia kept as a possible "instant mode" (2.7s lag,
  ~25 err/3min); ElevenLabs disqualified (no live events).
- **2026-06-13 — raw-live + polish-after:** no LLM in the live path (scales to concurrent
  calls); Railway chosen for the permanent webhook URL.
- **2026-06-15 — rebrand → Atlas;** only brand-name uses of תמלול renamed — it is also the
  Hebrew noun "transcript", a blind find-replace breaks product vocabulary.
- **2026-06-15 — quotes = anchor, auto-upgrade & deep-link** (not frozen text); build path
  C→A toward "one transcript page, two modes" (the "Thread A" design — raw block in the archive).
- **2026-06-22 — two live bars (Option B):** the live page keeps its in-column bar; the
  global bar appears only after navigating away; both read the same provider.

**Dead ends — do not retry:** source-side IVRIT biasing (proven no-op) · report-as-context
for transcript correction (over-reach + token-burn on both models tested) · Zoom OAuth to
bypass webinar registration (only helps auth-only meetings; registration `tk` links are
single-use — the fix is auto-register → fresh tk → launch bot, see VISION Core 2).

**Tech debt carried out of the era (still open):**
- **No live speaker capture:** live captions render as ONE speakerless block —
  `scripts/live-broadcast.mjs` captures word+timestamp but no participant data, and the
  finished transcript leans on Gemini's proportional speaker turns (06-14/06-16). Production
  fix = capture Recall's per-word participant → real speaker segments. Lane I / Mission 4 territory.
- `LiveAudioProvider` puts 10fps values in React context → consumers re-render 10×/s; port
  `PlayerProvider`'s `useSyncExternalStore` pattern before adding consumers (2026-06-27 review).
- The "call ended → finish pipeline" effect lives on the live PAGE — a user elsewhere at call
  end delays the finish until they return. Fine single-call; fix before report-season concurrency.
- `live.active` doesn't auto-clear when a call goes `over` while the user is away;
  `endedInFlight` sticks on a `failed` polish (treat `failed` like `completed`); recorded +
  live global bars can overlap if both active (all from the 2026-06-27 review, non-blocking).
- `feat/atlas-ui-kit` (design overhaul) still unmerged on origin — reconcile onto Atlas or retire.
- Parked: personal-transcribe (branch `personal-transcribe-parked`; its additive DB columns are
  inert) · Hebrew inside markdown tables pins left · leftover foreign Supabase tables
  (`products` has RLS disabled — founder cleanup advisory).
- Deliberate Feature-1 leftovers: per-company entity DB · IVRIT per-word confidence scores ·
  per-line `startSec`.
