# CLAUDE.md — Atlas (אטלס)

Standing facts only. Procedures live in skills; scoped laws in `.claude/rules/`; live state in
`agent-memory/BOARD.md` (READ IT FIRST, update your own section as you work).

## What this is

Atlas — the institutional platform for Israeli public-market investor calls ("Quartr for TASE").
Live calls hosted on-platform (Recall bot → buffered audio + karaoke captions), polished
transcripts (IVRIT/RunPod → Gemini 3.5 Flash), quotes, chat over the archive. English-LTR UI
with Hebrew-RTL option. Full picture: `docs/VISION.md`.

## Iron rules

1. **Supabase is SHARED with production Timlul** (old repo on Railway). Additive-only migrations,
   posted to the board's CROSS-CUTTING before applying. Destructive DDL is hook-blocked.
2. **main is always working + pushed.** Branch per mini-feature; small labeled commits; test
   before commit; ship via `/ship`. Only the supervisor session pushes `main`.
3. **Verify with your own eyes before claiming done** — `/verify-app` (Chrome MCP screenshots).
4. **Work small.** One independently-testable step at a time.
5. **RTL discipline:** Hebrew `dir="rtl"`; numbers/tickers `font-mono-num` + `dir="ltr"`; test bidi visually.
6. **Founder context:** Sagi is a solo non-engineer founder — explain the why in plain language,
   surface risky steps before taking them, say which branch you're on and what's committed.

## Parallel work

You may be one of several sessions. Your lane, port, branch and duties come from your opening
prompt + `.claude/rules/parallel-work.md`. The shared brain is
`C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md` (absolute path — works from any worktree).

## Stack & commands

Next.js 14 App Router + TypeScript + Supabase + Tailwind. Railway deploys the OLD repo; this
clone develops on localhost.

- `npm run dev` · `npm test` (45 tests) · `npx tsc --noEmit` · `npm run build`
- Live engine: `node scripts/live-broadcast.mjs` (:8788) · replay: `scripts/live-replay-engine.mjs`

## Doc map

- `ARCHITECTURE.md` — the codebase, file by file
- `docs/VISION.md` — product vision, V1 description, roadmap
- `PROGRESS.md` — decision log (append at ship time)
- `agent-memory/BOARD.md` — live fleet state (git-ignored, real-time)
- `.claude/rules/` — parallel-work · db · live (read before touching those areas)
- `LEGACY.md` — the 4-file Wave-2 login gateway (only legacy left)
- Skills: `/verify-app` · `/ship` · `/live-test` · `/transcript-review`

## Hard-won gotchas (summary — details in rules/)

Hebrew PDF needs a real browser engine (`window.print()` stopgap). Sign-out stays a plain link.
Railway redirects derive origin from `x-forwarded-host`. PUT validation stays lenient
(`.passthrough()`). Hard-refresh after dev restart. `/app/*` pages have no login gate yet
(APIs are gated) — pre-launch task.
