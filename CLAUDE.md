# CLAUDE.md — Atlas (אטלס)

@CONTEXT.md
@STATUS.md

Standing facts only. **This file, the two `@imports` above and `.claude/rules/*.md` are ALREADY in
your context — never "go read" one, and never move text between them to save tokens: identical
cost, and `@imports` load eagerly too.** That set is declared in `scripts/lib/env-manifest.mjs`,
budgeted by `src/lib/environment.test.ts`, and adding to it fails the battery until you declare it
and say why it earns the cost. Everything else loads on demand. Procedures: `.claude/skills/`.

## What this is

Atlas — the institutional research platform for the Israeli public market. Quartr and AlphaSense
are the closest peers; the market is TASE-listed issuers and the people who follow them. Five
surfaces, one corpus:

- **Live calls** — calls hosted on-platform (Recall → buffered audio + karaoke captions), then
  polished transcripts (IVRIT/RunPod → Gemini 3.5 Flash) and quotes.
- **Companies** — search and profile any TASE issuer: filings, periods, reports, calendar. Company
  data comes from MAYA (the TASE Data Hub).
- **Chat** — broad market questions over the whole archive, not one document.
- **Workspace** — documents pulled in and worked on: tables, extraction, chat over the set.
- **Agents** — personalised standing agents the user creates.

**Ask Atlas** is not a sixth surface — it is that same chat reachable from every one of them,
grounded in whatever the user is looking at. Full picture: `docs/VISION.md`.

## Iron rules

1. **Supabase is SHARED with the old repo's production Timlul.** Additive-only migrations,
   appended to `COLLISIONS.md` before applying. Destructive SQL is hook-blocked at every door.
2. **main is always working + pushed.** Branch per mini-feature; small labeled commits; test
   before commit; ship via `/ship`. `main` is pushed from the primary checkout, never from a
   worktree — hook-enforced.
3. **Verify with your own eyes before claiming done** — `/verify-app`.
4. **Work small.** One independently-testable step at a time.
5. **RTL discipline:** Hebrew `dir="rtl"`; a line mixing Hebrew and Latin gets a `<bdi>` per run
   with `dir` on the CONTAINER. This is the repo's most-repeated defect — `rules/app.md` carries
   the full law and the command. Test both locales.
6. **Founder context:** Sagi is a solo non-engineer founder — explain the why in plain language,
   surface risky steps first, say which branch you're on and what's committed.

## Working shape

**One session, one mission, integrating through `main`** (ADR-0001). No board, no queue, no seat
to claim. A `git worktree` is made on demand when two efforts must not touch the same files, and
removed when the work lands.

- **`COLLISIONS.md`** — the only thing `main` cannot arbitrate ahead of time: a migration, a
  shared type, a design token. Append BEFORE, via `node scripts/append-log.mjs collisions "…"`.
  Current era only; nothing else belongs there.
- **`DECISIONS.md`** — every founder decision, one line, **in his own words, quoted**, filed the
  moment it is made. Permanent. Read it before proposing anything he may have settled.
- **Answers are filed, not spoken.** Anything nontrivial you work out goes into the right doc
  under `docs/` and gets indexed below. Chat is not storage.
- **Brainstorm before building** — brainstorming skill → spec → plan, founder included.
- **The 5-strike rule.** ~5 failed attempts at the SAME problem → STOP, write down what you tried
  and hand it to the founder. Being stuck is data; burning the budget on it is the only failure.

Everything before 2026-08-12 is verbatim in `docs/archive/`, so **search there before saying "no
prior art"**.

## Stack & commands

Next.js 14 App Router + TypeScript + Supabase + Tailwind. **LIVE on Railway →
`www.timlul-ai.com`** since 2026-08-08 — a mistake on main is no longer local. Keep
`LIVE_ENGINE_URL` UNSET (`rules/app.md`).

- `npm run dev` (`:3000`) · `npm test` · `npx tsc --noEmit` · `npm run build`. A second worktree
  takes its own port (`-- -p 3001`); two dev servers must never share one `.next`.
- `npm run env:health` — the always-on set against its budget, and how many laws nothing is
  enforcing. That count is what this workflow exists to drive down (ADR-0002).
- `npm run ship:gate` — what a merge still owes: the status rewrite, the progress entry, closed
  notes filed as history, and a recurrence answer per review finding. Run at `git merge` too.
- Live: TWO engines share :8788 (`live-broadcast.mjs` Recall / `live-ivrit-broadcast.ts` IVRIT) —
  read `docs/live-engines.md` first. Replay: `scripts/live-replay-engine.mjs`

## Doc map

- `ARCHITECTURE.md` — the codebase, file by file
- `docs/DATA-MODEL.md` — **shared corpus vs personal layer**: company data is the same for
  everyone, everything a user makes is theirs. Read before designing any table.
- `docs/VISION.md` — product vision, V1, roadmap
- `docs/product/` — founder briefs for Projects · Workspace · Agents (**Agents** is what's left),
  plus the measured MAYA facts behind the documents catalog.
- `docs/MAYA-API.md` — the TASE Data Hub feed. `Accept-Language: he-IL` is mandatory (English
  returns `title: null`). Read before any MAYA call.
- `docs/live-engines.md` — the two live engines: :8788 ownership, restart-per-test, caption lag,
  known unfixed limits. FACTS, not laws.
- `docs/adr/` — `0001` retires the agent fleet; `0002` says a lesson is not learned until a
  mechanism enforces it.
- `docs/case-history/` — the defect behind each law, on demand (a new case: LAW in the rule,
  STORY here). `docs/archive/` — history, verbatim, never rewritten.
- `PROGRESS.md` — shipped-work log (append at ship time) · `docs/V1-SECURITY-AND-LAUNCH-NOTES.md`
  · `docs/audits/` · `docs/evidence/<branch>/` · `LEGACY.md` (the 4-file Wave-2 login gateway)
- Skills: `/verify-app` · `/ship` · `/live-test` · `/transcript-review` · agent: `atlas-reviewer`
- Issues and specs are markdown under `.scratch/<feature>/`, committed with the branch, carrying a
  `Status:` line — see `docs/agents/{issue-tracker,triage-labels,domain}.md`.
