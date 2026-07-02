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

You may be one of several sessions. Your lane, port, branch and duties come from your opening
prompt + `.claude/rules/parallel-work.md`. Shared brain (absolute paths, any worktree):
`C:/Users/Sagi/Desktop/Atlas/agent-memory/` → `BOARD.md` (mission + lanes) ·
`cross-cutting.md` + `ready-queue.md` (append-only logs).

## Stack & commands

Next.js 14 App Router + TypeScript + Supabase + Tailwind. No deploy yet — localhost only.

- `npm run dev -- -p <your port>` · `npm test` · `npx tsc --noEmit` · `npm run build`
- Live engine: `node scripts/live-broadcast.mjs` (:8788) · replay: `scripts/live-replay-engine.mjs`

## Doc map

- `ARCHITECTURE.md` — the codebase, file by file
- `docs/VISION.md` — product vision, V1 description, roadmap
- `PROGRESS.md` — decision log (append at ship time)
- `.claude/rules/` — parallel-work · db · live · app (read before touching those areas)
- `LEGACY.md` — the 4-file Wave-2 login gateway (only legacy left)
- Skills: `/verify-app` · `/ship` · `/live-test` · `/transcript-review` · agent: `atlas-reviewer`
