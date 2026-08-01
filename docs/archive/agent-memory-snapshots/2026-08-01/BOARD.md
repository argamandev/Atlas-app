# ATLAS FLEET BOARD — the shared brain
<!-- Protocol: read at session start + before big moves (this file AND the two logs below).
     Update ONLY your own lane section. Timestamp every update.
     Cross-lane alerts    → APPEND to agent-memory/cross-cutting.md (never edit this file for that)
     Review requests      → APPEND to agent-memory/ready-queue.md
     Appends go via bash >> or fs.appendFileSync — appends to separate files cannot collide. -->

## MISSION — north star & current focus (supervisor-maintained)
Atlas = the institutional platform for Israeli public-market investor calls (docs/VISION.md).
**Current phase (chapter opened 2026-08-01): PROJECTS · WORKSPACE · AGENTS.** Founder brief:
`docs/product/2026-08-01-projects-workspace-agents-brief.md`. A tiered model — Projects =
breadth (organized chat + accumulating shared context) · Workspace = depth (single-thesis
workbench producing a citable hand-off document, fed by the Maya/TASE API) · Agents =
automation (persistent AI workers assignable to a workspace/company/call, running server-side).

**STRATEGY** (founder-approved 2026-08-01; the decisions themselves are in cross-cutting):
1. **UI FIRST** — all three surfaces imported in ONE Lane F chapter, stub-fed and demo-MARKED,
   no backends. A wrong page costs an afternoon; a wrong table costs a migration dance on a DB
   shared with production, where in-place renames are forbidden. And seeing all three rendered
   together is how the real data model gets discovered.
2. **RETRIEVAL IS THE FLOOR, and it is not yet scheduled by anyone.** The brief's own example
   ("which companies talked about M&A last quarter?") spans the whole archive, while
   `getChatContext()` loads exactly ONE transcript at 40k chars — it would answer confidently
   and wrongly, the silent-degradation class in rules/app.md. Founder approved a VECTOR DB;
   `vector` 0.8.0 (pgvector) is AVAILABLE in the existing Supabase, so this needs NO new
   service. Real open risk = HEBREW embedding quality, not infrastructure → spike it first.
   Also available and free: `pgmq` (agent job queue), `pg_cron` (scheduled runs), `pgroonga`
   (multi-language full-text, worth evaluating ALONGSIDE embeddings).
3. **BACKENDS ONE AT A TIME**, never in parallel — one shared production DB, one shared types
   file. Order: retrieval → Projects → Workspace → Agents. Only hard dependency in the brief:
   Agents → Workspace. Projects is independent and can ship any time. (These three are
   SIBLINGS, not a hierarchy — an earlier supervisor assumption that a workspace contains
   projects was wrong and is corrected here.)
4. **AGENTS RUN ON A SERVER** (founder: "they live on the product") ⇒ DEPLOY + CI is a
   dependency of the Agents feature, not a someday item. Atlas has never been deployed.
5. **AUTH COMES FIRST — half done.** The PAGE gate shipped 2026-08-01 (`src/middleware.ts`:
   `/app/*` + `/print/*`). What still blocks these backends: `getSession()` believes the cookie,
   so `getRequestUserId`/`getCurrentUser`/`requireAdmin` are gated in intent only;
   all three features are per-user data needing RLS behind a real authenticated user.
6. **"Better LLM reasoning / tool-calling" is a CONSTRAINT in every spec, not a scheduled
   phase** — phases like that get squeezed and never arrive. Use the Agent SDK where something
   must navigate or DECIDE; a documented API gets a plain integration (founder: saving model
   calls is an explicit goal). Cheap structured filtering first, expensive calls on survivors.

- Lane F → the product's face: **THREE-SURFACES IMPORT** (chapter opened 2026-08-01) —
  Workspace, Agents, Projects-in-chat as real navigable UI, stub-fed + demo-marked, NO
  backends. Prior chapters: design round 2 "Harvey" ✅ 2026-08-01 (`e977823`) · first import
  ✅ 2026-07-14 (`69a98be`). Still queued fleet-wide: real feeds for the stub modules +
  the fake "Q2 2026" Home tag.
- Lane I → PARKED since 2026-07-14. **PROPOSED re-mission (supervisor; FOUNDER HAS NOT
  CONFIRMED): the MAYA/TASE integration** — the same shape as the IVRIT/RunPod pipeline this
  seat already built (external service → ingest → store), and the seat is free, so it costs
  Lane M nothing. Founder connects to Maya 2026-08-02 (Sunday); a real API guide exists.
  Re-mission needs the runbook (brainstorm → spec → rewrite the 4 identity files → relaunch).
- Lane M → the product's depth: reports+slides beside the transcript, markable + Ask-Atlas-able
  (core differentiator). Gate OPENED when design round 2 merged. **PROPOSED next chapter
  (FOUNDER HAS NOT CONFIRMED): the retrieval foundation + the Projects backend** — it owns the
  chat/app-data surfaces. This now competes for the seat with its queued layer-2 call-view
  polish → layer-3 smarter Ask Atlas → Slides pane.
- Supervisor → auth: PAGE gate ✅ 2026-08-01 (`fix/app-login-gate`); **API auth (`getSession()` →
  `getUser()`) still owed and is the top security item** · + the deploy/CI question (agents on a
  server made it a dependency, not a someday).
Every lane: if a step doesn't serve its line above, flag it before building.

## Lane F — surfaces-import (branch feat/surfaces-import · port 3001)

- **status: [2026-08-01] CHAPTER 3 OPENED — THREE-SURFACES IMPORT.** Founder starts the
  brainstorm in the lane session TODAY. Opening prompt rewritten in `docs/LAUNCH-KIT.md`
  (re-mission runbook step 4) — a fresh session is born from that file, so it is the one that
  must be right. MISSION: import Workspace, Agents and Projects-in-the-chat-panel as real
  navigable UI. **SCOPE LOCK: UI ONLY — no tables, no migrations, no API routes**; the
  backends are deliberately sequenced behind this into other lanes. Stub-fed surfaces MUST
  carry visible demo markers in both locales (repeat-offender defect class, rules/app.md).
  Founder brief: `docs/product/2026-08-01-projects-workspace-agents-brief.md`.
  GATING STEP: the founder must land the new design source into `design-import/` through his
  own logged-in browser before the lane can do anything — DesignSync MCP cannot write to disk.
  Expectation set with the founder: three NEW pages is more than a restyle; the honest target
  for day one is real static UI, not three polished surfaces.
- ✅ **[2026-08-01 18:40] REVIEW ROUND DONE — THE FIVE FIXES ARE IN, RE-HANDED OFF @ `4e9908b`.**
  Verdict was CHANGES/24; the founder's scope call closed the no-backend findings, leaving five.
  All five fixed and verified BY DOING, in an authenticated session with the final URL asserted:
  the false "Saved just now" labels deleted · the invented quote's marker localized and moved
  OUTSIDE `contentEditable` (a Hebrew reader previously saw none, and it was deletable + exported
  into the PDF) · assignment targets given a stable `id` so one click no longer selects two rows ·
  the Hebrew build line un-forced from `dir="ltr"` · and `onClick={onSend}` wrapped — **that one
  was live on MAIN**, so mouse-send was dead for real users in Ask Atlas until this branch.
  Counts from git: 23 commits (`f7b3f23..4e9908b`), 67 files, +6094/-244, tree clean, in sync.
  Battery on the merge result: **152/152 · tsc · build green.** main moved mid-round (db ownership
  law + `docs/DATA-MODEL.md`) and is merged in; docs-only, no conflicts, and DATA-MODEL does not
  contradict this branch — it creates no tables at all. Detail: `[2026-08-01 18:40] HANDOFF` in
  the ready queue. **The 15 NITs stay carried.**
  ⚠️ **My evidence had asserted code that does not exist** (a workspace side-chat reusing Ask
  Atlas, and Pinge highlight-to-ask reuse). The reviewer was right. Retracted in place and named
  as a correction — the same written-from-memory defect that cost the login-gate branch four
  rounds. Battery table and parity probe corrected too.
- 🚦 **[2026-08-01 17:30, SUPERSEDED by the 18:40 line above] handed off @ `bf9693a`.**
  Counts pasted from git at the time:
  18 commits (`f7b3f23..bf9693a`), 67 files, +5990/-244; `git log HEAD..origin/main` EMPTY, so
  origin/main (7cad8b8) is fully contained and the login gate f05b659 is an ancestor. Battery on
  the final commit: **152/152 · tsc clean · build green.** Founder's verdict after walking it:
  "okay things look great". Full handoff detail — evidence, shared surfaces, carried gaps — is
  the `[2026-08-01 17:30] HANDOFF` entry in the ready queue. The founder approved how it LOOKS;
  correctness/iron-rules/scope/secrets are still the reviewer's gate.
- **[2026-08-01 late] CHAPTER 3 BUILT AND SHIPPED TO THE QUEUE — feat/surfaces-import @
  c7608de PUSHED** (10 commits, range 7cad8b8..c7608de, 64 files, +5420/-239). Full cycle in
  one session: design source landed → founder brainstorm → spec → 13-task plan → build →
  verify → ship. All three surfaces imported at FULL fidelity.
  - **The founder overruled the lane's breadth-first proposal** and was right: the sub-states
    (legal due-diligence, the detail column, the agent dock) are where the DATA MODEL lives,
    so skipping them would have left the backend chapters designing blind. Filed as a
    DECISION in cross-cutting with his words.
  - Built: Projects (list · a project with Instructions/Memory/Context · new-project — the
    dead nav button from round 2 now has a destination) · Workspace (picker + both empty
    states · 3-stage intake · control shell · editable working document · legal DD with 6
    findings · split docs with drag gutters) · Agents (deck · grid + menu · finished ·
    scheduled · create · dock).
  - SCOPE LOCK HELD: no tables, no migrations, no API routes. Session-only state in one
    provider in the /app shell; resets on reload by founder decision (no localStorage —
    imitating persistence is the filed fake-data defect class).
  - Battery 149/149 · tsc · build green. 22 screenshots (11 surfaces × EN/HE) + parity probe
    JSON committed. ZERO console errors in both locales.
  - **main moved under this branch mid-chapter** — the /app/* login gate (f05b659) is merged
    in at 733b4ac; all four new routes verified gated (307, deep link preserved in `next`).
    The lane flagged its own evidence gap: the PNGs predate the gate and cannot be reproduced
    unauthenticated; one post-gate authed capture is named in the evidence as the artifact
    that does prove that path.
  - FOUNDER CALL — **RESOLVED 2026-08-01 by the founder, in the design.** It was: the
    Workspaces picker H1 moving off Newsreader to sans/600 because the rendered design
    hardcoded that for the one headline, reversing a round-2 consistency fix. The founder
    rebuilt the headline in the design AS SERIF; the app followed in `65a6235`. Parity and
    app-wide consistency now agree — nothing left to decide. railText #85817A untouched.
  - **FOUNDER ROUND 2 (2026-08-01 afternoon), 3 commits `634fe0a` `65a6235` `597e4c2`,
    battery 152/152 · tsc · build green.** He walked the surfaces and re-cut the design
    (remote `Atlas MVP.dc.html` edited 11:18Z, version 1785587677358929). Shipped: serif
    Workspaces H1 · the new-workspace screen no longer shows TWO composers (bottom bar gated
    to the clarify stage) · the agent chat panel rebuilt to the new aesthetic (segmented
    tabs with the active half solid ink, sparkle header, snip/tools/mic composer row, helper
    line, live suggestion chips, "Recent agent chats", Widen takes the WHOLE main area) ·
    a shared pill composer that replaces the tall one once a conversation has started, in chat
    AND workspace intake.
  - **FOUNDER CORRECTION ROUND (same afternoon), `abb1556` + `2cb845f`.** He compared the built
    panel against his own reference capture and caught four things, all fixed and verified in
    both locales: (1) the panel opened COLD was rendering findings immediately — the design
    shows a centred hero instead (serif "Ask anything of" over the agent name in mono, the
    description, suggestions as PLAIN STACKED TEXT not pills); findings arrive with the first
    exchange. (2) **Company is a scope again ALONGSIDE Sector** — final list is
    `Call/Workspace/Company/Sector/Report`; five kinds, so the panel lays them out 3-up while
    the create modal still fits one row (measured both locales, nothing clipped). (3) widen /
    narrow now use the design's diagonal double-arrows. (4) the panel is a sibling of the whole
    left column, so it runs FULL HEIGHT and the black command deck stops at its edge — and the
    deck no longer forces `dir="ltr"`, so Hebrew prompts sit top-right (`>` is bidi-mirrored, so
    the engine flips it leftward there by itself). Then a fifth, `bf9693a`: the panel had the two
    Harvey surface tokens INVERTED — aside `bg-paper` (#F7F7F7) carrying white boxes, where the
    design is a WHITE panel carrying gray boxes. Probed after the fix: panel rgb(255,255,255),
    composer + finding cards rgb(247,247,247), chips rgb(255,255,255).
  - 🔁 **LESSON — verify the paths the USER takes, not the paths you built.** Both misses this
    round were things never LOOKED at, not things got wrong: the panel's cold state (built from
    a recent-chat capture, so the empty state — a different LAYOUT, not the same layout with
    less in it — was never opened) and the command deck in Hebrew (pinned LTR at import and
    never rechecked RTL). Walk every surface from a cold start, in both languages, before
    calling it done.
  - ⚠️ **THE DESIGN SOURCE CANNOT BE RE-FETCHED TO DISK — do not burn a session retrying.**
    Three independent doors are shut: `DesignSync.get_file` caps at 256 KiB (file is 419 KB);
    Chrome's Local Network Access blocks an HTTPS page POSTing to a localhost receiver (it
    HANGS, it does not error — a 45s CDP timeout is the tell); and content returned from the
    claude.ai origin via the browser tool is filtered. WHAT WORKS: drive the design live in
    present mode (`https://claude.ai/design/p/<id>?file=...&present=1`), which is the rendered
    -design parity law anyway. Its limit: the design sits in a cross-origin iframe, so no
    computed-style probes — measure on the app side and reconcile against the design's own
    layout behaviour.
- next: **BLOCKED ON THE SUPERVISOR** — fresh atlas-reviewer gate + merge, covering all three
  rounds (`f7b3f23..2cb845f`). The lane has nothing left to build on this chapter and will hold
  until the reviewer returns findings. Carried gaps for the NEXT chapter: the inert chat inputs
  (project composer, agent chat, workspace side-chat) and wiring the `__chat` tab to the
  existing Ask Atlas panel — the one piece of design 2039 not finished. Smaller parity deltas
  are listed in the evidence file §4b (chat pill width, workspace clarify chip copy).
- 🖥️ **:3001 is MINE and RUNNING** (this session is live as of 2026-08-01 17:30). Do not kill it
  or wipe this worktree's `.next` — build merged main in your own checkout instead
  (ship skill step 1).
- ⚠️ **[supervisor note 2026-08-01] YOUR SCREENSHOT RECIPE IS NOW WRONG — READ BEFORE CAPTURING.**
  `state-frontend.md` teaches that "`/app/*` pages render WITHOUT auth … all captured fine
  unauthenticated. Only the real PDF needs the session." That was true yesterday and is FALSE as
  of `fix/app-login-gate` (2026-08-01): `src/middleware.ts` now redirects any unauthenticated
  request for `/app/*` or `/print/*` to the login page at `/`. An unauthenticated capture will
  silently produce a screenshot OF THE LOGIN PAGE — which would sail through as evidence, since
  it is a real screenshot of a real page. **Every capture now needs the founder's authenticated
  Chrome profile** (which you already proved works, 2026-07-31), and any shot whose first
  redirect landed on `/` is not evidence of anything. The supervisor may not edit your state
  file; fold this into it yourself at your next write. Two more things that will bite: your
  captures should assert the final URL, not just the pixels, and a `?next=` bounce means the
  session lapsed rather than the page being broken.

- PREVIOUS CHAPTER 2 (record): design round 2 "Harvey" — one light theme app-wide, theme cycle
  removed; merged 2026-08-01 (`e977823`) after a two-round review. Detail below.
- PREVIOUS CHAPTER 1 (record): Claude Design import + 7-round parity grind — founder gate
  passed + merged 2026-07-14 (69a98be). State archived at
  agent-memory/archive/state-frontend-design-parity-2026-07-23.md; lessons graduated to
  verify-app (6 parity laws) + rules/app.md (rendered-design law, two-font-stack truth).
- status: [2026-07-23] RE-MISSIONED by founder decision (cross-cutting 2026-07-23): import
  the founder's NEW app-wide Claude Design round — Ask Atlas panel, colors/typography,
  call-view UX — onto current main (which now includes multiview M1 + Pinge: PDF Report
  pane, snip-to-chat, marking UX; the call view and chat panel you're restyling are NOT the
  ones you left in July W2 — diff them first). Worktree Atlas-frontend, fresh branch
  feat/design-round-2 off main. Chapter starts with the founder importing the new design
  source into design-import/ (same flow as 07-03) + a scoping brainstorm in the lane session.
- last verified: [2026-07-23] NEW DESIGN SOURCE IMPORTED into design-import/ (12 files via
  the claude.ai design project API through the founder's browser session — DesignSync MCP
  can't write to disk; bundle+unpack flow, byte sizes verified, Atlas MVP.dc.html 310KB vs
  old round's 260KB). Rendered design verified eyes-on via local server :4321 (NOT a lane
  port): Harvey mode (black rail/white bg/gray cards) · Ask Atlas panel (wide, Pinge scissors
  in composer) · multiview floating panes + floating tab row. Design also contains pages we
  do NOT have (Workspace, Agents) — scope question live in brainstorm.
- next: [2026-07-25] BUILD DONE, AWAITING FOUNDER BIG REVEAL — spec approved + 5 decisions
  filed (aesthetic-only · Harvey replaces all themes · light call views · Pinge scissors both
  entry points · one big reveal); 8-task plan executed on feat/design-round-2 @ ae8de31
  (10 commits): Harvey tokens + theme-cycle deletion + 100-hex warm→Harvey sweep + light call
  views + multiview floats + Ask Atlas panel (347px, composer scissors via new snipBridge,
  TDD) + parity evidence. Battery 108/108 · tsc · build · probes EXACT vs rendered design.
  Evidence: docs/evidence/feat-design-round-2/2026-07-25-harvey-verification.md.
- blockers: founder verdict round 2 + one founder-assisted pass (logged-in real-PDF snip via
  the new composer scissors; login-link automation was permission-blocked). Then /ship.
  [2026-07-25 later] founder round-2 notes (5) ALL FIXED @ 6661c02: single-view floats ·
  flat controls row (probed: design row has NO card) · scissors always + mic affordance ·
  per-context connected captions · zero separator lines. Battery 108/108 · tsc.
  [2026-07-31] **FOUNDER REVEAL PASSED → SHIPPED TO READY QUEUE.** Founder verdict: "everything
  is good" (DECISION filed in cross-cutting). feat/design-round-2 @ 88d9712 PUSHED — 13 commits,
  range a9964a8..88d9712, origin/main merged in clean (2 docs commits). Battery post-merge
  108/108 · tsc · build green. Eyes-on in the founder's authed Chrome closed the last blocker:
  the NEW composer scissors armed → real drag-crop on the 31-page Tigbur PDF → thumbnail chip
  with p.1 badge. Two scares chased down and both are NON-bugs (recorded in the 07-31 evidence
  file): the transcript "text caret" is Chrome Caret Browsing (F7), and a "PDF blown up when
  Ask Atlas opens" was the hidden-tab pdf.js re-render stall, correct the moment the tab was
  foregrounded. Evidence: docs/evidence/feat-design-round-2/2026-07-31-founder-reveal-and-ship.md.
- blocked-on: supervisor review + merge (lanes never push main). Residual for the reviewer:
  Gemini round-trip with a composer snip not re-sent this session (chip+crop verified; send
  path unchanged from feat/pinge) · live-engine views mechanically restyled but never run
  against an engine (needs a :8788 replay pass, single-owner port) · commit 88d9712 subject
  carries a stray leading "@" (force-push to fix is hook-blocked).

- [supervisor note 2026-07-31] FOUNDER APPROVED THE REVEAL ("the frontend is great") + confirmed
  the logged-in real-PDF snip pass (DECISION filed in cross-cutting). Ship attempted; reviewer
  returned CHANGES — NOT MERGED. Branch is at 255fef4 (12 commits; the lane merged origin/main
  in at 23:22). Supervisor battery on branch: 108/108 · tsc · build green (first build failed
  only on a stale .next held by a leftover :3001 dev server — killed, wiped, rebuilt clean).
  Verdict + all 14 findings filed in ready-queue 2026-07-31. FIX LIST before re-ship:
  (1) BLOCKER — evidence file cites app-call-multi-en.jpg for "Ask Atlas panel visible" but the
  panel is CLOSED in that shot; the 347px panel + new composer have NO committed visual evidence
  in either locale. Capture EN+HE with the panel open, correct the claim.
  (2) Workspace H1 left on font-head — the only headline still on the old stack.
  (3) Company page: warm gradient rgba(242,238,230,.5) survived → beige wash on a Harvey card.
  (4) Live buffering overlay top-[63px] vs header h-[58px] → 5px strip of the control row shows.
  (5) tailwind call-* aliases: 8 inverted aliases with a comment making two false claims (zero
  usages on branch AND main). Remove or correct the comment.
  (6) snipBridge doc + test comment + evidence describe a hide-when-unavailable contract the code
  no longer implements (always-render + disabled). Align the words to the shipped behaviour.
  (7) NITs: dead enabled:hover:call-ink · PaneCard inline hex/radius bypassing the hairline token ·
  FacetPanes effect deps re-running per parent render · orphaned ThemeIcon export · indentation.
  FOUNDER CALLS PENDING (do not fix unilaterally): the Agents-page restyle breaks the scope lock
  (keep or revert?) · railText #A6A29A→#6B6862 is a faithful design import but takes rail contrast
  to ~3.6:1, under the 4.5:1 accessibility line · the "coming soon" mic button is a new dead
  affordance under an aesthetic-only lock.

- [supervisor note 2026-07-31, later] LANE F WAS LIVE THROUGHOUT the above — branch advanced to
  88d9712 (docs-only evidence commit, findings unaffected) and is PUSHED to origin. Supervisor
  killed its :3001 dev server by mistake (founder reported the port as leftover; it was not) —
  no work lost, dev server only. FOUNDER CALLS NOW RESOLVED (cross-cutting 2026-07-31):
  • rail contrast → NUDGE to pass WCAG AA 4.5:1 (target #85817A ≈5.1:1, preserves the design's
    warm hue; bare minimum ≈#7C7C7C). The one deliberate deviation from the import this round —
    do not let a future parity probe "fix" it back.
  • Agents-page restyle → KEEP (lock relaxed for colour-only changes to stub pages).
  • "Voice ask — coming soon" mic button → KEEP as a deliberate placeholder; filed as a known
    non-functional affordance, not a defect. Revisit before any external demo.
  • who fixes → LANE F (builder fixes, fresh reviewer re-gates; supervisor does not self-review).
  Two residuals the lane itself carried and the supervisor is holding it to: the Gemini
  round-trip from a composer-originated snip was never completed, and the live-engine surfaces
  were never seen against a running engine (typecheck+build only) — a replay pass on :8788
  (single-owner, claim it) is the honest close-out.
- next: Lane F applies the fix list → re-verifies eyes-on (incl. the missing panel screenshots
  EN+HE) → back through a fresh atlas-reviewer → supervisor merges. THEN the founder's
  product-direction brainstorm with the supervisor (filed as a DECISION 2026-07-31).

- [2026-08-01] **FIX ROUND DONE → RE-SHIPPED FOR RE-GATE.** feat/design-round-2 @ 1475ab3
  PUSHED (3 new commits: af28f0b WARNINGs · b5f4ee5 NITs · 1475ab3 evidence; 16 over
  origin/main, range a9964a8..1475ab3; origin/main merge = already up to date). ALL 14
  FINDINGS ADDRESSED + BOTH CARRIED RESIDUALS CLOSED. Battery 108/108 · tsc · build green.
  - BLOCKER closed: false citation corrected IN PLACE (original line kept + dated CORRECTION);
    the 347px panel now has real committed evidence in both locales (app-ask-panel-en/he.jpg,
    captured through the panel's own open button — measured 347px, dir ltr/rtl, 3 composer
    buttons, 0 console errors).
  - Founder calls applied exactly as given: railText #85817A (**5.108:1** by real WCAG
    luminance math, probe/rail-contrast.json — recorded in three places as a DELIBERATE
    deviation so a future parity probe can't undo it) · Agents restyle KEPT · mic button KEPT.
    Both "kept" items are now DECLARED in the evidence instead of silent.
  - Residual 1 CLOSED: Gemini round-trip from the COMPOSER scissors, authed, real PDF — model
    read the page-1 Hebrew heading off the pixels. Residual 2 CLOSED: live surfaces run against
    a running engine on :8788 (claimed + released in cross-cutting); same run measured WARNING
    #3 on its real surface — header bottom 58 / overlay top 58 / **gap 0**.
  - Evidence: docs/evidence/feat-design-round-2/2026-08-01-review-fixes.md — written to state
    literally what each image does and does NOT show, since the BLOCKER was exactly that failure.
  - :3001 dev server RESTARTED (supervisor killed it at ~23:30) and left running.
- blocked-on: fresh atlas-reviewer re-gate + supervisor merge. Residue the reviewer should see:
  x-chat-fallback header not re-checked on the round-trip · two PRE-EXISTING dead
  hover:call-ink sites in SlidesPane left untouched on purpose (scope lock) · 88d9712's stray
  leading "@" still stands (force-push hook-blocked).

- [supervisor note 2026-08-01] **MERGED → main (`e977823`, docs `9987155`, pushed). CHAPTER
  CLOSED.** atlas-reviewer re-gate returned APPROVED: it verified all 14 round-1 findings FIXED
  against the real files rather than the lane's claims — recomputed the WCAG luminance itself
  (5.109:1), opened both new screenshots to confirm the panel is genuinely open in EN and HE,
  and grepped every utility form of the removed call-* aliases for zero hits. Supervisor diff
  pass over 52 files (all UI/design + evidence + docs; no API/db/auth/migrations) + battery on
  merged main 108/108 · tsc · build green. THREE NEW NITs filed to the ready queue and knowingly
  carried into main: two stale comments that contradict the code they sit on (globals.css:166,
  LiveBroadcastView.tsx:366 + LiveTranscriptView.tsx:459) and one evidence-precision NIT (the
  snip screenshot proves the round trip but cannot prove WHICH scissors armed it — both are in
  frame). The lane's honesty about its own residuals is what let both gates be cheap; that is
  the behaviour to keep. Seat now awaiting its next chapter (see MISSION).

- [supervisor note 2026-08-01] **CHAPTER 3 `feat/surfaces-import` @ bf9693a — VERDICT: CHANGES.
  NOT MERGED.** Two gates ran (atlas-reviewer cold context + supervisor pass): **24 findings —
  1 BLOCKER · 8 WARNING · 15 NIT**, all filed as individual lines in the ready queue at
  `[2026-08-01 17:23]`. Founder standing decision 2026-07-31 applies: **you fix it, you
  re-verify eyes-on, it ships back through a fresh reviewer** — the supervisor does not
  fix-and-self-review.
  - **DO NOT RE-LITIGATE WHAT PASSED.** Scope lock is REAL and was verified, not taken on your
    word: no migrations, no SQL, no API routes, `middleware.ts`/`gate.ts` byte-identical to main,
    `GATED_PREFIXES` + `config.matcher` untouched, all three new routes under `/app/*`, no
    secrets, `package.json` adds NO dependency, zero storage/cookie/network calls in the new
    modules, tokens+dictionaries purely additive, no dead `call-*` utilities, no arbitrary
    multi-layer shadow classes. Demo banners are genuinely present on all seven stub-fed screens
    in BOTH locales. Supervisor battery on the merge result: **152/152 · tsc clean · build green**
    with all three routes compiled and Middleware 81.8 kB intact. en 420 / he 420 dictionary keys,
    zero drift. The verified-authentic post-gate capture is good — you used the authed path.
  - **THE BLOCKER (fix first):** `WorkingDocument.tsx:143` renders "✓ Saved just now" /
    "✓ נשמר עכשיו" after every edit-and-blur while nothing is saved; `WorkspaceShell.tsx:190`
    says "Draft · saved just now" statically. You correctly refused localStorage — then the COPY
    claimed saving anyway. The demo banner disclaims invented *figures*, not lost *work*, so it
    does not cover this. Both gates found it independently.
  - **THE ONE THAT MATTERS MOST AFTER IT:** `WorkingDocument.tsx:26` — the fabricated Hebrew
    quote attributed to a NAMED executive of a real TASE issuer carries its only marker as
    hardcoded ENGLISH "— DEMO, invented quote" inside `SEED_HTML`. A Hebrew reader sees no
    הדגמה on the single most fact-shaped element on the branch, and because the marker sits
    inside `contentEditable` the user can delete it and it travels out through Export as PDF.
    Localize it via `DemoInline` and put it somewhere the user cannot edit away.
  - Remaining WARNINGs, all with repro steps in the queue: `__chat` opens a silent EMPTY pane
    from the panel's primary CTA (WorkspaceShell.tsx:159) · evidence §8 asserts a workspace
    side-chat + Pinge highlight-to-ask reuse that **does not exist in the code** (same
    written-from-memory class as the login-gate branch's false certification) · AgentDock "Save
    changes"/"Delete agent" have no `onClick` and the fields are unread `defaultValue`s
    (AgentDock.tsx:219) · Report targets duplicate → both radios fill + React duplicate-key error
    (agents/page.tsx:37) · `dir="ltr"` + `font-mono-num` forced onto a Hebrew SENTENCE so the
    build steps read in reverse (WorkspaceIntake.tsx:185, iron rule 5) · Export-as-PDF
    `window.print()` on an `h-screen`+`overflow-hidden` layout with no `@media print` rules
    clips to one page including the nav rail (WorkingDocument.tsx:160).
  - **SUPERVISOR FINDING, not the reviewer's:** `ChatComposer.tsx:156` — the pill's send button
    can never send. `onClick={onSend}` hands React's MouseEvent to `send(explicit?: string)`,
    which does `(explicit ?? input).trim()` → TypeError, swallowed by the async call. Enter works,
    the mouse does not. **This is NOT your regression** — main's tall composer has identical
    wiring, so mouse-send is already broken in Ask Atlas on main today. Fix the pill instance
    here; the root cause deserves its own small branch.
  - One NIT is load-bearing and worth grouping with the WARNINGs: the "stated reason" on three
    inert controls is a `title=` on a **disabled** form control, and Chrome never fires hover on
    those — so three of your declared gaps ("renders disabled with a stated reason") are only
    half-true in practice. `PillComposer.tsx:46` already does it right (title on the wrapper).
  - Two evidence NITs to sweep while you are in there: the Battery table at the TOP of the
    evidence still says 149/149 (true count on the shipped commit is 152/152), and
    `probe/surfaces-parity.json:36` records the Workspaces H1 as sans/600 when the shipped code
    is `font-display`/500 after the founder's serif call — a probe that disagrees with the code
    is worse than no probe.
  - What the gates liked: the demo-marking system is real work, not a checkbox — a component pair
    driven off the dictionary, present on every stub-fed screen in both locales. The failure is
    concentrated exactly where content is *hand-written into HTML* instead of going through it.

- [supervisor note 2026-08-01, SUPERSEDES the fix list above] **FOUNDER SCOPE CALL — THE LIST IS
  NOW 5 ITEMS, NOT 24.** Founder's words: *"everything the reviewer said we don't have code to is
  completely fine since this is only a frontend import, once you merge Lane M will build the actual
  backend on all of them."* Filed as a DECISION in cross-cutting 2026-08-01.
  **CLOSED — do not fix, do not re-verify, do not mention again:** Save changes / Delete agent
  having no `onClick` · the inert project composer, agent chat input and workspace side-chat · the
  `__chat` tab's empty pane · the file preview inviting a selection nothing handles. The founder
  also confirmed by screenshot that the new-workspace INTAKE screen renders correctly — that is
  `WorkspaceIntake` off the picker, a DIFFERENT path from the `WorkspaceShell` `__chat` tab, and
  the supervisor mis-stated nothing there: both screens exist, only the second is blank, and it is
  now closed by this decision.
  **FIX THESE FIVE, THEN IT MERGES** (founder chose "fix all 5, then merge"). None need a backend —
  every one is a label, a locale string, an attribute or a one-line handler:
  1. `WorkingDocument.tsx:143` — delete the `✓ {dict.workspace.docSaved}` confirmation, and
     `WorkspaceShell.tsx:190`'s static "Draft · saved just now". Nothing saves; the label must not
     say it does. If you want a status there, it must say what is TRUE (session-only).
  2. `WorkingDocument.tsx:26` — the fabricated Hebrew quote from a NAMED real TASE executive.
     Its `— DEMO, invented quote` suffix is hardcoded ENGLISH inside `SEED_HTML`, so a Hebrew
     reader gets no marker on the most fact-shaped element you shipped, and because it sits inside
     `contentEditable` the user can delete it and it rides out through Export as PDF. Render it
     through `DemoInline` (localized) and place it OUTSIDE the editable body.
  3. `src/app/app/agents/page.tsx:37` — Report targets flat-map every workspace's PDFs, so
     "2024 annual.pdf"/"2025 annual.pdf" appear twice; `CreateAgent.tsx:152` keys rows on
     `t.label` and `:149` selects by label equality, so one click fills BOTH radios and React logs
     a duplicate-key error. Key on a stable id, not the label.
  4. `WorkspaceIntake.tsx:185` — drop `dir="ltr"` (and `font-mono-num`) from
     `dict.workspace.buildingSteps`; it is a Hebrew SENTENCE and currently reads in reverse. Iron
     rule 5 scopes those to numerals and tickers only.
  5. `ChatComposer.tsx:156` — `onClick={onSend}` feeds React's MouseEvent into
     `send(explicit?: string)` → `(explicit ?? input).trim()` throws, swallowed. Use
     `onClick={() => onSend()}`. **Fix `:106` (the tall composer) in the same commit** — same file,
     same one-line change, and it is broken on main today, so mouse-send in Ask Atlas is dead for
     real users right now. Call it out in the evidence as a main-era bug you fixed in passing.
  **ALSO REQUIRED, not code:** the evidence file must stop ASSERTING code that does not exist —
  §8's "the workspace side-chat reuses the existing Ask Atlas component" and the Pinge
  highlight-to-ask reuse are not in the branch (nothing under `src/components/workspace` imports
  them). Not having built them is fine and now closed; the evidence CLAIMING them is the same
  written-from-memory defect that cost the login-gate branch four review rounds. Fix the stale
  Battery table too (`:15` says 149/149; the true count is 152/152) and either re-run or mark
  `probe/surfaces-parity.json:36`, which still records the Workspaces H1 as sans/600 when the
  shipped code is `font-display`/500 after the founder's serif call.
  **Then:** re-run the battery, re-verify the touched screens EYES-ON via the founder's
  authenticated Chrome profile (your old unauthenticated recipe expired with the login gate —
  assert the final URL, not just the pixels), push, and append a fresh HANDOFF to the ready queue.
  A fresh atlas-reviewer runs on the new tip; the other 15 NITs stay filed and carried.

## Lane I — ivrit-pipeline (branch feat/ivrit-pipeline · port 3002)
- status: [2026-07-04] M1 SHIPPED + REAL-ZOOM TEST PASSED WITH FOUNDER (2 rounds) —
  feat/ivrit-pipeline @ e2a8851 (18 commits): full live chain audio-only bot → ivrit chunks →
  karaoke → source end → auto finish → Gemini polish → finished call, founder-verified live.
  Round 1 exposed + fixed a latent BOTH-pipelines viewer bug (session mixing in stale tabs,
  2a98a83) and pulled the finish flow into scope per founder decision (e2a8851). 64 tests.
  Follow-up filed: tsconfig.scripts.json typecheck gap (scripts/** never tsc-checked, repo-wide).
- last verified: [2026-07-03] Task 8 quality comparator (scripts/compare-live-quality.ts) on the
  Task 7 full-archive run: ours 146 tok / Recall captions 106 tok / whole-file IVRIT ref 112 tok
  — agreement vs Recall 56.6% (41.1% of ours), vs whole-file-no-chunking 60.7% (46.6% of ours).
  Subjective read: divergences are mostly loanword-spelling variants (פרונטנד/פרונטנט/פונטנט) and
  differing repeat-counts on the "וואו"/thank-you filler loops in this repetitive smoke-test clip
  (chunk-boundary hallucination, not real content loss) plus one Recall-only Cyrillic-garbage
  artifact IVRIT didn't produce — no evidence chunking drops real content on this source. Numbers
  are noisy (only ~146 words on a 387s sparse clip) per design; full output in
  .superpowers/sdd/task-8-report.md (Atlas-ivrit worktree).
- next: await supervisor review/merge of feat/ivrit-pipeline → then M2 candidates (founder to
  prioritize): real-Zoom run via live-test · Gemini correction layer · diarization ·
  ws-reconnect + PCM memory (shared limitation with the Recall engine, bites on 2h calls)
- blockers: none (waiting on supervisor merge only)
- [supervisor note 2026-07-23] section stale: that merge happened 2026-07-04 (9c6f0e7+e06ca7a);
  lane PARKED by founder decision 2026-07-14 — see MISSION line. Section refresh happens at
  re-mission per the runbook.
- [supervisor note 2026-08-01] **RE-MISSION PROPOSED — FOUNDER HAS NOT CONFIRMED.** Candidate
  new mission: the MAYA/TASE integration for Workspace (founder connects Sunday 2026-08-02; a
  real documented API guide exists). Rationale: this seat's proven muscle is exactly that shape
  — external service → ingest → store, as built for IVRIT/RunPod — and the seat is free, so
  waking it costs Lane M nothing. Design note already agreed with the founder: use the Claude
  Agent SDK where something must NAVIGATE or DECIDE; a documented API gets a plain integration
  (saving model calls is an explicit founder goal). If the founder confirms, this needs the
  full re-mission runbook: brainstorm → spec → rewrite the 4 identity files (MISSION line,
  this section, the LAUNCH-KIT prompt, and archive/refresh state-ivrit.md) → relaunch.
  The seat's ORIGINAL parked mission (higher-quality transcripts, pending the founder's LLM
  study) is NOT cancelled by this — it would be deferred again.

## Lane M — multiview-backend (branch feat/multiview-backend · port 3003)

- [supervisor note 2026-08-01] ⚠️ **YOUR SUPABASE MCP IS BROKEN UNTIL THE FOUNDER GIVES YOU A NEW
  TOKEN.** The Supabase access token was rotated today and the old one REVOKED (a review subagent
  had read it out of `.mcp.json`; full incident in cross-cutting). Your worktree
  `C:/Users/Sagi/Desktop/Atlas-multiview` holds its OWN `.mcp.json`, last written 2026-07-16, so
  it still carries the dead token — `.mcp.json` is per-checkout, a rotation is not global.
  **When your Supabase tools say "Please provide a valid access token", that is a REVOKED token,
  not a missing one** — the exact misdiagnosis `.claude/rules/db.md` warns about. Ask the founder
  for the new value (the assistant may not read or write it), replace it in your worktree, `/mcp`
  reconnect, then **verify with a real query, not a health check** — `claude mcp list` ✓ only
  proves the server started.
  While you are here, two things landed on main today that change ground under your next chapter:
  `docs/DATA-MODEL.md` (shared corpus vs personal layer — company data is one copy for everyone,
  only what a user MAKES is user-scoped) and the "Ownership law" section in `.claude/rules/db.md`
  (every new user-facing table: real FK to `auth.users`, RLS, owner policy on both USING and
  WITH CHECK, index). Read both before designing the Projects/retrieval tables.
- status: [2026-07-14] SESSION 1 LIVE — .env.local seeded by founder, npm install done
  (pdfjs-dist 5.4.296 via pdf-parse ^2.4.5). DAY-ONE SPIKE DONE, VERDICT: **QUIRKS — no
  fallback needed.** demo-report.pdf (Tigbur Q1-2026, 31pp, Aspose.PDF 22.10 producer):
  pdf.js getTextContent gives Hebrew in CORRECT logical order at word level (no reversed
  glyphs, no garbled bidi). Quirks: (1) within-line stream order occasionally swaps a
  segment — FIXED in spike by y-grouping + descending-x RTL sort with LTR-run handling
  (verified: the swapped "לשנה" line reassembles correctly); (2) digits fragment ("30"→
  "3 0", "% 50" for 50%) + hyphenated refs need punctuation-neutral run logic — minor,
  fixable; (3) table pages jumble (multi-column cells interleave by line) — inherent to
  PDF text extraction, acceptable: chat context centers on prose, rendered pdf.js view
  positions text absolutely regardless. Spike scripts in session scratchpad; algorithm
  will land in the real extraction module with tests.
- last verified: [2026-07-16] M1 SHIPPED TO READY QUEUE — feat/multiview-backend @ 47ac911
  (17 commits over origin/main, range 473fe7b..47ac911, pushed; merged origin/main in).
  MILESTONE 1 VERIFIED EYES-ON via Chrome MCP on :3003: migration 20260714_012 APPLIED to
  the shared DB + Tigbur demo report SEEDED (31/31 pages) → real PDF renders in the Report
  pane (dark+light, paper-white pages, RTL/bidi correct incl. financial tables) → Hebrew
  drag-selection inside the PDF seeds Ask Atlas with the passage → streamed answer opens
  "על פי הקטע המסומן בדוח הדירקטוריון" and lists the marked segments → console clean.
  Battery post-merge: 86/86 · tsc · build. THREE live-run-only bugs found+fixed during
  verification (companies.ticker→tase_security_id · webpack-mangled pdfjs→native import
  from public/pdf.min.mjs · pdf.js buffer-transfer detaching the upload array→0-byte PDF,
  + hour-long cache pinning it→no-store). Evidence:
  docs/evidence/feat-multiview-backend/2026-07-16-m1-e2e-verification.md.
- next: [2026-07-17] PINGE SHIPPED TO QUEUE — feat/pinge @ ff4c8f9 (11 commits stacked on
  feat/multiview-backend@75d198d, pushed; review multiview first). Same-day full cycle:
  founder brainstorm → spec → 9-task TDD plan → build → verify. Snip-to-chat: scissors on
  the Report pane → drag-rect → zoom-proof 2x offscreen PNG crop → ≤4 thumbnail chips in
  Ask Atlas → Gemini reads the table pixels (real e2e: streamed answer cited page 6 and
  read the exact digits) + marking-UX unified (button-first when chat closed, auto-ref when
  open — text+snips, finished+live). 99/99 tests (13 new) · tsc · build · console clean.
  One verify-found bug fixed (setPointerCapture guard). Evidence:
  docs/evidence/feat-pinge/2026-07-17-pinge-e2e-verification.md. Founder one-look: real-hand
  drag feel + dark-theme polish + audible playback of the Q1 call (carried over). Earlier
  rounds context: r2/r3/r4 all closed and queued (ADDENDA 2-5 @ 75d198d). Next after merge:
  founder's layer 2 (call-view frontend polish) + layer 3 (smarter Ask Atlas), then Slides
  pane; future context-intelligence layer noted in the Pinge spec (instrumentation points).
- [2026-07-23] PINGE MERGED (2d6d409, founder one-look PASSED "works amazingly") →
  WARNINGS-FIX SHIPPED TO QUEUE — fix/review-warnings @ af0f08d (4 commits over
  origin/main@3e7f0d5, pushed): all 6 earmarked reviewer WARNINGs fixed (empty-history
  Gemini poison → sanitizeHistory client+server, TDD; live-view snip toast; oversize-snip
  client refusal + snipTooBig toast; pdfjs-dist pinned 5.4.296 direct; stub-report demo
  pill both locales; process-WARNING lesson filed). Battery 104/104 (5 new) · tsc · build ·
  eyes-on :3003 (real-PDF path intact, poison-history probe vs real Gemini = no fallback,
  badge dark+light). Evidence: docs/evidence/fix-review-warnings/2026-07-23-warnings-verification.md.
  NOTE: founder is importing a NEW app-wide design round via Lane F today (Ask Atlas panel,
  colors/typography, call-view UX) — merge this small branch BEFORE the import lands
  (same surfaces: chat panel, call views, FacetPanes).
- [2026-07-23 late] fix/review-warnings MERGED → main (78af6fe, docs 48add5e; reviewer
  ZERO findings). CHAPTER CLOSED — nothing in flight for Lane M: multiview M1 + Pinge +
  the 6-warning sweep are all on main. Worktree parked on the merged fix/review-warnings
  branch; :3003 dev server stopped at session end. Next chapter = founder's layer 2
  (call-view polish) → layer 3 (smarter Ask Atlas) → Slides pane, and per DECISION
  2026-07-23 03:16 it starts only AFTER Lane F's new design round merges (the import
  restyles Lane M's surfaces); begins with a founder brainstorm per rules.
- blockers: gated on Lane F design-round merge (founder decision 2026-07-23) — seat idle
  until then; fresh session should branch off updated main when the gate opens
  → **[supervisor note 2026-08-01] GATE IS OPEN.** feat/design-round-2 merged to main
  (`e977823`). Branch a fresh chapter off updated main — and read the SHARED-SURFACE ALERT in
  cross-cutting 2026-08-01 first: the call views are LIGHT now, the theme cycle and the 8
  call-* Tailwind aliases no longer exist, and `floatLine`/`border-float-line`/`rounded-win`
  are the new pane-float tokens. Lane M's own surfaces (FacetPanes, TranscriptChatPanel,
  LiveTranscriptView) were restyled by that merge. NOTE: the founder may re-mission this seat
  to the Workspace/Agents/Projects backends instead of layer 2 — not yet decided.
- [supervisor note 2026-07-23] feat/pinge MERGED → main (2d6d409, docs 51f3fff, pushed);
  reviewer APPROVED 0 blockers / 4 WARNING / 4 NIT (filed in ready-queue — headline: snip-only
  send poisons follow-up history with an empty Gemini text part; client never pre-checks the
  2MB attachment cap). Fix-forward WARNINGs + the multiview pair (pdfjs-dist direct dep,
  stub-report demo marker) = Lane M next-chapter intake. Branch feat/pinge stays checked out
  in the worktree until the seat's next chapter.
- [supervisor note 2026-07-17] MERGED → main (2c2b464, docs ca36278, pushed): reviewer APPROVED
  0 blockers / 2 WARNING / 4 NIT (filed in ready-queue — headline: pdfjs-dist undeclared as
  direct dep; stub-report fallback on fetch error lacks demo marker). Lessons graduated
  (marker in state file). Branch stays checked out in the worktree for the seat's next
  chapter (Pinge brainstorm, fresh session). Remaining founder item: audible-playback
  one-look of /app/live/PyuMxe88e8g_live.
- [supervisor note 2026-08-01] **NEXT CHAPTER PROPOSED — FOUNDER HAS NOT CONFIRMED: the
  RETRIEVAL FOUNDATION + the Projects backend.** Rationale: this seat owns the chat/app-data
  surfaces, and retrieval is the floor under all three new features (see MISSION strategy §2).
  Concretely: `vector` 0.8.0 is available in the existing Supabase — CREATE EXTENSION is
  additive and allowed, but it lands on the instance SHARED with production Timlul, so it goes
  through cross-cutting first. Spike HEBREW embedding quality on the 60-transcript corpus
  BEFORE committing to a design; evaluate `pgroonga` + `pg_trgm` alongside embeddings rather
  than assuming vectors win. This competes for the seat with the queued layer-2 call-view
  polish → layer-3 smarter Ask Atlas → Slides pane; the founder chooses. Either way the
  chapter starts with a founder brainstorm per rules. NOTE for whichever chapter wins: Lane F
  is restyling the chat panel THIS CHAPTER (Projects lives inside it) — coordinate before
  touching ChatView/TranscriptChatPanel.

## Supervisor (main checkout · port 3000)
- status: [2026-08-01 17:23] **REVIEWED Lane F chapter 3 (`feat/surfaces-import` @ bf9693a) —
  VERDICT CHANGES, NOT MERGED.** main still at `7cad8b8`, clean, in sync. Two gates: atlas-reviewer
  (cold) + my own pass → **24 findings, 1 BLOCKER · 8 WARNING · 15 NIT**, filed line-by-line to the
  ready queue at `[2026-08-01 17:23]`, fix list appended to Lane F's board section. Battery run on a
  throwaway merge-preview branch (main was never touched): 152/152 · tsc · build green. Lane F was
  LIVE during the review (commit 17:01, board 17:02) — reviewed from my own checkout, never entered
  its worktree, never touched :3001. Structure is clean and I verified it rather than trusting it
  (scope lock real, gate untouched, no new dependency, zero persistence); the branch fails on
  HONESTY OF SURFACE: a working document that says "Saved just now" while saving nothing, and a
  fabricated Hebrew quote attributed to a NAMED real TASE executive whose only DEMO marker is
  hardcoded ENGLISH inside `contentEditable`. **MY OWN MISS, recorded because it is the useful
  part:** I opened that exact Hebrew screenshot, saw `— DEMO, invented quote`, and certified the
  marker as adequate — without noticing it was un-localized on the one element most dressed as
  sourced fact. The cold reviewer caught it. Reading a screenshot is not verifying a marker; the
  check is "does this element's marker come from the dictionary", which is a grep, not a look.
  I also hand-typed "6 WARNINGs" to the founder when the reviewer had filed 7 — corrected from a
  grep. The counts-come-from-a-command rule exists because I keep proving it.
  ONE FINDING WAS MINE, not the reviewer's: mouse-send is broken in Ask Atlas **on main today**
  (`onClick={onSend}` feeds a MouseEvent to `send(explicit?: string)` → `.trim()` TypeError,
  swallowed); Enter works, which is why every verification pass missed it. Filed as a 🔴 ALERT to
  Lane M in cross-cutting with the general trap (an optional-first-param handler passed straight to
  onClick type-checks fine and fails at runtime). Merge counter still **2** since the 2026-07-23
  LINT — nothing merged this round, so no lint due.
  Previous status below:
- prior: [2026-08-01, overnight] **LOGIN GATE MERGED → main (`f05b659`, docs `7cad8b8`, pushed).**
  `/app/*` + `/print/*` require a session; `/print/[id]` had been serving whole transcripts to
  anyone with the URL, and `GET /api/live/finished-call/[id]` served the identical payload so it
  was closed in the same branch. FIVE reviewer rounds, 38 findings, all in the queue. Battery on
  merged main 125/125 · tsc · build. The reviewer found 3 BLOCKERs in MY code — an open-redirect
  guard defeated by backslash/tab smuggling, the /print leak still reachable via API, and an
  evidence file certifying as safe a route whose auth does not verify — plus a `javascript:`
  scheme redirect and a chained-proxy value that made `new URL()` throw INSIDE middleware (500 on
  every gated route). Every one reproduced before fixing. Sending my own work through the same
  two gates as a lane's is now proven, not a principle.
  **ZERO code defects survived; the DOC SWEEP FAILED FOUR TIMES** — I kept editing the files I
  remembered. Both rules graduated into /ship: grep the FALSIFIED CLAIM across tracked docs AND
  `agent-memory/` (git-ignored = blind to the birth documents), counts come from a command; and
  when a merge invalidates how another lane VERIFIES, push it to that lane the same session.
  Merge counter = 2 since the 2026-07-23 LINT (threshold 3, no lint due).
  **NEXT, and it is the real one: `getSession()` believes the cookie** — three call sites to
  `getUser()`, its own branch, founder wants to be awake for it. Also owed: `.env.example` needs
  `NEXT_PUBLIC_SITE_HOST` added BY THE FOUNDER (`.env*` is hook-blocked for me) or login is
  unreachable on deploy; and the founder's devops questions, raised 2026-07-31, still never asked.
  Previous status below:
- prior: [2026-08-01] **NEW CHAPTER OPENED — Projects · Workspace · Agents.** Founder
  brief filed (`docs/product/2026-08-01-...-brief.md`, commit `09cede5`), his 5 decisions filed
  to cross-cutting, strategy written into the MISSION section above, Lane F's LAUNCH-KIT prompt
  rewritten for chapter 3 (a fresh session is born from that file — it had to move before the
  founder started). Infrastructure checked against the live Supabase, not assumed: pgvector,
  pgmq, pg_cron, pgroonga all AVAILABLE and uninstalled — the approved vector DB needs no new
  service. MY OWN QUEUE: (1) the `/app/*` + `/print/*` PAGE gate — **BUILT 2026-08-01** on
  `fix/app-login-gate` (5 review rounds, 33 findings; `/print/[id]` had been serving whole
  transcripts to anyone with the URL). Its successor is the REAL item: `getSession()` believes
  the cookie, so `getRequestUserId`/`getCurrentUser`/`requireAdmin` are gated in intent only —
  switch all three to `getUser()`, founder wants to be awake for it; (2) the DEPLOY + CI question, which
  stopped being optional the moment the founder said agents run on a server. Atlas has never
  been deployed; `nixpacks.toml` is the only deploy-adjacent file and the old Timlul repo's
  Railway setup is the nearest prior art. ALSO OWED: the founder's original devops questions
  were raised 2026-07-31 and STILL never actually asked — surface them.
  SELF-CORRECTION (2026-08-01): a board edit of mine silently ate the `## Lane I` heading,
  merging that whole section into Lane F's until a heading count caught it. agent-memory/ is
  git-ignored — there is NO history to restore from. Lesson: when an Edit's old_string spans a
  section boundary, re-include the boundary line in new_string, and verify headings after
  structural edits to this file.
- prior: [2026-08-01] **feat/design-round-2 MERGED → main (`e977823`, docs `9987155`, pushed)**
  after a two-round review. Round 1 CHANGES (1 BLOCKER / 7 WARNING / 6 NIT, all filed); founder
  resolved the 3 founder-call items (rail contrast → pass AA at #85817A; Agents restyle KEEP;
  mic button KEEP); Lane F fixed all 14 + closed both carried residuals; round 2 APPROVED.
  Battery on merged main 108/108 · tsc · build. Merge counter = 1 since the 2026-07-23 LINT
  (threshold 3, no lint due). Lane M's gate is now OPEN.
  TWO LESSONS TO GRADUATE (not yet done): (1) the supervisor must detect a live lane session
  ITSELF before touching anything in another worktree — "is that port leftover?" is a question
  the founder cannot answer, and I killed a live dev server on that answer; the tell is a branch
  commit newer than the board's last-verified line. → ship skill, pre-merge step. (2) a stale
  `.next` owned by a running dev server fails the ship battery's `npm run build`, not just dev
  — the ship skill's battery step should say so. → ship skill + verify-app already has the
  kill-stale-dev-server step to point at.
  NEXT UP: founder's product-direction brainstorm — three new designed pages (Workspace, Agents,
  Projects-in-chat) + real backends. Supervisor recommendation filed in cross-cutting 2026-08-01;
  founder has NOT yet chosen sequencing or lanes.
  PREREQUISITE — HALF DONE: the PAGE gate is built on `fix/app-login-gate` (`/app/*` + `/print/*`,
  the latter was serving whole transcripts to anyone with the URL). What still blocks the three
  backends is that API auth is NOT verification-strength: `getRequestUserId`/`getCurrentUser`/
  `requireAdmin` use `getSession()`, which reads the user out of the cookie with no signature
  check, and the routes then query with the service-role client — so RLS is worth nothing if the
  user id is attacker-supplied. Switching those 3 call sites to `getUser()` is the next branch
  and the top security item (rules/app.md 🔴 entry; V1-SECURITY-AND-LAUNCH-NOTES item 0).
  Superseded detail below:
- prior: [2026-07-23 03:15] TWO MERGES + LINT this session. (1) feat/pinge → main (2d6d409,
  docs 51f3fff). (2) fix/review-warnings → main (78af6fe, docs 48add5e) — reviewer ZERO
  findings; all 6 earmarked WARNINGs (4 pinge + 2 multiview) are now FIXED on main; battery
  104/104 · tsc · build on branch AND merged main. /fleet-lint ran at the 3-merge counter
  (LINT line 2026-07-23 in cross-cutting: 5 fixed inline, 1 filed; counter reset). Supabase
  token seeded to main checkout + verified live — 07-02 item CLOSED. NEXT UP: founder decides
  who takes the app-wide design round (supervisor recommends Lane F + warns: refresh the
  stale LAUNCH-KIT Lane F prompt via the re-mission runbook BEFORE relaunch) · Lane M next
  chapter brainstorm (layer 2/3, Slides) · meta-review cold audit due within a merge or two.
  Superseded detail of the pinge merge below:
- prior: [2026-07-23] MERGED feat/pinge → main (2d6d409) + docs commit (51f3fff), PUSHED.
  Two gates ran: atlas-reviewer APPROVED (0 blockers / 4 WARNINGs / 4 NITs — all filed as
  FINDINGs in ready-queue; reviewer re-ran battery itself 99/99 + tsc, hand-checked crop
  math + auth gate + additive wire shape) + supervisor battery independent (99/99 · tsc ·
  build — in the worktree @ ff4c8f9 AND on main post-merge). Merge-time truth done: PROGRESS
  entry, ARCHITECTURE catch-up (chat/attachments.ts, documents/snip.ts, PdfViewer snip
  overlay, 99-test list), pinge spec+plan stamped SHIPPED, e2e evidence committed. Reviewer
  cross-cut gap (ChatInput attachments not pre-logged) remedied with a retroactive TYPES
  line. Lint counter: 2 MERGEs since last LINT (07-14) — /fleet-lint due at the NEXT merge.
  Lane M next-chapter intake: 4 pinge WARNINGs + 2 multiview WARNINGs (pdfjs-dist direct
  dep · stub-report demo marker). TIMELY: founder finishing a NEW app-wide design round
  (Ask Atlas panel, colors/typography, call-view UX) — pinge was merged first deliberately
  so the redesign lands on a clean base; expect a design-import chapter next. Open founder
  items: Supabase token rotation for the main session (from 07-02). Supervisor session may
  be restarted fresh anytime — everything lives in files.
- merged to main recently: feat/pinge · feat/multiview-backend · chore/environment-audit-fixes ·
  feat/frontend-import+feat/design-parity · feat/ivrit-pipeline · feat/knowledge-compounding
