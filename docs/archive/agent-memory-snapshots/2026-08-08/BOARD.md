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
1. **UI FIRST — ✅ DONE, merged 2026-08-01.** All three surfaces imported in ONE Lane F chapter,
   stub-fed and demo-MARKED, no backends. A wrong page costs an afternoon; a wrong table costs a
   migration dance on a DB shared with production, where in-place renames are forbidden. And
   seeing all three rendered together is how the real data model gets discovered — which is
   exactly what happened: `docs/DATA-MODEL.md` came out of this.
   **[supervisor 2026-08-08] "They persist NOTHING" was true when written and is now FALSE for
   two of the three** — Projects backend merged 2026-08-02, Workspace V1 + the MAYA layer merged
   2026-08-08. **Agents is the one that still persists nothing** and still carries its
   `DemoBanner`; it needs the deploy. The warning the line ended on survives intact and applies
   to the two that DO have backends: *do not read "the route exists" as "the feature works"* —
   on this very branch a project page had never rendered once behind a green battery, and the
   workspace intake announced a pull of nothing for two review rounds.
2. **RETRIEVAL IS THE FLOOR, and it is not yet scheduled by anyone.** The brief's own example
   ("which companies talked about M&A last quarter?") spans the whole archive, while
   `getChatContext()` loads exactly ONE transcript at 40k chars — it would answer confidently
   and wrongly, the silent-degradation class in rules/app.md. Founder approved a VECTOR DB;
   `vector` 0.8.0 (pgvector) is AVAILABLE in the existing Supabase, so this needs NO new
   service. Real open risk = HEBREW embedding quality, not infrastructure → spike it first.
   Also available and free: `pgmq` (agent job queue), `pg_cron` (scheduled runs), `pgroonga`
   (multi-language full-text, worth evaluating ALONGSIDE embeddings).
3. **BACKENDS ONE AT A TIME**, never in parallel — one shared production DB, one shared types
   file. **ORDER REVISED 2026-08-01 by founder decision: PERSISTENCE + OWNERSHIP FIRST, THEN
   retrieval.** (It previously read "retrieval → Projects → Workspace → Agents"; that ordering
   is superseded.) Why the change: ownership columns are free at `CREATE TABLE` and a backfill
   dance on a live shared database afterwards, so the schema cannot wait — whereas retrieval can
   be added behind an interface at any time. It also unblocks the founder's own judgement, since
   a surface that forgets everything on reload cannot be evaluated. Only hard dependency in the
   brief: Agents → Workspace. Projects is independent and can ship any time. (These three are
   SIBLINGS, not a hierarchy — an earlier supervisor assumption that a workspace contains
   projects was wrong and is corrected here.)
4. **AGENTS RUN ON A SERVER** (founder: "they live on the product") ⇒ DEPLOY + CI is a
   dependency of the Agents feature, not a someday item. Atlas has never been deployed.
5. **AUTH — the backend-blocking half is DONE (2026-08-02).** PAGE gate 2026-08-01
   (`src/middleware.ts`: `/app/*` + `/print/*`); `getSession()` → `getUser()` across all five
   call sites with the Projects backend — `git grep "auth\.getSession()" -- src` returns
   nothing, so RLS now sits behind a real verified user and per-user backends are unblocked.
   **✅ AND THE DEPLOY-BLOCKING HALF IS DONE TOO — MERGED 2026-08-03, `fix/api-security` →
   main `164c892`, pushed.** Every API handler now requires a signed-in user and
   `src/lib/apiAuthBoundary.test.ts` fails the battery for any that does not. Verified in a real
   browser in BOTH directions — anonymous 401, signed-in 200, `POST /api/chat` answering in
   Hebrew. The old list here said "five routes"; the command said **16 `DEMO_USER_ID` sites
   across 8 files** plus three methods with no auth at all. Evidence:
   `docs/evidence/fix-api-security/2026-08-03-api-auth-boundary.md`. **What auth does NOT close,
   so nobody reads this as launch-ready:** `/api/chat` still has no rate limit or size cap and
   `getChatContext` still falls back across ALL companies (now any-member rather than anonymous);
   `GET /api/live/{state,pcm}` stay open by dated exception (localhost-only engine — revisit
   before LIVE deploys); and every `lib/db` module except `projects.ts` still queries through
   `supabaseAdmin`, which bypasses RLS.
6. **"Better LLM reasoning / tool-calling" is a CONSTRAINT in every spec, not a scheduled
   phase** — phases like that get squeezed and never arrive. Use the Agent SDK where something
   must navigate or DECIDE; a documented API gets a plain integration (founder: saving model
   calls is an explicit goal). Cheap structured filtering first, expensive calls on survivors.

- **🪙 SEQUENTIAL MODE — founder decision 2026-08-03, and it governs everything below.**
  "i want us to start working in a token saving environment… firstly on lane M work on
  workspace. than when we are done we will move to railway. regarding security - finish
  securing what you started." ONE lane session is open, not three. Order: Workspace → Railway,
  with api-security finished alongside by the supervisor because it is already half-done and is
  Railway's prerequisite.
- **Lane S** (the `Atlas-frontend` seat, :3001) → **⏸️ HELD, NOT OPENED.** Its api-security
  prompt was written in full on 2026-08-03 and held the same day when sequential mode was
  chosen; the brief survives inside `docs/LAUNCH-KIT.md` (five holes by `file:line`) but the
  seat runs nothing. Prior chapters as Lane F, all shipped — three-surfaces import ✅ 2026-08-01 ·
  design round 2 "Harvey" ✅ 2026-08-01 (`e977823`) · first import ✅ 2026-07-14 (`69a98be`).
- Lane I → PARKED since 2026-07-14. Its proposed MAYA/TASE re-mission is **deferred, founder
  2026-08-03: "the tase data sales is not important now, we know we can sell it."** The blocker
  was never technical. Seat stays free; the re-mission runbook applies when it is taken up.
- Lane M → **WORKSPACE BACKEND, chapter 2** (opened 2026-08-03; live on `feat/workspace-tables`,
  spec + 11-task plan committed). Chapter 1 (Projects) ✅ merged 2026-08-02 across two merges: real
  tables under the ownership law, four API routes, project-scoped chat, and the `getSession()` →
  `getUser()` fix. **Its debt round `fix/projects-honesty` ✅ merged 2026-08-03 by the supervisor,
  who took the fix round so this seat did not have to stop** — ⚠️ **main moved; take it before
  building further.** Three of its changes touch files a Workspace chapter opens (`ChatMsg` gained
  two optional fields; `handleResponse()` is now the only place allowed to decide what a failed
  request throws; a new guard fails the battery on an unregistered test file). Detail + the
  corrected merge instruction: the 2026-08-03 ALERT in `cross-cutting.md`. Still queued for this
  seat behind Workspace: its original depth mission (reports+slides beside the transcript, markable +
  Ask-Atlas-able), the retrieval foundation, and agent definitions.
- Supervisor → **merge desk, under sequential mode. API-SECURITY IS DONE and so is the Projects
  debt round.** Auth PAGE gate ✅ 2026-08-01 (`fix/app-login-gate`) · API-auth backend half ✅
  2026-08-02 · `fix/api-security` ✅ merged 2026-08-03 (`164c892`) · **`fix/projects-honesty` ✅
  merged 2026-08-03 (`af85deb`, pushed)**. Battery on merged main **229/229 across 37 files · tsc
  exit 0 · build green · Middleware 81.8 kB**. `feat/workspace-backend` DELETED (local + remote;
  both tips verified contained by command first). ~~**NEXT: Railway** — the last thing before it is
  nothing.~~
  - **[2026-08-07] SUPERSEDED — RAILWAY IS NO LONGER NEXT.** The founder restated the plan to this
    session today, and it is now FOUR phases: (1) he + the multiview lane finish **Workspace V1 +
    the MAYA integration TODAY**, then he hands it to the supervisor for review + merge to main;
    (2) **MAYA across the WHOLE product** — a database of many companies, company search + a real
    company profile, the calendar showing genuinely upcoming investor calls, and chat answering off
    that database (*"this API connection will be in sync with our database … basically a fully
    functioning app"*); (3) **THEN Railway** — *"take what we have and push it to Railway to host it
    on the web"*, Atlas's first deploy ever; (4) then iterate on Workspace. So product-wide MAYA now
    sits between the Workspace merge and Railway. Sequential mode still holds — one lane live.
    **The supervisor's job right now is to WAIT for the founder's hand-off**, not to start reviewing
    `feat/workspace-tables`. Flagged early because it lands in phase 2: the calendar is the recorded
    trigger for the deferred MAYA rate-limit priority queue (10 req/2s is ONE budget across all
    users and all four consumers).
  - **The founder assigned the projects-honesty fix round to the SUPERVISOR, not Lane M**, because
    Lane M had already branched `feat/workspace-tables` and interrupting a live lane cost more.
    Four cold `atlas-reviewer` rounds; the no-self-review rule held throughout. **Three of the four
    found a BLOCKER in the supervisor's own work; the fourth found none** — that convergence is why
    it merged, and the founder made the call with that trend in front of him.
  - **Two guards were added and each was proven to FAIL on the bug it guards before being trusted**
    (`api/errorShape.test.ts`, `testRegistry.test.ts`). The first version of the first one PASSED on
    the reintroduced bug because it matched `ApiError` inside a comment — the same defect
    `apiAuthBoundary.test.ts` had been fixed for days earlier.
  - Still owed fleet-wide, unchanged by this chapter: real feeds for the stub modules + the fake
    "Q2 2026" Home tag; `ready-queue.md` compaction (now ~920 lines, well past its threshold).
  - **Filed, not fixed, and it is the next honest chat item:** `/api/chat` fabricates an answer at
    THREE sites when the model returns nothing or is unconfigured (one Hebrew for any locale, one
    English for any locale), and the server cannot tell the client a stream ended early — the token
    cap ends it with a clean close and nothing checks `finishReason`. Remedy + why it was not
    attempted at round four are in `ready-queue.md`.
Every lane: if a step doesn't serve its line above, flag it before building.

## Lane S — api-security ⏸️ HELD (seat: Atlas-frontend · branch fix/api-security · port 3001)

- **[supervisor note 2026-08-03] HELD BEFORE IT EVER OPENED — the SUPERVISOR carries this
  brief.** Written in the morning when the founder asked for api-security to get its own seat;
  held the same day when he chose sequential/token-saving mode (Workspace → Railway, one lane
  live). No session was ever started here. **Everything below is still the work** — the five
  holes were verified by command on main, and the supervisor executes exactly this list on its
  own branch. If the founder reopens a parallel seat, this section and the LAUNCH-KIT prompt
  are ready to paste as-is; until then treat it as the security brief, not as a live lane.
- **[supervisor note 2026-08-03] SEAT RE-MISSIONED. You were Lane F; the three-surfaces chapter
  merged 2026-08-01 and that mission is closed.** New mission: close the API-auth half, then put
  Atlas on the internet for the first time. Your opening prompt in `docs/LAUNCH-KIT.md` is
  rewritten — the founder pastes it into this session; everything below this block is the
  previous chapter's record, kept as history, NOT as instructions.
  - **The worktree is still on the merged `feat/surfaces-import`, and a dev server may still be
    running on :3001.** Branch off main and restart the server before anything.
  - **[supervisor note 2026-08-03] ✅ CHAPTER 1 IS DONE — the supervisor executed this list on
    `fix/api-security` @ `438ee97`.** The list below stands as the record of what was open, with
    one correction it earns: item 5 said the `DEMO_USER_ID` fallback was in two routes; the
    command found 16 sites across 8 files. Chapter 2 (Railway) is unstarted and comes after Lane
    M's Workspace chapter per the founder's sequencing.
  - **Chapter 1 — the five holes**, all verified by command on main 2026-08-03, not copied from
    a doc: `POST /api/chat` (`route.ts:147` — only resolves a user when a file is attached, so a
    plain question is anonymous; ALSO `getChatContext` falls back to the most recent transcript
    across ALL companies, readable through the model) · `POST /api/live/finish` (no auth, spends
    money per call, and is called by the live pipeline — read `rules/live.md` before gating it,
    a cookie check may break live) · `PATCH /api/transcripts/[id]/speakers` ·
    `PATCH /api/transcripts/[id]/diarization` · the `DEMO_USER_ID` fallbacks in
    `/api/calls/follow` and `/api/conversations`.
  - **OUT OF SCOPE, flag never fix:** the `public.profiles` / `access_requests` always-true RLS
    policies. Destructive, hook-blocked, and the DB is shared with deployed production Timlul.
  - **Chapter 2 — Railway, only after chapter 1 merges.** `nixpacks.toml` already exists.
    `NEXT_PUBLIC_SITE_HOST` must be set or the gate redirects users to `localhost:8080` and
    login is unreachable (`src/middleware.ts:43`); it is missing from `.env.example`.
  - **The bar for this chapter is BOTH directions:** signed-in passes AND anonymous is refused.
    The anonymous 401 is the deliverable, so capture it. You can verify gated routes — the
    Chrome MCP drives the founder's signed-in browser.

## Lane F — surfaces-import (branch feat/surfaces-import · port 3001) — CLOSED CHAPTER, history below

- [supervisor note 2026-08-01] **CHAPTER 3 MERGED TO MAIN.** `fix/surfaces-export-marker`
  (which carried `feat/surfaces-import` unchanged plus two supervisor fix rounds) merged at
  `fd2238b`; doc truth at `73b3d36`; main battery 160/160 · tsc · build green. The reviewer
  APPROVED round 3 with 3 WARNING + 4 NIT, all fixed before merge (`975dec7`) — findings are in
  the ready queue. **Every status line BELOW this one is now history, including the LAUNCH-KIT
  prompt this seat was born from: that chapter is closed.** The seat still holds
  `feat/surfaces-import` in the Atlas-frontend worktree, so the branch was deliberately NOT
  deleted. Next mission is unassigned and needs a founder brainstorm before any code.

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

## Lane M — workspace-backend (branch feat/workspace-tables · port 3003)

- **status: [2026-08-08 18:20] ROUND 2 ANSWERED → RE-SHIPPED @ `b7b5df9`, awaiting a third gate.**
  Range `ab6a1ea..b7b5df9` = 3 commits, **11 files / +1105 / −134**. Whole branch **68 commits**
  (`b495c87..b7b5df9`). Battery pasted: **556 pass / 0 fail** (was 545) · tsc exit 0 · build green
  (dev stopped + `.next` cleared first). Full write-up: `ready-queue.md` [2026-08-08 18:20].
  - **The BLOCKER, the 4 WARNINGs and both NITs are closed, and the structural note was taken:
    the fix is two INVARIANTS, not a longer word list.** (a) new `lib/workspace/intake/respond.ts`
    makes `ready` + empty selection unrepresentable — its own module so it is unit-testable, and a
    CHOKE POINT because the route had FOUR exits and a check on the failing one would have passed
    review and left three; a source guard fails the battery if a second envelope appears.
    (b) `resolveSelection` returns `{ ids, conflict }` so a caller cannot read a detected
    disagreement as ordinary emptiness. Both new guards PROVEN to fail on the bug they guard.
  - **W1 was worse than filed, and the extra half is the dangerous one.** It was filed against
    `agreedToStandingSet`; measuring found every one of those strings was ALSO a bare agreement —
    `isBareAgreement('is that right') === true`, same for `'you sure'`, `'ok is that all'` — and
    THAT path attaches the standing set with no model call and no set comparison behind it.
  - **W2's lesson, which is the one worth carrying:** round 1 fixed this function by COPYING
    `isBareAgreement`'s closed vocabulary, and the copy was the error. One runs INSTEAD of a model,
    the other AFTER one returned a set that must equal the one already on screen — different
    obligations, so a shared word list was a category error that read as tidiness.
  - **⚠ FOUND WHILE VERIFYING, FILED NOT FIXED — the next session on intake must read this first:**
    **the standing proposal is not durable in practice.** 6 consecutive turns on a proposal of 3:
    **6/6 substituted a file, 5/6 shrank 3→2.** Atlas's sentence named three documents; two were
    stored, the first a DIFFERENT file from the one just named — and the next bare "כן" pulls that
    stored set verbatim without a model. **The founder's original 2026-08-04 complaint through a
    door nobody has looked at.** Pre-existing on the `clarifying` path. Not fixed because the fix
    means deciding when a model selection may replace a standing set — the exact question the
    round-1 blocker turned on, and re-introducing conditional merging at the end of a fix round is
    how the last two rounds each opened a door.

- **status: [2026-08-08] CHANGES ANSWERED → RE-SHIPPED, `feat/workspace-tables` @ `ab6a1ea`
  PUSHED. AWAITING RE-REVIEW.** This round `ce64342..ab6a1ea` = 3 commits, 7 files, +637/−101;
  whole branch `b495c87..ab6a1ea` = **65 commits**. Battery **545 pass / 0 fail** (was 536) ·
  tsc 0 · build green. Queue entry [2026-08-08 14:40]; evidence
  `docs/evidence/feat-workspace-tables/2026-08-08-review-round-intake-cluster.md`.
  - **THE BLOCKER HAD THREE DOORS, and only one was filed.** Fixing the union at `ready` was
    correct and not sufficient: proving it in the browser showed the same harm — a narrowing
    reverted, declined filings fetched into the SHARED corpus — reachable two more ways. (2) the
    model narrows in PROSE and not in ids, so the empty-selection fallback restored all three
    under a reply naming one, and when it did return ids it returned all three anyway. (3) THE
    ROOT: `lastProposal` SKIPPED assistant turns that proposed nothing, so clearing the set was
    pointless — two turns later the lookup found the discarded three and `ready` came out holding
    them. **A fix that is verified only at the layer it was written in is not verified.**
  - **Proven live, four flows, same corpus:** narrow-then-yes → ready with **1** file (was 3) ·
    plain "כן" → still 3 (no regression on the 2026-08-04 complaint) · "כן, אבל תוסיף גם" → 4 ·
    the narrowing turn's standing set → 0.
  - **The review's diagnosis of `agreedToStandingSet` was the useful half:** the exact-set
    comparison was never an independent guard, because the prompt asks for the standing set at
    BOTH statuses, so any message *about* that set matches it. Two guards, one always passing. It
    now carries the same bound and closed vocabulary as `isBareAgreement`, one step wider for
    quantities. **A test of mine moved with it** — I had asserted that a fresh request whose set
    happened to match *should* promote.
  - **Second confident-reason-without-a-measurement in two days** (the pane-cap comment, after the
    bidi one). Both were caught by someone else. The habit to keep: a comment stating WHY is a
    claim, and a claim gets measured before it is written.
  - **`ingestFiling` deliberately NOT fixed** — the correct upsert key is `maya_report_id`, whose
    unique index is PARTIAL, and PostgREST's `onConflict` cannot express the predicate. Needs a
    schema change or a second write path inside a function manual upload shares. **⇒ goes with the
    publication-date column in the MAYA phase: same table, same DDL gate, one migration.**
- **status: [2026-08-07] WORKSPACE V1 IS CLOSED → SHIPPED TO THE QUEUE, `feat/workspace-tables`
  @ `ce64342` PUSHED. AWAITING REVIEW + MERGE.** Range `b495c87..ce64342` = **62 commits**;
  `git diff --shortstat main...HEAD` = **145 files, +23439 / −1319**. Battery **536 pass / 0
  fail** (was 496) · tsc exit 0 · `npm run build` green · console clean on :3003.
  Queue entry + reviewer asks: `ready-queue.md` [2026-08-07 18:15].
  - **THE FOUNDER'S PHASE ORDER, filed 2026-08-07:** (1) close Workspace v1 + merge ← *this*,
    (2) **MAYA across the whole product** (Home company search, Calendar's upcoming calls, chat
    answering off the DB), (3) **Railway — Atlas's first deploy**, (4) then Workspace v2.
    Export, agents and the activity log are deferred ON PURPOSE and say so on screen.
  - **[supervisor note 2026-08-08] REVIEW RAN. VERDICT: CHANGES. NOT MERGED — main is still at
    `b495c87`.** Founder's call, taken with the findings in front of him: **the lane fixes the
    intake cluster FIRST, then it merges.** Do these before anything else, then re-ship; the
    MAYA phase starts after. Full text + the supervisor's own gate: `ready-queue.md`
    [2026-08-07 23:56]. Everything else about this branch passed, and passed well — the cold
    reviewer called `lib/db/workspaces.ts` + `lib/workspace/content.ts` *"the best data layer in
    the repo"* and the bidi discipline *"unusually good"*; `apiAuthBoundary.test.ts` is
    BYTE-IDENTICAL to main across 14 new routes, i.e. all 18 handlers resolve a user with no
    allowlist widening. Battery re-run on the real merge result: 536/536 · tsc 0 · build green.
    - **(1) THE ONE THAT GATED THE MERGE — `lib/workspace/intake/agreement.ts:309`.**
      `resolveSelection` UNIONS proposal with selected at `ready`, but honours `selected` as
      given at `clarifying` one line below. So a narrowing the model reports BY OMISSION is
      silently reverted: proposal `[A,B,C]`, analyst *"כן, רק את הראשון"*, model returns
      `status:"ready", selected:["A"]` with empty `removed` ⇒ **all three are attached, fetched
      from MAYA and ingested into the SHARED corpus.** Same payload, opposite meanings, keyed on
      a status the route elsewhere distrusts enough to override. `agreement.test.ts:143` pins the
      union as correct, so that test moves with the fix. This is the founder's own intolerable
      class — Atlas doing more than the analyst agreed to — which is why it held 62 good commits.
    - **(2) `agreement.ts:251` — `agreedToStandingSet` has neither the 60-char bound nor the
      closed vocabulary** that make its sibling `isBareAgreement` safe (:162, :173). One AGREE
      word anywhere in an unbounded message passes: *"מה בדיוק ההבדל ביניהם?"* (בדיוק) and *"the
      first one looks right"* are QUESTIONS. And because `selectSources.ts:174-176`/`:197-203`
      tell the model to return the standing set at BOTH statuses, the exact-set comparison that
      is the whole safety argument matches, and the files are pulled. You asked for cold eyes on
      exactly this function — they agree with your instinct.
    - **(3) `components/workspace/WorkspaceIntake.tsx:146` — the panel asks permission for an
      attach it already did.** On a promoted turn `spoken` holds the CLARIFYING reply, which
      `selectSources.ts:207` REQUIRES to be a question (*"shall I pull both?"*), while :181 calls
      `pull()` in the same turn. Atlas's question renders directly above the "Adding…" spinner.
    - Also filed, NOT gating, fix if cheap while you are in here: `lib/maya/ingestFiling.ts:40`
      (the upsert + `document_pages` delete-then-insert is now reachable by any authenticated
      user via `POST /items/from-maya`, so a same period+type filing replaces the SHARED-corpus
      row in place and other users' `workspace_items` keep the OLD `name` over the NEW pages);
      `lib/legacyBoundary.test.ts:8` (`ATLAS_ROOTS` stops at `components/projects`, so ~5,000
      new lines under `components/workspace`, `lib/workspace`, `lib/maya` sit outside the Wave-2
      guard — one array, currently clean by grep); and `panes.ts:25` NIT = **answer to your
      question 3: belt-and-braces, harmless, but the stated reason was never measured** — no
      stored state can reach that clamp (`split` init `false`, `multi` init `[]`, both writers
      already capped), so `panes.test.ts:38` asserts over a `multi` the app cannot produce.
    - **The BLOCKER was MINE, not yours, and is already closed** — `cross-cutting.md:392` still
      headed migration 019 "WRITTEN, NOT YET APPLIED" while `list_migrations` shows it live since
      08-06, announced two `maya_issuers` name indexes the reviewed file deliberately has ZERO
      of, and omitted `companies_tase_issuer_uniq`. Corrected by append at 2026-08-07 23:56.
      It mattered because YOUR carried-forward first task is DDL on `company_documents`.
  - **[supervisor note 2026-08-08 13:54] ROUND 2 REVIEWED at `ab6a1ea`. VERDICT: CHANGES AGAIN —
    still NOT merged, main is still `b495c87`.** Full text + every finding: `ready-queue.md`
    [2026-08-08 13:54]. **Read the good news first, because it is the bigger half:** all THREE
    gating findings are closed, and you found TWO MORE DOORS behind the first one yourself, in the
    browser, after the fix you were asked for. `reconcileSelection` deleted rather than left
    callable, the explicit dedupe on the single output path, the `reply: null` promotion landing in
    the layer that already owned the case — all correct. Both non-gating items done and honest; the
    `panes.ts` comment now says what was measured. Your `ingestFiling` DEFERRAL WAS CHECKED AND IS
    ACCEPTED: a partial unique index genuinely cannot be named by PostgREST `onConflict`, so it is
    DDL, and it belongs with the publication-date column in the MAYA phase. One migration, one
    review. Supervisor battery on the real merge result (tree byte-identical to `ab6a1ea`):
    **545/545 · tsc 0 · build green**; unwound with `git reset --hard`, main never moved.
    - **(1) BLOCKER — `intake/agreement.ts:476` + `intake/route.ts:357-368`. THE FIX OPENED A NEW
      DOOR.** The `narrowed && sameSet(out, proposal)` wipe returns `[]` while the route still
      reports `status: 'ready'` and passes the model's sentence through — and `selectSources.ts:210`
      REQUIRES that sentence at `ready` to say it is pulling them in. So Atlas prints *"great, I'm
      pulling them in"* above **nothing**: no file, no spinner (`WorkspaceIntake.tsx:131` needs a
      non-empty selection), no notice, and `said.proposed` is omitted so the standing set is
      cleared and the next "כן" also does nothing. It fires on the intended path AND on ordinary
      agreements, because `NARROWING` holds `לא`/`no`/`not` — the first word of a WIDENING as often
      as of a cut. Both gates found this independently; verified by running your source:
      **"לא, את כולם"** ("no — all of them") → `[]` · "no, all of them" → `[]` · "בטח, למה לא" →
      `[]` · **"כן, בדיוק אלה, לא צריך לשאול שוב"** → `[]`, which is the sentence a frustrated
      analyst types BECAUSE of the loop this module exists to kill. Nothing unsafe is attached —
      the defect is that the UI claims an attach that did not happen.
    - **(2) WARNING — `agreement.ts:340`: the only question detector is a TRAILING `?`.** Ran it:
      "is that right", "is that correct", "you sure", "ok is that all", "זה בדיוק זה" all still
      promote and pull into the SHARED corpus. Round 1's finding narrowed, not eliminated; the
      docstring's *"whatever else a question is, it is not agreement"* over-states the code.
      Punctuation is optional in chat — a guard on it is a guard on typing habits.
    - **(3) WARNING — `agreement.ts:271-283`: the closed vocabulary overshot and now REFUSES plain
      agreements `ce64342` promoted**, dropping them back into founder complaint #1 (the
      re-confirmation loop). Ran it: "yes, both of them" fails on the word **"of"**; also "yes, all
      three", "כן, תביא את שתי השיחות", "כן, את שלושת הדוחות" — and `isBareAgreement` catches none
      of them, so there is no second path.
    - **(4) WARNING — `agreement.ts:229-241`: `NARROWING` is 11 words, so door 2 stays open** for
      "כן, את הראשון בלבד", "מספיק הראשון", "just the first one", "skip the call", "תוריד את
      השיחה" (all ran, all `false`). `narrowed=false` + empty model selection restores the
      cut-down set → stored as the standing proposal → the next bare "כן" pulls it verbatim: the
      exact chain you observed as `resolvedCount: 3`. The list being incomplete is not the
      objection; that its incompleteness fails SILENTLY and toward pulling MORE is.
    - **(5) WARNING — `agreement.ts:182-193` + `intake/types.ts:111`: an ORPHANED
      `reconcileSelection` docstring survived the deletion** and still states the invariant your
      fix reversed ("merely left out … has not been declined by anyone — so it stays"), ~200 lines
      above the new header saying the opposite. This is round 1's BLOCKER class — a document
      asserting behaviour the code no longer has — reappearing inside the file that fixed it, and
      it is the first thing the next session to touch intake will read.
    - Two NITs, `intake/route.ts`: a dangling JSDoc above `lastAssistantTurn` leaving `lastProposal`
      undocumented (:469); and — NOT a defect, but worth a line in the evidence sheet — under "last
      assistant turn wins", one failed selection turn (7s `askModel` timeout → `selected: []`) now
      permanently erases an agreed set the old scan-back preserved. The panel is honest about it;
      it is just reachable by a network hiccup rather than by anything the analyst typed.
    - **THE STRUCTURAL NOTE, and it is offered as the CHEAPER path than five vocabulary patches.**
      The BLOCKER and three of the four WARNINGs are one shape: a natural-language classifier over
      an open vocabulary decides how many files move, and when it is wrong the result is reported
      as success. No word list will ever be complete — Hebrew and English both have unbounded ways
      to say "only those two". The property worth buying is not a better vocabulary but that being
      wrong FAILS VISIBLY. Two invariants retire most of the class at once: **(a) the route must
      never return `status: 'ready'` with an empty selection** — if resolution zeroed out that is a
      question to ask, not a pull to announce, and it kills the BLOCKER for every present and
      FUTURE vocabulary gap; **(b) when the model's PROSE and its IDS disagree, say so to the
      analyst** rather than picking one silently. `rules/app.md` already carries this as standing
      law (*degradation must be VISIBLE; never render success UI for content the server dropped*)
      and this branch is its fourth occurrence.
  - **Three holes closed whose backends existed with ZERO callers** — delete a workspace, remove
    a source from the shelf, and the conversation now PERSISTS (`workspace_threads` had a table,
    RLS and three db functions that nothing called; the shelf, panes, document and citations all
    reopened warm while the questions that produced them were gone). New routes `/counts` and
    `/thread`, new `lib/workspace/thread.ts` + `components/workspace/ConfirmDialog.tsx`.
    **No migration applied this round.**
  - **A clipping's IMAGE never enters the thread row** — base64, ~2MB, ≤4 per turn, on a column
    the warm read fetches on every open. `snipPages` survives and the turn says the image is not
    kept. Proved against the live DB: a `dataUrl` round-tripped through `PUT /thread` came back
    with no `base64`.
  - **The invented half of the workspace was DELETED**, not re-labelled: `LegalDueDiligence.tsx`
    (a fake five-step run producing six invented legal findings about a real TASE issuer), five
    invented threads, three agent profiles, eight activity lines, and the DemoBanner that had
    been standing over real MAYA filings. A banner cannot half-mark a page.
  - **The founder's two intake bugs, and the two more that reproducing them found.** "Adding a
    document doesn't work" = "כן, תביא את שתיהן" is not a BARE agreement (`שתיהן` is a quantity,
    which NARROWS when three files are on the table), so the turn reached the model, which said
    *"אז אני מביא לך…"* at status `clarifying` and pulled nothing. "Thinks I already have it"
    reproduces in a workspace that NEVER held anything — it was never about deleting. Root of
    both: **the shelf was marked but never STATED as a closed set, and an empty shelf emitted no
    rule at all.** A negative fact has to be asserted to be usable.
  - **⇒ FIRST TASK OF THE MAYA PHASE, carried out of this branch:** `company_documents` has no
    publication-date column, so Atlas offered a 2021 annual report *"שפורסם ב-07.08.2026"* — the
    afternoon it was pulled; all 6 MAYA-ingested docs carry an ingest timestamp. The value EXISTS
    at ingest (`source.publishedISO`) and is discarded. DDL on the shared DB ⇒ rules/db.md gate,
    and the calendar cannot be built without it.
  - **verify-app law 4 applies to a diff YOU spot, not only one the founder reports.** I called a
    bidi bug from a screenshot and was wrong — a trailing year beside an English verb looks
    orphaned and is correct; both renderings measured byte-identical. Measuring properly (4
    templates × 8 names) found the 6 that DO differ, incl. the real workspace `תיגבור קבוצה.`
    whose own period was being parked against the "?". Fix kept, reasoning corrected.
  - Evidence: `docs/evidence/feat-workspace-tables/2026-08-07-workspace-v1-close-and-intake-fixes.md`.
- **status: [2026-08-06] MAYA IS LIVE, AND THE WORKSPACE PULLS FROM IT.** Range
  `caa9b15~1..eefd79d` = 5 commits. Battery **496 pass / 0 fail** (was 457) · tsc exit 0.
  Not pushed, not shipped — founder review pending.
  - **The two blocked sessions were probing the wrong host.** The base URL is
    `https://datawise.tase.co.il`, read off the portal's own `Servers` dropdown (a Kong
    **shadow root**, so page-text scraping returns nothing). `openapigw.tase.co.il/tase/prod`
    is TASE's base for its OTHER products and answers Imperva 503 to any key, which is why two
    sessions of probing concluded the subscription was unapproved. It was approved all along,
    on the app nobody re-checked. **A base URL is configuration; you read it from the system
    that issues it, you do not deduce it.**
  - **Three contract facts every lane needs before writing a MAYA call**, all in
    `docs/MAYA-API.md`: header `apikey`; **`Accept-Language: he-IL` is mandatory** because the
    English feed returns `title: null` on every row; and **no date range may exceed 1 year**
    (a 380-day window is a 400).
  - **`src/lib/maya/` IS A PLATFORM LAYER, not workspace code** — consumer ① of four (chat,
    calendar, live calls follow, per the founder 2026-08-06: *"Calendar, investor calls, chat
    and workspace all are being built on it"*). `layering.test.ts` fails the battery if it ever
    imports `lib/workspace`, `lib/db`, components or app routes.
  - **Migration 019 APPLIED** after a pre-apply review (`maya_issuers` + shared-corpus read
    policy · `company_documents.maya_report_id` + partial unique · `companies.tase_issuer_id`
    partial unique). The review caught two indexes that served no query — one on a column its
    only writer hardcodes to null — and `drop index` is hook-blocked, so both would have been
    permanent: **018's mistake, one day later, stopped by the gate being in front.**
  - **Directory built: 230 issuers**, `companies.tase_issuer_id` backfilled for 3 of 4
    (`scripts/maya-refresh-issuers.ts`, ~2 min, re-runnable). Covers only companies that
    announced a reporting date.
  - **Verified live, not claimed:** Tigbur's 2024 annual report — the founder's own failing
    case — fetched from MAYA in 5.6s, **171 pages** extracted, rendered in the workspace, and
    it answered a grounded Hebrew question with a verbatim quote.
    Evidence: `docs/evidence/feat-workspace-tables/2026-08-06-maya-workspace-pull-verified.md`.
  - **Gotcha that will bite the next lane: pdfjs must never be BUNDLED.**
    `src/lib/documents/extract.ts` may now be used server-side ONLY because `pdfjs-dist` is in
    `serverComponentsExternalPackages`. Remove that entry and any route touching it dies with
    `Object.defineProperty called on non-object`.
  - Spec `docs/superpowers/specs/2026-08-06-maya-layer-and-workspace-pull-design.md` · plan
    `docs/superpowers/plans/2026-08-06-maya-layer-and-workspace-pull.md`.
  - **Deferred on the founder's call, with its trigger recorded:** the rate-limit priority
    queue. 10 req/2s is ONE budget across all users and all four consumers; safe to defer only
    because every call goes through `mayaGet`. Revisit at the first background sync (calendar).

- **status: [2026-08-03] CHAPTER 2 OPEN → `feat/workspace-tables` @ `68363fb` PUSHED, STOPPED AT
  THE DDL GATE.** Off merged main (`c27995a`, which now carries the supervisor's api-security
  work). Counts pasted from git: `c27995a..68363fb` = 6 commits, 14 files / +2750 / -42.
  Battery **222 pass / 0 fail** (main was 194) · tsc exit 0.
  - **The brainstorm produced a spec and a plan, both committed**:
    `docs/superpowers/specs/2026-08-03-workspace-backend-design.md` and
    `docs/superpowers/plans/2026-08-03-workspace-backend.md` (11 tasks; 1–4 landed).
  - **BLOCKED ON PURPOSE — the migration is written and NOT applied.** Verified absent by query
    before commit. Two things must happen before Task 5: a reviewer on the FILE, and a founder
    ruling on the corpus cascade documented above `workspace_items`. Full detail = the
    `[2026-08-03] Lane M — feat/workspace-tables @ 68363fb` entry in the ready queue.
  - **Founder clarification 2026-08-03 reshaped the schema**: a workspace holds TRANSCRIPTS as
    well as Maya documents, viewed side by side, and "must not open cold every time". So the item
    table is three-way, and `is_open`/`position` are stored columns rather than session state.
    The ratio is why it matters — **60 transcripts against 2 corpus documents**, so a
    document-only shelf would sit empty until Maya lands.
  - **Two shapes came from querying the live DB, not from the design, and both would have broken
    the migration**: `transcripts.id` is TEXT not uuid, and transcript lines already carry stable
    string ids (`L0001`) so a citation anchor is a real key rather than a computed offset.
  - **`splitToggle`/`addToSplit` already exist in the UI** — side-by-side is built; it just was
    never persisted (`openTabs` initialises to `[files[0].id]`, i.e. cold, every time).
- **status: [2026-08-03] THE THREE FIXES ARE IN → `fix/projects-honesty` @ `b1d5d3d` PUSHED,
  awaiting a fresh gate.** Counts pasted from git: 12 commits ahead of `origin/main` (`bba0a21`),
  30 files / +829 / -115 over the merge base; this round alone (`505aaaf..b1d5d3d`) = 9 files /
  +212 / -23. `origin/main` merged in (2 docs-only LAUNCH-KIT commits) and the battery re-run ON
  the merge result: **201/201 · tsc exit 0 · build green**, dev server stopped and `.next` cleared
  first. Full detail = the `[2026-08-03] FIX ROUND DONE` entry in the ready queue.
  - **The wrapper went INSIDE `ErrorLine`, not at the three call sites.** A call-site wrapper
    fixes one banner and leaves the next author free to reopen the bidi rule at occurrence six by
    choosing a layout; the component now owns its own block box. `<span className="block">` and
    not a div, because one caller renders it inside a `<p>`. The `<bdi>` is untouched.
  - **Measured, because the finding was measured.** HE, `dir=rtl`, both errors in the banner:
    wrapper spans computed `block` at tops 151/174 (they are the flex items), bdis computed
    `inline` at 152/175, banner 60px for TWO messages where the defect was 60px for ONE. EN the
    same. Exact inverse of the filed measurement.
  - ✅ **THE ERROR SURFACES ARE PHOTOGRAPHED, BOTH LOCALES** — `docs/evidence/fix-projects-honesty/`
    (its own folder, which also answers the stowaway NIT about amending the previous branch's
    evidence). One frame carries all three fixes at once. Console clean in both.
  - **Forced by REAL server 500s, not a patched `window.fetch`** — the exact technique the last
    round was flagged for. A temporary env-gated `throw` inside the real handlers' existing try;
    all three lines reverted (`grep` returns nothing, `git diff` on `src/app/api/` empty). **No
    database was touched** — the throw sits above the query.
  - Residue named rather than hidden: `ChatHistory` flashes the empty state for one frame while
    loading (pre-existing, same class, left alone because the gate scoped this to three fixes) ·
    the captures are one page, so `ProjectView`'s own banner is not in frame · no new tests, since
    all three are render paths and this battery is pure-function only.
  - 🖥️ **:3003 — a stale server from the last chapter (PID 17208) was squatting it and was killed
    before any verification; nothing was captured from it.** Port is free at session end.
  - **NEXT: Workspace chapter 2, on a FRESH branch off merged main** — and it starts with the
    founder brainstorm, not with code.

- **[supervisor note 2026-08-03, later] MAIN MOVED UNDER YOU — YOUR BRANCH WILL NOT COMPILE, AND
  THAT IS DELIBERATE.** `fix/api-security` merged (main `164c892`) and **deleted `DEMO_USER_ID`
  from `src/lib/api/types.ts`**. Your `src/lib/db/conversationScope.ts` imports it and reproduces
  the fallback (`userId: realUserId ?? DEMO_USER_ID`), so merging main into your branch fails to
  compile instead of silently reinstating a shared identity that owns real rows.
  **Resolve toward REFUSING:** `resolveConversationScope` should return 401 when there is no real
  user, with no fallback. Do NOT re-add the constant to make it compile.
  Two more things that will bite in the same merge: `src/lib/apiAuthBoundary.test.ts` fails closed
  on auth helpers it does not know, so if `resolveConversationScope` becomes the auth path it must
  be added to the guard's `AUTH_FNS` list (one deliberate line) — and `package.json` conflicts on
  the test-script line, where you take BOTH new test files. `api/conversations/route.ts` and
  `api/chat/route.ts` also changed on both sides. Full detail: the `MERGE-ORDER OBLIGATION` entry
  at the end of `agent-memory/ready-queue.md`. Re-run the battery on the MERGE RESULT, not on your
  branch alone.
- **[supervisor note 2026-08-03] GATE RETURNED **CHANGES** ON `fix/projects-honesty` @ `505aaaf`
  — NOT MERGED. Three fixes, then it goes in. DO THESE BEFORE STARTING WORKSPACE.** Both gates
  agree the batch itself is good: all eight findings closed, and closed structurally (the meter
  and the injector are now one function). What blocks it is that the branch's own thesis — a
  failure the UI turns into a confident empty state — survives in two files this branch edited:
  1. `src/components/chat/ChatHistory.tsx:41-44` — `.catch(() => setItems([]))` renders "No
     chats yet" when `GET /api/conversations` 500s. This is the layer that EATS the error
     `conversationScope.ts` was narrowed to produce. You added error surfacing for `open` four
     lines below and left the list load lying.
  2. `src/components/projects/ProjectsList.tsx:67-75` — the banner-precedence defect you fixed
     in `ProjectView`, verbatim, in a file the same commit edited: one error shown, so a create
     failure after a load failure is an invisible dead click.
  3. `src/components/projects/ProjectView.tsx:226-231` — the new `flex flex-col gap-1` splits
     every error across two rows, because a flex container blockifies `ErrorLine`'s `<bdi>` into
     its own flex item. **Measured, not argued** (probe on the live page): flex → bdi computed
     `block`, text top 10 vs bdi top 32, container 60px; the non-flex sibling with identical
     children → bdi `inline`, both at 86, 37px. **Fix with a block wrapper per `ErrorLine`, NOT
     by removing the `<bdi>`** — that would re-open the bidi rule at occurrence six.
  Then: **an error-state screenshot in both locales.** Force one failure and photograph the
  banner. Three of the four defects above live in error paths, and the evidence folder contains
  no picture of a single error surface — they were all written blind. Four NITs may ride; they
  are in the ready queue under this date. Push, append a fresh queue entry, and only then branch
  off merged main for Workspace.
- **status: [2026-08-02, later] DEBT ROUND DONE → `fix/projects-honesty` @ `505aaaf` PUSHED,
  awaiting a fresh gate.** 9 commits ahead of origin/main, 27 files / +635 / -110 (counts pasted
  from `git diff --shortstat`). Battery **201/201 (was 191/191 — 10 new) · tsc exit 0 · build
  green**, built with the dev server stopped and `.next` cleared. Full detail is the
  `[2026-08-02] FIX ROUND DONE` entry + its `AMENDS` entry in the ready queue.
  - **Closed the @904030a BLOCKER by DEMONSTRATING the cascade**, not describing it: a project
    holding a real note and a real conversation, deleted, in a rolled-back transaction —
    BEFORE 1/1/1, AFTER 0/0/0, the conversation counted by its OWN id so it shows the row
    destroyed rather than unlinked. Appended to cross-cutting before touching the DB; owner row
    picked by the database so no live user id enters a script; rollback confirmed separately.
  - **Closed all the honesty defects**: the swallowed project-context failure and the truncation
    header nobody read are now ONE `x-project-context` status rendered on the answer itself; the
    capacity meter now calls the injector instead of re-implementing it; blank notes stopped
    being counted as context; `<bdi>` on the last three error strings via a shared `ErrorLine`;
    `missingTable()` narrowed so a missing COLUMN can no longer downgrade every conversation to
    memory for the whole process; and `9f5da70` finally has tests (8, on two pure functions).
  - **Then closed the two WARNINGs from the @1b3ac49 merge verdict too** — the dead click on an
    empty conversation and the banner that named the wrong failure. Both are the founder's red
    line, and both are now verified in the browser rather than reasoned about.
  - ✅ **THE VERIFICATION GAP IS CLOSED — `/verify-app` RUN SIGNED IN, IN HEBREW.** The lesson
    from the alignment miss landed: this round's evidence is four committed screenshots, not a
    claim. Through the founder's own Chrome, `GET /app/chat/projects` **200, not 307**. It
    closed the browser half of the two-user bar that PostgREST never could — his account lists
    exactly ONE project while the database holds 2 across 2 owners. Also seen: RECENTS 4 matching
    the DB exactly, a Recents row clicked and opened, the degradation notice rendered in Hebrew,
    and the user bubble on the PHYSICAL right under `dir="rtl"` — so main's `bff0242` decision
    survives this branch. Zero console errors. Evidence §12–13.
  - ⚠️ **MY PROCESS DEVIATION, stated rather than smoothed over:** the merge verdict said to work
    on a new branch off merged main; I had already built and pushed to `feat/workspace-backend`
    before reading it. `fix/projects-honesty` is cut from that same HEAD (origin/main merged in
    at `d7d0f3e`), so it is a superset — but `feat/workspace-backend` now carries the same
    commits and should be **deleted, not merged twice**.
  - Two places where verification is inference, flagged for the reviewer: the `failed` status
    came from the real server but its NOTICE was rendered by patching `window.fetch` on an
    otherwise real response, and the empty-conversation click was staged the same way. Both
    patches removed and confirmed removed. One real exchange was appended to one of the founder's
    own project conversations during the pass — his account, his project, recorded not hidden.
  - 🖥️ **:3003 is MINE and RUNNING.** Do not kill it or wipe this worktree's `.next`.

- **[supervisor note 2026-08-02 late] ✅ MERGED — `feat/workspace-backend` is IN. main =
  `c305d5f`, pushed. THE GATE BELOW IS SPENT; do not work from it.** The founder asked for the
  merge and it went in WITH KNOWN DEBT, filed line-by-line in `ready-queue.md` under
  `[2026-08-02] VERDICT supervisor/feat-workspace-backend @1b3ac49`. Read that, not this summary.
  - **Your two commits since `904030a` did the most valuable thing on the list:** project chats
    are openable. The supervisor proved it end to end, signed in, on merged main — sent Hebrew
    into a real project, got an answer, left, and reopened the conversation from the project's
    own list. Console clean. That is the first live proof of the whole `project_id` path.
  - **The BLOCKER and the spec WARNING were fixed BY THE SUPERVISOR at merge**, because both were
    documentation and merge-time doc truth is the supervisor's job. Don't redo them.
  - **Your bubble-alignment fix was reverted to the physical spelling, and this is the one thing
    worth internalising.** Your diagnosis was exactly right and matched the supervisor's
    independently. Your remedy swapped one logical property (`ms-auto`) for another
    (`justify-end`) and kept `rounded-ee` — so under `<html dir="rtl">` the bubble still mirrors,
    to the physical LEFT, which is precisely what the founder's DECISION forbids. Merged as
    `ml-auto` + `rounded-br`, keeping YOUR `<bdi>` isolation and YOUR `open` API. When a
    requirement is stated physically ("on the right"), the logical utilities are the trap, not
    the fix — see the ALERT in `cross-cutting.md`.
  - **The reason that shipped: a Hebrew-only change with no Hebrew screenshot.** Hours earlier
    the fleet established that gated `/app` routes ARE verifiable by driving the founder's
    signed-in Chrome. It is in `/verify-app`. Use it — that single screenshot was the whole gap.
  - **NEXT: new branch off merged main** (this one is merged; stop building on it). Order is in
    the queue's NEXT line. Start with the two SILENT-FAILURE defects, because they are the
    founder's stated red line — a dead click on an empty conversation (`ChatView.tsx:381`) and
    the swallowed project-context load (`api/chat/route.ts:189-192`).
- **[supervisor note 2026-08-02] ⛔ FULL-BRANCH GATE @904030a — CHANGES. NOT MERGED. 1 BLOCKER,
  10 WARNING, 8 NIT; every one is in `ready-queue.md` under `[2026-08-02] VERDICT
  supervisor/feat-workspace-backend @904030a`. Read that before editing.** The chapter's
  load-bearing claims all HOLD — five of five `getSession()` sites converted (verified by
  command at the tip, not by report), RLS genuinely load-bearing, migration clean, scope clean,
  and the battery reproduces at 191/191 · tsc · build green in the supervisor checkout. What
  fails is the repo's #1 defect class, now including the evidence file itself. **Fix in this
  order:**
  1. **BLOCKER — evidence §0 is false.** It says `chat_conversations.project_id` "is written by
     nothing yet"; your own `9f5da70` writes it. That sentence denies the existence of the exact
     path that makes the founder-countersigned cascade destructive. Correct it AND exercise it:
     a project holding a real chat, deleted, showing what happens to the conversation.
  2. **A chat started inside a project is unreachable once you navigate away** — the rows at
     `ProjectView.tsx:303-318` are inert `<div>`s (no onClick/href/Link) while
     `conversations.ts:51` removes project chats from global Recents. Each change is fine; together
     they orphan the conversation. This is the worst user-facing defect on the branch.
  3. **`api/chat/route.ts:190-191` swallows a project-context load failure** — the comment above it
     says a failure "must not silently pretend the project had no context", and that is exactly
     what the code does. The model answers without the user's instructions and nothing says so.
  4. Then: the truncation header nobody reads (`api/chat/route.ts:222-226` vs `api/chat.ts:56`) ·
     `contextChars()` undercount so the capacity alert never fires while the server truncates ·
     `<bdi>` on all three error strings — **4th occurrence of a class that is already a rule**, and
     note you used `<bdi>` correctly at `ProjectView.tsx:316`/`:498`, so the miss is specifically on
     ERROR text · the blank-source count · the spec still publishing the FK the gate rejected · a
     test for `9f5da70`, the riskiest commit and the only one with none.
  - NITs are carried, not required. **Do not re-open the migration** — applied, gated, clean.
- **[supervisor note 2026-08-02] THE 500 IS NOT YOUR FAULT ALONE — the verification layer is
  blind here, and that is the supervisor's item.** `e10fd57` fixed a crash that broke EVERY project
  page; the chat shipped at `9f5da70` had never rendered once, behind 191 green tests, clean tsc and
  a green build. Two causes: the handoff never ran `/verify-app` (the `/ship` lane path requires it,
  with screenshots), and — the structural half — `/app` is in `GATED_PREFIXES`, so middleware
  redirects an anonymous probe before the page renders and no unauthenticated check can ever see
  that class of crash. Second false pass the login gate has produced. **Before your next handoff:
  run `/verify-app` SIGNED IN on `/app/chat/projects` and `/app/chat/projects/[id]`.**
- **[supervisor note 2026-08-02] Your last three commits carried no ready-queue handoff** —
  `5692d22`, `e10fd57`, `904030a` landed after the queued entry, and the status line below still
  says "session end @ 5692d22". The gate reviewed the real tip anyway; file the handoff so the
  next reader is not told a stale SHA. Your worktree and dev server on :3003 were left untouched
  throughout — you were live.
- **[supervisor note 2026-08-02] ⛔ DDL GATE RESULT — CHANGES. Both gates ran; full verdict, the
  four answers and all findings are in `ready-queue.md` under `[2026-08-02] VERDICT
  supervisor/feat-workspace-backend @9d89bd5`. Read that before editing.** The migration is
  law-clean — both tables satisfy all four ownership points, and the composite-FK trick on
  `project_sources` is stronger than required. Independently confirmed NOT APPLIED (`list_migrations`
  newest = `20260801154729`). **TWO EDITS, then apply:**
  1. **REQUIRED —** the `chat_conversations` link is a single-column FK, so the ownership chain the
     file's own comment (:77-82) describes is NOT enforced: Postgres RI checks bypass RLS, so a user
     can point their chat at a stranger's project uuid. Use the composite form, as the file already
     does for `project_sources`. Add the column bare, then the constraint separately
     (`add column if not exists` cannot carry a composite key):
     `foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade`.
     Existing rows all validate — MATCH SIMPLE skips a NULL `project_id`, so the 7 orphans pass and
     Timlul's inserts are unaffected.
  2. **FOUNDER DECIDED 2026-08-02 — keep `on delete cascade`.** He was shown that
     `chat_conversations.messages` is inline `jsonb`, i.e. this destroys conversation history rather
     than unlinking it, and that reversing it needs hook-blocked SQL. He chose the sealed-container
     model knowingly. **Two things this obliges you to build:** the delete path must warn the user
     how many conversations it is about to destroy (silent data loss is the `rules/app.md`
     degradation-must-be-visible class), and the file's comment at :74-82 must say plainly that
     deleting a project deletes its chats — one clause now governs two very different events.
  - Then: append to cross-cutting BEFORE applying · apply · two-user proof · evidence file.
- **[supervisor note 2026-08-02] SECOND TEST ACCOUNT — the founder is creating it in the Supabase
  dashboard.** Consequence to record in your evidence: the signup + admin-approval path is NOT
  exercised this round. **Do not ask him to type a password into your session, and do not put one in
  a script** — you can obtain user B's JWT without a password via the admin API
  (`auth.admin.generateLink({type:'magiclink'})` → `verifyOtp`), which is the clean way to prove RLS
  under a second real identity. If that path fails, have the FOUNDER drive the browser half while you
  record it, rather than handling his credentials. Also from the gate: if RLS ever appears to "work"
  because queries come back empty, check for `permission denied for table projects` first — a missing
  grant looks exactly like a working policy.
- **status: [2026-08-02, session end] PROJECT CHAT WIRED · BRANCH @ `5692d22` PUSHED (12
  commits) · battery 191/191 · tsc · build green.** Founder paused for the night mid-review
  and resumes tomorrow morning.
  - **Project chat works now.** Root cause of "the composer does nothing": `ChatView` renders
    `{mainView ?? content}`, so inside a project its real composer was replaced wholesale by
    `ProjectView`'s disabled one while the chat engine sat underneath, disconnected. Wired via
    a new `renderMain({send, sending})` prop rather than reimplementing chat in the project
    page. `projectId` now threads composer → `streamChat` → `/api/chat` (the PROJECT CONTEXT
    block already existed and was waiting) and → `createConversation`, which stamps
    `project_id` — nothing wrote that column before. `listConversations` filters
    `project_id is null`, so project chats stay in their project.
  - 🔴 **LANE M ERROR WORTH GRADUATING:** `scripts/verify-rls-two-user.ts` ended with
    `pub.auth.signOut()`. supabase-js defaults that to **`scope:'global'`**, revoking EVERY
    refresh token for the user — so the lane's own verification script logged **the founder
    out of his browser mid-review**. He reported it as "i cant log into the page", which looks
    nothing like the cause. Fixed at `5692d22`. **General lesson: a script is not read-only
    because its queries are. Check what the CLEANUP does — the destructive call was the
    tidy-up line, not the test.**
  - **THE ONLY THING STILL OWED IS THE BROWSER HALF, and it is the founder's pass:** as
    `barelyknowingyou`, send a message in a project composer (proven at the DB in both
    directions, never through a browser); as `sagi.arg`, the projects list must show ZERO.
  - Everything else awaits the NORMAL-CYCLE review — auth fix (5 sites), routes, UI, context
    injection, project chat. The SQL half is reviewed and applied.
  - :3003 STOPPED and `.next` cleared at session end; next session starts a fresh server.

- **status: [2026-08-02, earlier] ⛔GATE CLEARED → MIGRATION 015 APPLIED → OWNERSHIP PROVEN.**
  `feat/workspace-backend` @ `5aab24a` PUSHED (10 commits). Both gate items closed BEFORE
  applying: the required composite-FK edit (`4266b64`) and the founder's countersigned cascade.
  Appended to cross-cutting before applying, per `rules/db.md`.
  - **The gate paid for itself and the finding is REPRODUCED, not just accepted.** In a
    rolled-back transaction: `a_can_SEE_bs_project = 0` while `a_could_REFERENCE_bs_project = 1`.
    PostgreSQL referential-integrity checks bypass RLS, so the original single-column key
    validated against a row RLS hides. The composite form now refuses it (`23503`).
  - **Applied shape verified BY QUERY:** both policies `ALL` / `auth.uid() = user_id` on **both**
    `qual` and `with_check` / roles `{authenticated}`; both composite keys present; **19
    pre-existing conversations intact, all `project_id NULL`**, so `MATCH SIMPLE` validated every
    one including the 7 orphans. Timlul unaffected.
  - **Ownership proven TWICE** — forced context, then a **real signed JWT** through PostgREST
    (user B's session obtained password-free via `generateLink` → `verifyOtp`, per the credential
    rule). B sees 1, A sees 0, anon sees 0. Three attacks refused by the DATABASE: B writing a
    row owned by A (`42501`), A attaching a chat to B's project (`23503`), anon reading anything.
  - Battery **191/191 · tsc · build green**. Evidence:
    `docs/evidence/feat-workspace-backend/2026-08-02-projects-m1-verification.md` — its §0 lists
    what is NOT proven. New re-runnable tool: `scripts/verify-rls-two-user.ts` (prints no tokens).
  - **STILL OWED — the BROWSER half.** Everything above is database + PostgREST. Nobody has
    logged into the app as A, created a project through the UI, reloaded, and then failed to see
    it as B. That is the founder's pass. Also not exercised: the access-request + admin-approval
    signup path (B was created in the dashboard by founder decision).
  - **NEXT:** normal-cycle review of the rest of the branch — auth fix (5 sites), routes, UI,
    context injection. The SQL half is done and applied.

- **status: [2026-08-02] PROJECTS BACKEND BUILT → SHIPPED TO QUEUE, BLOCKED ON THE DDL GATE.**
  `feat/workspace-backend` @ `9d89bd5` PUSHED — 7 commits (`0047805..9d89bd5`), 33 files,
  +3064/-414. Battery **191/191 (31 new) · tsc · build green**, all four `/api/projects` routes
  compiled, Middleware 81.8 kB intact. Counts pasted from git/test output.
  Founder brainstorm ran first (parallel-work law); he then said "execute it automatically".
  - **FOUNDER DECISIONS, all filed to cross-cutting 2026-08-02:** Projects is the FIRST of the
    three backends (ahead of Workspace/Agents) · the context layer is TYPED NOTES ONLY (no
    uploads, no pinned corpus docs) · instructions AND memory are BOTH user-written (Atlas does
    NOT auto-accumulate memory) · project sources get a REAL BODY the user types.
  - ⛔ **THE MIGRATION IS DELIBERATELY NOT APPLIED. Nothing on this branch has touched the live
    database.** `supabase/migrations/20260802_015_projects.sql` is written and committed;
    `rules/db.md` requires the DDL gate to run on the FILE first, because narrowing a policy
    afterwards needs hook-blocked SQL. **This is the one thing to review first.** Task 8 (apply →
    two-user verify → evidence) is blocked on that gate, not skipped.
  - **TWO FILED FACTS ARE WRONG AND ARE CORRECTED HERE.** (1) The `getSession()` → `getUser()`
    fix is **FIVE** call sites, not the three this board and the brief both record (nor the four
    my own spec recorded): the fifth is the PUT edit-rights check in `api/transcripts/[id]`,
    which `docs/DATA-MODEL.md` flags as load-bearing. All five are fixed. (2) **My Supabase MCP
    token WORKS** — verified with a real query (`auth.users` = 3), not a health check. The
    2026-08-01 note below saying it was revoked is stale; a future session should not spend the
    founder's time asking for a new one.
  - **NEW FINDING (cross-cutting 2026-08-02): 7 of 19 `chat_conversations` rows belong to an
    account that no longer exists in `auth.users`** — the missing FK's actual cost, verified by
    query. It cannot be retrofitted (it would fail against those rows; clearing them is
    destructive, hook-blocked, and the table is shared with production Timlul). So project chats
    reach their owner through `projects.id` — the parent-FK route `rules/db.md` permits — and
    never through `chat_conversations.user_id`.
  - **Design call the reviewer should look hardest at:** the project routes query with the
    USER'S OWN supabase client, not `supabaseAdmin`. That makes RLS load-bearing rather than
    decorative — every pre-existing route in this repo uses the service-role key and bypasses
    RLS entirely. Consequence by design: another user's project is 404, not 403.
  - Also landed: a composite key `(project_id, user_id) → projects(id, user_id)` making an owner
    mismatch impossible in the database; all relative labels derived at render (nothing like
    "2h ago" is stored); project context injected into chat with truncation reported on a
    response header; and the projects half of `DemoStateProvider` removed — workspaces and
    agents remain session-only and their comments now say so precisely.
  - **STILL OWED, blocked not skipped:** after the gate — apply, then the TWO-USER bar (user A
    creates + reloads; user B cannot see it) plus RLS proven under the anon key and a second
    user's JWT claims. **Founder call needed:** only 3 accounts exist, all his, so creating a
    second test account on a production-shared database is his decision. The database-level RLS
    proof needs no new account and runs regardless.
  - Spec `docs/superpowers/specs/2026-08-02-projects-backend-design.md` · plan
    `docs/superpowers/plans/2026-08-02-projects-backend.md` · handoff in the ready queue.

- **status: [2026-08-01] RE-MISSIONED by founder decision (cross-cutting 2026-08-01) — MAKE
  WORKSPACES, PROJECTS AND AGENTS REAL.** Lane F imported all three surfaces as full-fidelity UI
  and they persist NOTHING (session state only, `src/lib/demo/DemoStateProvider`, gone on reload).
  This chapter is PERSISTENCE + OWNERSHIP: the tables, the RLS, the API routes, the real read/write
  paths replacing the stub modules, plus the `getSession()` → `getUser()` auth fix — because
  ownership is decorative without it, and the founder asked to be awake when it lands.
  **OUT OF SCOPE, decided:** the Maya integration (founder connects that API separately), the
  vector-DB retrieval foundation (approved but its own chapter), and agent EXECUTION (agents
  "live on the product" → deployment is a hard requirement and Atlas has never been deployed).
  An agent this chapter is a SAVED DEFINITION, not a running process.
  **Working document = STRUCTURED BLOCKS WITH CITATION ANCHORS** (founder decision) — the shape
  lands now so it is never retrofitted; a citation whose source does not exist yet must render as
  visibly ABSENT, never as a plausible-looking link.
  Opening prompt rewritten in `docs/LAUNCH-KIT.md` (re-mission runbook step 4) — a fresh session
  is born from that file. **Starts with a founder brainstorm, not with code** (parallel-work law).
  MILESTONE 1: create a workspace, close the browser, come back — still there, still yours, and
  provably invisible to another account. Verification bar is TWO USERS, not one.
- [supervisor note 2026-08-01] Every status line BELOW this one belongs to the multiview chapter
  and is HISTORY. The worktree still holds the merged `fix/review-warnings`; the new chapter
  branches fresh off main.

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
- status: [2026-08-08 13:54] **ROUND 2 GATED — CHANGES AGAIN. main STILL UNCHANGED at `b495c87`.**
  The lane re-shipped at `ab6a1ea` (3 commits) and the founder asked for the re-review + merge. All
  three gating findings ARE closed and the lane found two more doors behind the first itself — but
  the fix opened a NEW one, and it is a BLOCKER: the narrowing wipe returns an empty selection while
  the route still says `status: 'ready'`, so Atlas announces a pull and attaches nothing. Verdict +
  7 findings: `ready-queue.md` [2026-08-08 13:54]; fixes listed in Lane M's section above.
  Battery on the real merge result: **545/545 · tsc 0 · build green**; unwound with `git reset
  --hard b495c87`. Lint counter STILL 2 MERGE since the last LINT — nothing has merged.
  **BOTH GATES FOUND THE BLOCKER INDEPENDENTLY** — this seat hit it while probing `narrowsSelection`
  before the cold reviewer reported, and the reviewer returned a strictly worse variant (a
  NEGATION-LED WIDENING, "לא, את כולם" → 0 files, not merely an incidental negation). Every finding
  the reviewer sent was then re-verified by running the branch source here rather than accepted from
  its text — the same law that governs counts in documents.
  **THE LESSON THIS ROUND ADDS, and it is a class not an instance:** the branch's remaining defects
  are all one shape — a natural-language classifier over an OPEN vocabulary decides how many files
  move, and when it is wrong the result is reported as SUCCESS. Patching the word list is endless;
  the property worth buying is that being wrong fails VISIBLY. Fed back to the lane as two
  invariants (never `ready` with an empty selection; surface a prose/ids disagreement instead of
  silently picking one). Fourth occurrence of `rules/app.md`'s "degradation must be VISIBLE".
- status: [2026-08-08] **WORKSPACE V1 GATED — CHANGES, NOT MERGED. main is UNCHANGED at
  `b495c87`, pushed, 0/0 divergence.** The founder handed off `feat/workspace-tables` @ `ce64342`
  and asked for the merge; both gates ran and the verdict was CHANGES, so **the founder chose:
  the lane fixes the intake cluster first, then it merges.** Three fixes are in Lane M's board
  section above; the full verdict + all 8 findings + this seat's own gate are at `ready-queue.md`
  [2026-08-07 23:56]. Lint counter UNCHANGED at 2 MERGE since the last LINT — nothing merged.
  **HOW IT WAS GATED, because two details are reusable.** (1) The lane session was LIVE on :3003
  and about to be restarted on the MAYA phase, so the reviewer was pointed at a **detached
  worktree pinned at `ce64342`** rather than the lane's checkout — reading a live lane's worktree
  is reading a moving target, and the ship skill's "check whether the lane is still LIVE" is why.
  Removed after. (2) The branch's merge-base IS main's tip, so `git merge --no-ff` locally
  produced a tree **byte-identical to the reviewed commit** (`git diff ce64342 HEAD` empty) —
  which is what let the real battery run on the actual merge result before any push, and made
  `git reset --hard b495c87` a clean unwind when the verdict came back CHANGES.
  Battery on that merge result: **536/536 · tsc exit 0 · build green · Middleware 81.8 kB**;
  `/` 200 and all nine `/app/*` 307 to the gate on :3000 (mine; :3001 and :3003 left alone).
  **Recorded honestly: a 307 proves the GATE, not that a page RENDERS.** An anonymous probe of a
  gated route is a picture of the login page — `rules/app.md`'s own filed trap. The render
  evidence is the LANE's browser pass, and it transfers only because the tree is byte-identical.
  This seat did not independently render a signed-in workspace.
  **The one BLOCKER was this seat's own doc debt, not the lane's** — `cross-cutting.md:392` had
  migration 019 as "WRITTEN, NOT YET APPLIED" while `list_migrations` showed it live since 08-06,
  and described a PRE-REVIEW DRAFT (two `maya_issuers` name indexes that do not exist; no mention
  of `companies_tase_issuer_uniq`, which does). Corrected by append 2026-08-07 23:56. It is the
  third filing of the same class — **a claim hand-carried between documents outliving the command
  that refutes it** — and it mattered because the MAYA phase's first task is DDL on that table.
  **NEXT FOR THIS SEAT: wait for Lane M to re-ship, then re-gate and merge.** Do not start the
  MAYA phase or Railway early — the founder's order is Workspace V1 merge → **product-wide MAYA**
  → Railway → Workspace v2 (the older "NEXT: Railway" line in MISSION is superseded, see the
  dated block there). **Owed at that merge:** PROGRESS.md entry · ARCHITECTURE.md for the 82 new
  `src/` files · **and `supabase/migrations/20260808_020_remove_redundant_workspace_item_indexes.sql`,
  which does not exist yet and MUST be written.**
  **[2026-08-08] Migration 018's two redundant indexes: FOUNDER APPROVED removal** (*"remove the
  redundant indexes i approve it"*), announced in cross-cutting 2026-08-08 with the live-DB
  verification. The assistant attempted `apply_migration` once and the pre-bash gate refused it on
  the Supabase MCP door — no founder-approval override exists there, correctly — so **the founder
  runs the two statements himself in the SQL editor.** The FILE is the part this seat owes, and it
  must sort AFTER 018 (which creates them) or a replay from scratch puts them back. It cannot be
  written to main before the merge, because 016–019 live only on the lane branch until then.
- status: [2026-08-03, later] **API SECURITY MERGED. main = `164c892`, pushed, 0/0 divergence.**
  Battery on merged main: **194/194 · tsc exit 0 · build green**. Two review rounds (CHANGES on a
  BLOCKER in the guard itself, then APPROVED). Every API handler now requires a signed-in user and
  `src/lib/apiAuthBoundary.test.ts` enforces it; `DEMO_USER_ID` is deleted outright.
  **NEXT FOR THIS SEAT: nothing until Lane M ships.** The founder's order is Workspace → Railway,
  and Railway is chapter 2 of the held Lane S brief below. Do not start it early.
  **Carried into Railway, unchanged:** `NEXT_PUBLIC_SITE_HOST` in `.env.example` (founder-only) ·
  gate `GET /api/live/{state,pcm}` BEFORE `LIVE_ENGINE_URL` is ever set · `/api/chat` still has no
  rate limit or size cap and `getChatContext` still spans all companies.
  Lint counter: **2 MERGE lines since the last LINT** (threshold 3 — one more merge triggers it).
- status: [2026-08-03] **SEQUENTIAL MODE OPEN. main = `bba0a21`, pushed, 0/0 divergence.**
  `fix/projects-honesty` @ `505aaaf` gated **CHANGES — not merged**; three fixes are on Lane M's
  board section and at the head of its LAUNCH-KIT prompt, so the seat cannot open straight into
  Workspace and strand nine good commits. Nothing else is in the queue. Two doc commits pushed
  (`4b2ab30`, `bba0a21`). Lint counter unchanged at 1 MERGE since the last LINT (threshold 3).
  **Next for this seat: the api-security branch off main** — the five open routes listed in the
  held Lane S board section, verified by command on main, not copied from a doc. It goes through
  `atlas-reviewer` like a lane's; the supervisor still does not fix-and-self-review.
  Two carried cautions, both now resolved or deferred: `POST /api/live/finish` turned out to be
  called ONLY by browser components on gated `/app/*` pages (`LiveSession.tsx`,
  `CompanyOverview.tsx`) — the runner script calls `runDemoFinish()` in-process — so a plain
  cookie check sufficed and no secret was needed. The `/live-test` skill's poll recipe DID break
  and was updated the same session (a 401 is not `status: completed`, so an old poll loop would
  spin silently). `NEXT_PUBLIC_SITE_HOST` is untouched and belongs to the Railway chapter — still
  founder-only, since shell access to `.env*` is hook-blocked for the assistant.
- status: [2026-08-02 late] **PROJECTS BACKEND MERGED. main = `c305d5f`, pushed, 0/0 divergence.**
  Two merges: `fix/chat-user-message-right` (9ad4f41) then `feat/workspace-backend` (d862ba6),
  plus doc truth at c305d5f. Battery on merged main: **191/191 · tsc exit 0 · build green**
  (dev server stopped before the build per the rule Lane M filed at 7d98d5a, restarted after).
  Reviewer verdict was CHANGES; merged anyway on the founder's explicit ask, with all 19 findings
  filed rather than waived, and the two documentation items fixed at merge.
  **Two things this session settled that outlive it:**
  (1) **A gated `/app` route IS verifiable** — the Chrome MCP drives the founder's signed-in
  browser. Used it to prove project chat end to end and to MEASURE the bubble in both locales
  (`gapToRowRight: 0`, `borderBottomRightRadius: 4px`, inner `<bdi>` rtl). The opposite claim,
  filed by this seat earlier the same day, is corrected in `/verify-app` and cross-cutting.
  (2) **`getSession()` is dead** — `git grep` returns nothing in `src`. Item 0 of the security
  notes and the 🔴 rule are both rewritten as CLOSED, with a new paragraph stating what the fix
  does NOT cover (supabaseAdmin still bypasses RLS outside `lib/db/projects.ts`).
  **OPEN, needs the founder:** deleting a project permanently deletes its chats — the cascade was
  countersigned against a description that is no longer true, and the consent needs re-confirming
  (filed as DECISION NEEDED in cross-cutting). Also `ready-queue.md` is now **794 lines**, well
  past the 400-line compaction threshold; compaction needs founder approval per /fleet-lint 10.
  **NEXT:** the founder's own next topic — Workspace backend + the Maya/TASE API + whether to
  host on Railway now or keep building locally. Lint counter: 1 MERGE line since the last LINT
  (threshold is 3, so no lint due).
- status: [2026-08-01 late] **BOTH BRANCHES MERGED; main = `73b3d36`, pushed, 160/160 · tsc ·
  build green.** `fix/surfaces-export-marker` (carrying Lane F chapter 3) + `fix/transcripts-shared-corpus`.
  Reviewer APPROVED round 3 (3 WARNING / 4 NIT — all fixed pre-merge in `975dec7`, filed to the
  queue). Merge-time doc truth done: PROGRESS entry · ARCHITECTURE catch-up (the test list was
  REGENERATED from package.json — it claimed 125 tests and named two files that are not in the
  runner; real is 160 across 25) · spec + plan stamped SHIPPED · CLAUDE.md doc map corrected.
  Third `/fleet-lint` ran (4-merge counter). Local merged branches deleted; the three held by
  lane worktrees were not.
  **NEXT: the founder asked to start the WORKSPACE BACKEND + AGENTS.** New chapter → the
  parallel-work law requires brainstorm → spec → plan before code, and `docs/DATA-MODEL.md` +
  the `rules/db.md` ownership law govern every table it creates. The API-auth item
  (`getSession()` → `getUser()`) is a REAL blocker for per-user backends, not a nicety.
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
  **NEXT, and it is the real one: `getSession()` believes the cookie** — **FIVE** call sites to
  `getUser()` (this line said "three" until 2026-08-02, one sentence after the lesson above about
  counts coming from a command — Lane M found the two in `api/transcripts/[id]/route.ts`; all five
  are now fixed on `feat/workspace-backend`, awaiting merge), its own branch, founder wants to be
  awake for it. Also owed: `.env.example` needs
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
