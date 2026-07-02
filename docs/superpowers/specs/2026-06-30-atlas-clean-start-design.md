# Atlas Clean Start — Design & Handoff (2026-06-30)

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **Read this first if you're a fresh Claude session in `C:\Users\Sagi\Desktop\Atlas`.**
> This repo is the **clean clone** of the old Atlas/Timlul project. It was created on
> 2026-06-30 to become the one true home of Atlas. Below is *why it exists, what was
> decided, and what to do next*. After reading this, read `CLAUDE.md`, then begin Phase 1.

## Why this clone exists

Sagi (solo, non-engineer founder) wanted a **clean, fully-understood, Atlas-only codebase**
to build the advanced product on. The old repo carries a second product (legacy **Timlul**),
docs written across many fast-moving sessions, and accumulated build cruft. Rather than a
risky from-scratch rewrite, we chose **fork-and-prune**: copy the *proven working code*, then
remove dead weight and reorganize deliberately.

## Decisions locked this session (do not re-litigate)

- **Approach = "copy working code, then prune & polish."** NOT a from-scratch rewrite. Every
  working feature (live pipeline, chat, company pages, the finished-transcript pipeline) is
  preserved byte-for-byte. We *remove* and *reorganize*; we do not rebuild from zero.
- **Git history = kept in full.** The clone carries all prior commits. This is reversible
  toward clean later: at a milestone (e.g. launch) we can collapse everything up to a chosen
  point into one "Atlas baseline" commit and keep all history after it (orphan-baseline + replay).
- **Develop on localhost; Railway is untouched during development.** A *second* Railway project
  can be created for this repo when a public URL is first needed (e.g. live-call webhook testing).
- **The old repo is frozen — it is both the safety-net backup AND Timlul production.**
  `github.com/argamandev/Investor-Transcript` stays deployed on Railway → `timlul-ai.com`,
  serving Timlul to the founder's brother's boss. **We do not touch it.**
- **This clean home:** folder `C:\Users\Sagi\Desktop\Atlas` → `github.com/argamandev/Atlas-app`
  (**private**). Treat the folder name as final — renaming a project folder orphans its Claude
  session history (learned the hard way 2026-06-30).
- **Supabase is shared.** Both repos point at the *same* Supabase database via `.env.local`.
  Therefore: **avoid destructive DB migrations** in this clone while the old product is live;
  additive migrations are fine. Flag any DB change before running it.
- **Timlul retirement is deferred.** Because the old repo keeps serving Timlul untouched, we do
  NOT need to confirm Timlul's usage with the brother before cleaning. That decision moves to
  *deployment time* (weeks away), not now.

## Setup completed this session (all verified)

- `git clone` old repo → `C:\Users\Sagi\Desktop\Atlas` (full history; HEAD = `a298d46`).
- Copied the git-ignored runtime files the app needs: `.env.local` (secrets), `bin/yt-dlp.exe`,
  `.claude/settings.json` + `.claude/settings.local.json`, `.mcp.json`.
- Confirmed build cruft did **not** travel: no `node_modules`, `.next`, `.ds-sync`, `ds-bundle`.
- Set `origin` → `github.com/argamandev/Atlas-app` (private) and pushed `main`.
- `npm install` → clean (exit 0, 264 packages; 4 pre-existing vulns inherited, not new).
- **Boot verified on localhost:3005** — `GET /` → 200, `GET /app/home` → 200.

## Roadmap — each phase is its own small, testable cycle, done IN this clone

1. **Remove all Timlul code/files.** Use `LEGACY.md` as the deletion manifest (Wave 1 deletable
   now; Wave 2 after Atlas has its own login). The build-enforced guard test
   (`src/lib/legacyBoundary.test.ts`) protects against Atlas accidentally importing legacy code.
2. **Understand the codebase** (files, functions) — deepen `ARCHITECTURE.md` as we go.
3. **Delete unnecessary cruft** — the `scripts/` spike pile (161 files; split real tooling from
   throwaway spikes), duplicate UI primitive sets (`components/ui/` vs `components/ds/`), dead files.
4. **Rewrite `CLAUDE.md` / `PROGRESS.md` / `ARCHITECTURE.md`** — sharp, Atlas-only, no Timlul-era bloat.
5. **Build + test the smart harness** — two hooks (dangerous-command blocker + auto-format after
   edits), useful slash commands, a self-check/verify loop (browser MCP), and auto doc-management
   for better session-to-session continuity. Test it actually works.
6. **Verify the whole app works** post-cleanup (clone + localhost) — click through every page;
   run `npm test`.
7. **Start building the advanced product** — the real goal.

## Key facts to carry forward

- **Data lives in Supabase, not the repo.** Cloning/cleaning *code* never touches the real
  companies / transcripts / audio. The MP3s live in the Supabase Storage `audio-temp` bucket;
  transcripts live in the `transcripts` table (`formatted_data`, `word_segments`).
- **The live experience** (the "jump out of a live call, audio follows you" UX): engine =
  `scripts/live-broadcast.mjs`; screen = `components/live/`; the global audio-follows-you bar =
  `components/app/GlobalLiveBar.tsx` + `src/lib/live/LiveAudioProvider.tsx`; an ended call becomes
  a normal finished transcript via `src/lib/live/finishLiveCall.ts`.
- **Repos:** old (frozen, Timlul prod) = `github.com/argamandev/Investor-Transcript`;
  new (this, clean) = `github.com/argamandev/Atlas-app`.

## Next action for the fresh session in the clone

Read `CLAUDE.md` → re-read this spec → begin **Phase 1 (remove Timlul)** following `LEGACY.md`,
one small step at a time, testing before committing. `main` only ever gets tested, working code.
