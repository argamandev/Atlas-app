# CLAUDE.md — Atlas (אטלס)

Standing facts only. Procedures live in skills; scoped laws in `.claude/rules/`; live state in
`agent-memory/` (READ THE BOARD FIRST, update your own section as you work).

## What this is

Atlas — the institutional platform for Israeli public-market investor calls ("Quartr for TASE").
Live calls on-platform (Recall → buffered audio + karaoke captions), polished transcripts
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
   surface risky steps first, say which branch you're on and what's committed.

## Parallel work

Lane, port, branch and duties come from your opening prompt +
`.claude/rules/parallel-work.md`. Shared brain, any worktree:
`C:/Users/Sagi/Desktop/Atlas/agent-memory/` → `BOARD.md` · `cross-cutting.md` · `ready-queue.md`
(the last two append-only).

## Stack & commands

Next.js 14 App Router + TypeScript + Supabase + Tailwind. **LIVE on Railway →
`www.timlul-ai.com`** since 2026-08-08 — a mistake on main is no longer local. Keep
`LIVE_ENGINE_URL` UNSET (`rules/app.md`).

- `npm run dev -- -p <your port>` · `npm test` · `npx tsc --noEmit` · `npm run build`
- Live: TWO engines share :8788 (`live-broadcast.mjs` Recall / `live-ivrit-broadcast.ts` IVRIT)
  — read `.claude/rules/live.md` first. Replay: `scripts/live-replay-engine.mjs`

## Doc map

- `ARCHITECTURE.md` — the codebase, file by file
- `docs/DATA-MODEL.md` — **shared corpus vs personal layer**: company data is the same for
  everyone, everything a user makes is theirs. Read before designing any table.
- `docs/VISION.md` — product vision, V1 description, roadmap
- `docs/product/` — founder briefs for Projects · Workspace · Agents. **Agents** is what's left;
  the deploy it was blocked on now exists.
- `docs/MAYA-API.md` — the TASE Data Hub feed. `Accept-Language: he-IL` is mandatory (English
  returns `title: null`). Read before any MAYA call.
- `docs/ENVIRONMENT.md` · `docs/LAUNCH-KIT.md` (fleet setup + lane prompts) ·
  `docs/V1-SECURITY-AND-LAUNCH-NOTES.md` · `docs/audits/` · `docs/evidence/<branch>/`
- `PROGRESS.md` — decision log (append at ship time; old eras → `docs/archive/`)
- `.claude/rules/` — parallel-work · db · live · app (read before touching those areas)
- `LEGACY.md` — the 4-file Wave-2 login gateway (only legacy left)
- Skills: `/verify-app` · `/ship` · `/fleet-lint` · `/live-test` · `/transcript-review` ·
  agent: `atlas-reviewer`
