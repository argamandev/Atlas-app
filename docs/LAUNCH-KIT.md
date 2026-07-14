# Atlas Fleet Launch Kit — open the 3 parallel sessions

> For Sagi, morning of 2026-07-02. The smart environment is built and verified.
> Follow this top to bottom; total setup ≈ 10 minutes, then the fleet flies.

## Step 0 — Morning checklist (before opening any session)

1. **Design import happens INSIDE the Lane F session** (founder decision 2026-07-03): Sagi runs
   the Claude Design → Claude Code import as Lane F's first act, so it lands on the lane's
   branch. No export folder needed.
2. **Drop the demo annual-report PDF** at `C:\Users\Sagi\Desktop\Atlas\local-assets\demo-report.pdf`
   (git-ignored). ✅ done 2026-07-03 (Tigbur Q1-2026 report; original filename kept alongside).
3. **Restart the supervisor Claude session** (the main chat, in `C:\Users\Sagi\Desktop\Atlas`) so it
   reloads the new hooks + settings cleanly. Tell it: *"You are the supervisor. Read the board and
   resume."*

## Step 1 — Create the three worktrees (one-time)

Open a terminal in `C:\Users\Sagi\Desktop\Atlas` and run:

```bash
git worktree add ../Atlas-frontend  -b feat/frontend-import
git worktree add ../Atlas-ivrit     -b feat/ivrit-pipeline
git worktree add ../Atlas-multiview -b feat/multiview-backend
```

This creates three sibling folders, each a full checkout on its own branch, sharing one git
history. `agent-memory/`, `design-import/` and `local-assets/` live ONLY in the main folder —
the lanes reach them by absolute path (already wired into their prompts).

**Seed `.env.local` into each worktree yourself** — it's gitignored so worktrees don't carry
it, and agents are hook-blocked from reading/copying `.env` files. In each lane session type
(the `!` prompt is Git Bash, so `cp`, not `copy`):

```
! cp C:/Users/Sagi/Desktop/Atlas/.env.local .
```

## Step 2 — Open the three sessions

Open **three new terminals**, one per folder, and start Claude in each:

```
cd C:\Users\Sagi\Desktop\Atlas-frontend   → claude
cd C:\Users\Sagi\Desktop\Atlas-ivrit      → claude
cd C:\Users\Sagi\Desktop\Atlas-multiview  → claude
```

## Step 3 — Paste each lane its opening prompt

### 🎨 Lane F — paste into the Atlas-frontend session

```
You are Lane F — frontend-import — of the Atlas fleet. Your worktree is
C:\Users\Sagi\Desktop\Atlas-frontend, branch feat/frontend-import, dev port 3001
(npm run dev -- -p 3001). Before anything: read CLAUDE.md, .claude/rules/parallel-work.md,
and the board at C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md. Your private memory is
C:/Users/Sagi/Desktop/Atlas/agent-memory/state-frontend.md — read it at start, write it
before walking away.

MISSION: import the Claude Design frontend exactly. THE FOUNDER RUNS THE CLAUDE DESIGN
IMPORT INSIDE THIS SESSION as the first act — whatever it lands (files/components/tokens)
is the source of truth. Replicate the design faithfully into this codebase (components/ds and the app shell are yours to evolve — append any
design-token or shared-component change to agent-memory/cross-cutting.md first). The new
Workspace and Agents pages are FRONTEND-ONLY for now: build them on stub data behind one
clean data-interface module each, so wiring real backends later is a swap, not a rebuild.

WORK LAW: one small independently-testable step at a time. Before claiming ANY page done, run
/verify-app — screenshot your page next to its design-import reference, compare structure/
spacing/typography/colors, check EN + HE (RTL flip), zero console errors. When a piece is
ready, finish it with /ship (battery → push your branch → append to agent-memory/ready-queue.md).
Never push main. If you fail ~5 attempts at the SAME problem: stop, ALERT, escalate (the
5-strike rule in parallel-work.md). MILESTONE 1: the improved chat frontend shell (New chat /
Projects / Workspace / Agents in the top-left) imported and verified, navigable to stub
Workspace and Agents pages. FIRST ACTION: ask the founder to run the Claude Design import in
this session; read what landed; then run the brainstorming skill WITH THE FOUNDER to produce
your spec + plan (docs/superpowers/) — only then build.
```

### 🎙️ Lane I — paste into the Atlas-ivrit session

```
You are Lane I — ivrit-pipeline — of the Atlas fleet. Your worktree is
C:\Users\Sagi\Desktop\Atlas-ivrit, branch feat/ivrit-pipeline, dev port 3002
(npm run dev -- -p 3002). Before anything: read CLAUDE.md, .claude/rules/parallel-work.md,
.claude/rules/live.md, and the board at C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md.
Your private memory is C:/Users/Sagi/Desktop/Atlas/agent-memory/state-ivrit.md — read at
start, write before walking away.

MISSION: build the second, independent live audio→text pipeline. Today Recall sends
audio + text; in this pipeline Recall sends AUDIO ONLY (audio_mixed_raw websocket) and our
ivrit-ai RunPod model produces the text + word timestamps, feeding the SAME karaoke UX the
product already has (the sync engine is built — src/lib/live/syncEngine.ts). Study
scripts/live-broadcast.mjs (current engine) and src/lib/transcription.ts (IVRIT/RunPod
integration incl. word timestamps) first. FIRST ACTION after that reading: run the
brainstorming skill WITH THE FOUNDER on the chunking strategy (how audio segments → IVRIT
calls → rolling timed captions) → spec + plan in docs/superpowers/ — only then build.
If stuck ~5 attempts on one problem: stop, ALERT, escalate (5-strike rule).

SELF-VERIFICATION (this is your definition of "works"): your test bench is the archived real
call at scripts/out/sessions/2026-07-01-tamis-live/ (broadcast-audio.pcm + lines.jsonl)
replayed via scripts/live-replay-engine.mjs — no Zoom needed. Write unit tests in the style
of liveTiming.test.ts asserting: word timestamps strictly non-decreasing; word coverage vs
audio duration; caption-vs-audio drift within the buffer budget. Compare your transcript
against the Recall captions on the same audio (scripts/run-experiment.ts pattern) and report
the quality delta on the board. Then /verify-app: watch the karaoke mid-replay with your own
eyes. The live engine :8788 is single-owner — claim it in agent-memory/cross-cutting.md first.
Finish pieces with /ship; never push main. MILESTONE 1: replayed archived audio → IVRIT text
with word timings → karaoke renders in sync, with the invariants unit-tested.
```

### 📑 Lane M — paste into the Atlas-multiview session

```
You are Lane M — multiview-backend — of the Atlas fleet. Your worktree is
C:\Users\Sagi\Desktop\Atlas-multiview, branch feat/multiview-backend, dev port 3003
(npm run dev -- -p 3003). Before anything: read CLAUDE.md, .claude/rules/parallel-work.md,
.claude/rules/db.md, and the board at C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md.
Your private memory is C:/Users/Sagi/Desktop/Atlas/agent-memory/state-multiview.md — read at
start, write before walking away.

MISSION: build the multi-view backend — the functionality that lets a user open a company's
quarterly report PDF and slides beside the transcript, scroll them, MARK TEXT INSIDE THE PDF,
and Ask Atlas about the marked passage (the exact UX the transcript already has via
TranscriptBody selection → TranscriptChatPanel → /api/chat). The design glue comes later from
Lane F — you build the engine: (1) document ingest+store (Supabase Storage + an additive
documents table — append the migration to agent-memory/cross-cutting.md before applying,
see rules/db.md);
(2) per-page text extraction persisted server-side; (3) pdf.js (pdfjs-dist is already in
node_modules) rendering with a selectable text layer in a bare test page; (4) selection →
Ask Atlas wired through the existing /api/chat with the marked passage + page context.

DESIGN HOOK (docs/VISION.md Mission 5): shape the documents table + any chat-context changes
so a future company_knowledge layer can slot in behind a clean interface — interface now,
implementation later. DAY-ONE SPIKE (before anything else): your fixture is
C:/Users/Sagi/Desktop/Atlas/local-assets/demo-report.pdf. Extract its text per page and
verify known Hebrew strings come out in CORRECT reading order — Hebrew PDF extraction is the
project's #1 known risk here. Post the spike verdict (clean / quirks / fallback needed) to
the board BEFORE building the rest. SELF-VERIFICATION: /verify-app — via Chrome MCP actually
select text inside the rendered PDF, trigger Ask Atlas, confirm the answer references the
marked passage; screenshot the multi-panel test layout. Finish pieces with /ship; never push
main. If stuck ~5 attempts on one problem: stop, ALERT, escalate (5-strike rule).
MILESTONE 1: demo PDF ingested → rendered → text marked → Ask Atlas answers about the
marked passage, end to end on the test page. AFTER the day-one spike: run the brainstorming
skill WITH THE FOUNDER → spec + plan in docs/superpowers/ — only then build the rest.
```

## Step 4 — What the supervisor (main chat) does all day

Watches the board + logs · processes the ready queue: **dispatches the atlas-reviewer agent
(fresh eyes) on every diff, then does its own mission-fit pass** · merges small and often ·
runs the battery on main · pushes · logs PROGRESS.md · resolves cross-cutting conflicts ·
runs **/fleet-lint every 2-3 merges** (drift, contradictions, un-graduated lessons) ·
maintains the MISSION section (north star + each lane's contribution) · brings you MILESTONES
to product-test · retires finished features (distill → archive → reset the seat) and intakes
new ones · distills every lesson a lane learns into skills and rules so the fleet gets sharper.

## House rules recap (enforced, not suggested)

- Destructive SQL (Bash AND Supabase MCP), `.env` reads, force-pushes, lane-pushes-to-main: **hook-blocked**.
- Every edit is auto-formatted + typechecked by the PostToolUse hook.
- DB is shared with production: additive-only, appended to cross-cutting.md first.
- One lane = one port (numbers live in `.claude/rules/parallel-work.md` only); live engine
  :8788 claimed in `agent-memory/cross-cutting.md`, released when done.
- Nothing is "done" without /verify-app evidence; nothing reaches main except through /ship.
