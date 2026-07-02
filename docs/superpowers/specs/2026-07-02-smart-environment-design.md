# Atlas Smart Environment — Design (2026-07-02)

> **Mission 2 of the founder's build brief.** Build the working environment that lets a fleet of
> parallel Claude sessions develop Atlas's three big features safely, self-verifying, and
> compounding what they learn — with this design as the contract. Founder approved 2026-07-02
> (interactive brainstorm; decisions marked **[founder]**).

## Goal

Three parallel sessions (git worktrees), each attacking one big feature:

- **Lane F — Frontend import** from a fresh Claude Design export **[founder: export provided
  tomorrow]**, incl. the new Workspace + Agents pages (frontend-only, stub data).
- **Lane I — Independent IVRIT live pipeline**: Recall sends audio-only → RunPod IVRIT →
  text + word timestamps → the existing karaoke UX.
- **Lane M — Multi-view backend**: PDF ingest/render/mark-text/Ask-Atlas functionality
  (report + slides panels), design-glued after Lane F lands.

Plus a **supervisor session** (the ongoing main chat): reviews, merges, cross-lane
coordination, lesson distillation.

Sources shaping this design: the founder's harness-engineering doc (14-step roadmap),
Boris Cherny notes (self-seeing feedback loops, compound engineering), Karpathy's LLM-wiki
(compounding memory) — all in `C:\Users\Sagi\Desktop\Atlas Documents`.

## Locked decisions [founder]

1. **Merge model: supervisor gates; founder tests milestones.** Lanes self-verify and post
   READY-FOR-REVIEW on the board; the supervisor reviews each diff cold and merges small
   pieces frequently; the founder tests the product at meaningful milestones, not every
   micro-step. Only the supervisor pushes `main`.
2. **DB policy: lanes may apply additive-only migrations.** Destructive DDL
   (`DROP` / `TRUNCATE` / `ALTER … DROP`) is hard-blocked by hook. Every migration is posted
   to the board's CROSS-CUTTING section *before* applying. DB is shared with production
   Timlul — additive-only remains iron law.
3. **Lane F source of truth: a fresh Claude Design export** the founder provides (drop
   folder: `design-import/` at repo root, git-ignored).

## §1 Architecture — three floors

- **Floor 1, harness** (identical for every session): slim context + rules + hooks +
  permissions + skills, all in git (except machine-local files).
- **Floor 2, fleet**: 3 worktree sessions, own branch + dev port each, self-verifying via
  Chrome MCP before claiming anything works.
- **Floor 3, supervisor**: board watcher, cold reviewer, merger, conflict resolver,
  lesson distiller.

## §2 Memory — the shared brain

```
agent-memory/            ← git-ignored; ONE physical copy in the MAIN checkout
  BOARD.md               ← the shared brain (all sessions read/write live via absolute path)
  state-frontend.md      ← Lane F private working memory (owner-only writes)
  state-ivrit.md         ← Lane I
  state-multiview.md     ← Lane M
  state-supervisor.md    ← supervisor
```

Worktrees share one filesystem, so a git-ignored file at a fixed absolute path
(`C:\Users\Sagi\Desktop\Atlas\agent-memory\…`) gives true real-time sync with zero merge
conflicts. Git-tracked files cannot do this (per-branch visibility + guaranteed collisions).

**BOARD.md protocol:**
- One section per lane: status · last verified step · next step · blockers. A lane updates
  **only its own section**.
- **CROSS-CUTTING** section (everyone reads before big moves): schema changes (posted BEFORE
  applying), shared-type changes, design-token changes, port/engine claims.
- **READY-FOR-REVIEW** section: lane posts branch + what it built + how it verified;
  supervisor picks up from here.
- Cadence: read board at session start and before big moves; update own section after every
  meaningful step; **write before walking away** (end-of-session state dump).

**Knowledge flows down**: BOARD (minutes) → state files (session) → PROGRESS.md (at ship) →
CLAUDE.md (rarely, deliberate). Lessons that generalize graduate into skills.

## §3 Hooks — enforcement, not suggestion

Two sharp hooks (per the harness doc: one or two, not twenty), implemented as small
cross-platform Node scripts in `.claude/hooks/` (Node is guaranteed present; no bash/PowerShell
portability trap), wired in `.claude/settings.json`.

1. **PreToolUse gate** (matcher: Bash) — exit 2 blocks the call:
   - destructive DDL keywords (`DROP TABLE|DROP COLUMN|TRUNCATE|ALTER .* DROP`) in any command
     (covers psql/supabase/node -e paths);
   - `rm -rf` / `Remove-Item -Recurse -Force` targeting paths outside the scratchpad;
   - shell reads/edits of `.env*` (cat/sed/echo >) — env values never enter transcripts;
   - `git push --force` (always) and `git push` to `main` (allowed only for the supervisor —
     lane worktrees are identified by their path).
2. **PostToolUse verifier** (matcher: Edit|Write): if the file is `*.ts/tsx`, run Prettier on
   it + a fast incremental `tsc --noEmit` scoped check; report failures back into the session
   so they are fixed immediately, never shipped.

Non-goals: no judgment-call hooks (that is the model's job); no hook sprawl.

## §4 Rules — path-scoped truths (`.claude/rules/`)

- `parallel-work.md` — port map (supervisor 3000 / Lane F 3001 / Lane I 3002 / Lane M 3003);
  live engine :8788 is single-owner, claimed on the board; migrations posted before applied;
  never write another lane's state file; shared-surface changes (types, DS tokens, lib/api
  shapes) require a CROSS-CUTTING post first.
- `db.md` — shared-with-production Supabase: additive-only migrations, naming
  (`YYYYMMDD_NNN_description`), RLS expected on user-facing tables, flag anything ambiguous
  to the supervisor.
- `live.md` — live-engine gotchas (hard-refresh after dev restart; stale `.next` →
  MODULE_NOT_FOUND 500; engine holds state in memory → restart for clean tests; capture
  files reset per run; Recall accuracy captions lag 72–203s — not a bug).

## §5 CLAUDE.md diet + doc tiers

CLAUDE.md shrinks to ~1 page of standing facts: what Atlas is (3 sentences), stack, iron
rules (shared DB additive-only; test-before-merge; RTL discipline; work small), commands,
the doc map (ARCHITECTURE.md = code map · PROGRESS.md = decision log · agent-memory/BOARD.md =
live state · LEGACY.md = Wave-2 gateway · rules/ = scoped laws · skills = procedures), and the
mission status pointer. All current deep content **relocates** (never deleted): architecture
detail → ARCHITECTURE.md; live/pipeline gotchas → rules/; procedures → skills; historical
narrative → PROGRESS.md. Target: a cold session orients in one read; lanes stop paying a
279-line context tax.

## §6 Skills

- **`/verify-app`** (new): the self-seeing loop — ensure the lane's dev server is up on its
  port → drive Chrome MCP → walk the changed surface → screenshot → actually look → read
  console errors → iterate → only then report done. Includes per-lane recipes:
  - *Lane F*: screenshot imported page vs the Claude Design reference image; iterate until
    match; check EN/HE + RTL; stub-data pages must render without backend.
  - *Lane I*: replay harness (recorded PCM via `live-replay-engine.mjs`) through the IVRIT
    path; programmatic sync invariants (monotonic word timestamps; coverage vs audio duration;
    caption-vs-audio drift within buffer budget); gold-measurement comparison vs the Recall
    path on identical audio; screenshot karaoke mid-play.
  - *Lane M*: demo annual-report PDF (founder provides) as fixture → ingest → per-page text
    extraction asserts known Hebrew strings in correct order (the RTL-extraction risk, tested
    day one) → pdf.js render → select text via Chrome MCP → Ask Atlas → answer must quote the
    marked passage → screenshot multi-panel layout.
- **`/ship`** (new): the ritual — sync main into branch → `npm test` + `tsc` + `next build` →
  `/verify-app` → post READY-FOR-REVIEW on the board → supervisor reviews cold + merges +
  pushes → PROGRESS.md entry → board update. Lanes never push main themselves.
- Keep `/live-test` and `/transcript-review` unchanged.

## §7 Permissions

- Clean `settings.local.json` accumulated junk (incl. the pasted DB-URL fragment).
- Pre-approve the safe set: `npm test`, `npx tsc --noEmit`, `git status/diff/log/branch`,
  `curl localhost:*`, `node scripts/live-replay-engine.mjs`.
- Deny-list mirrors the hook (defense in depth).
- `.mcp.json` holds the Supabase access token: stays git-ignored (verified), never committed;
  same for `.env.local`.

## §8 Launch kit (`docs/LAUNCH-KIT.md`)

For the founder, morning-of: the 3 `git worktree add` commands (sibling folders
`../Atlas-frontend`, `../Atlas-ivrit`, `../Atlas-multiview`, branch each), a note that
`agent-memory/` and `design-import/` live in the MAIN checkout and are reached by absolute
path, and **one paste-and-go opening prompt per lane** containing: lane identity + branch +
port; board protocol (read first, own section only, cross-cutting duty); self-verification
duty (`/verify-app` before any "done"); definition of done for its milestone 1; where its
inputs live (Lane F: `design-import/`; Lane M: the demo PDF path; Lane I: replay assets).
Plus the supervisor loop description (this chat): watch board → review READY-FOR-REVIEW cold
→ merge small + often → bring milestones to the founder → distill lessons into skills/rules.

## §9 Verifying the environment itself (gate before opening the lanes)

1. Fire both hooks on purpose (attempt a `DROP TABLE` echo, a `.env` cat, a force-push, an
   unformatted edit) — each must block/fix deterministically.
2. Two-worktree board simulation — write from one, read from the other, prove real-time sync.
3. **Cold-session dry run** — a fresh session in the main checkout must orient purely from the
   new environment (find the board, know the rules, know the mission state) with no human help.
4. `npm test` + `tsc` + `next build` green; ship one trivial mini-feature end-to-end through
   `/ship` to prove the ritual.

## Build order (harness law: context → hooks → memory → skills → fleet)

1. §5 doc diet + §7 permissions
2. §3 hooks (tested by firing)
3. §2 memory + §4 rules
4. §6 skills
5. §9 environment verification
6. §8 launch kit → founder opens the 3 lanes

## Out of scope (deliberate)

- No loops/cron autonomy yet — loops come only after the harness is proven (harness doc's law).
- No product-side wiki/intelligence layer yet — the pattern is rehearsed here first; product
  application arrives with Workspace/Agents (noted in the roadmap memory).
- No Supabase branch databases — lanes develop against the shared DB under the additive-only
  law + board transparency.

## Risks & mitigations

- **Replay assets are volatile** — the engine truncates `scripts/out/broadcast-*` per run.
  The 2026-07-02 real-call capture (12 MB PCM + captions) is Lane I's test bench: the plan's
  first memory step archives it to `scripts/out/sessions/` before anything else runs the engine.
- **Hebrew PDF extraction quality (Lane M)** — spiked day one against the founder's demo PDF;
  fallbacks: extract from pdf.js text layer directly; OCR for stragglers. Viewing/scrolling is
  unaffected either way.
- **Lane collisions on shared surfaces** — CROSS-CUTTING protocol + supervisor merge gate +
  small frequent merges.
- **Board file contention** — sections are owner-scoped; writes are whole-file but rare and
  small; supervisor arbitrates any mangled state (git-ignored file, so no repo risk).
- **Founder bottleneck** — removed by design: milestone testing only.
