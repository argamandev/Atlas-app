# CLAUDE.md — Atlas (אטלס)

Standing facts only. Procedures live in skills; scoped laws in `.claude/rules/`; live state in
`agent-memory/` (READ THE BOARD FIRST, update your own section as you work).

## What this is

Atlas — the institutional platform for Israeli public-market investor calls ("Quartr for TASE").
Live calls on-platform (Recall bot → buffered audio + karaoke captions), polished transcripts
(IVRIT/RunPod → Gemini 3.5 Flash), quotes, chat over the archive. Full picture: `docs/VISION.md`.

## Iron rules

1. **Supabase is SHARED with the old repo's production Timlul.** Additive-only migrations,
   appended to `agent-memory/cross-cutting.md` before applying. Destructive SQL is hook-blocked
   on both doors (Bash + Supabase MCP).
2. **main is always working + pushed.** Branch per mini-feature; small labeled commits; test
   before commit; ship via `/ship`. Only the supervisor session pushes `main`.
3. **Verify with your own eyes before claiming done** — `/verify-app`.
4. **Work small.** One independently-testable step at a time.
5. **RTL discipline:** Hebrew `dir="rtl"`; numbers/tickers `font-mono-num` + `dir="ltr"`; test bidi visually.
6. **Founder context:** Sagi is a solo non-engineer founder — explain the why in plain language,
   surface risky steps before taking them, say which branch you're on and what's committed.

## Parallel work

You may be one of several sessions. Lane, port, branch and duties come from your opening prompt
+ `.claude/rules/parallel-work.md`. Shared brain (any worktree):
`C:/Users/Sagi/Desktop/Atlas/agent-memory/` → `BOARD.md` · `cross-cutting.md` +
`ready-queue.md` (append-only).

## Stack & commands

Next.js 14 App Router + TypeScript + Supabase + Tailwind. No deploy yet — localhost only.

- `npm run dev -- -p <your port>` · `npm test` · `npx tsc --noEmit` · `npm run build`
- Live: TWO engines share :8788 (Recall `live-broadcast.mjs` / IVRIT `live-ivrit-broadcast.ts`)
  — read `.claude/rules/live.md` before touching live. Replay: `scripts/live-replay-engine.mjs`

## Doc map

- `ARCHITECTURE.md` — the codebase, file by file
- `docs/DATA-MODEL.md` — **shared corpus vs personal layer** (founder decision 2026-08-01):
  company data is the same for everyone; everything a user makes is theirs. Read before
  designing any table or touching Maya/retrieval/agents.
- `docs/VISION.md` — product vision, V1 description, roadmap
- `docs/product/` — founder briefs. The Projects · Workspace · Agents brief is HALF spent:
  frontend shipped 2026-08-01, **backends are the open half**.
- `docs/MAYA-API.md` — the TASE Data Hub / MAYA feed: key, endpoints, and the PENDING
  subscription that is the actual blocker (checked live 2026-08-05)
- `docs/ENVIRONMENT.md` — how this smart environment works + the dev↔product mapping
- `docs/LAUNCH-KIT.md` — fleet setup: worktrees + the 3 lane opening prompts
- `PROGRESS.md` — decision log (append at ship time; old eras → `docs/archive/`)
- `docs/V1-SECURITY-AND-LAUNCH-NOTES.md` — pre-launch security checklist
- `docs/audits/` — environment audits · `docs/evidence/<branch>/` — ship evidence
- `.claude/rules/` — parallel-work · db · live · app (read before touching those areas)
- `LEGACY.md` — the 4-file Wave-2 login gateway (only legacy left)
- Skills: `/verify-app` · `/ship` · `/fleet-lint` · `/live-test` · `/transcript-review` ·
  agent: `atlas-reviewer`
