# Parallel-work law (multi-session fleet)

- Ports: supervisor 3000 · frontend 3001 · ivrit 3002 · multiview 3003. THIS LINE is the
  single source of truth for ports — when any other doc restates a number and disagrees,
  this line wins; new/edited docs must reference it, not restate (fleet-lint check 6 flags
  restatements). Never take another lane's port. Live engine :8788 is SINGLE-OWNER — claim
  it in the cross-cutting log before starting it; release when done.
- Shared memory (absolute paths — work from any worktree):
  - `C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md` — mission + lane sections. Read at
    session start and before big moves. Edit ONLY your own lane section.
  - `C:/Users/Sagi/Desktop/Atlas/agent-memory/DECISIONS.md` — **every founder decision, one line
    each, PERMANENT and never compacted.** Read this before proposing anything the founder may
    already have settled. It is an INDEX: the full verbatim entry is in the archive below.
  - `C:/Users/Sagi/Desktop/Atlas/agent-memory/cross-cutting.md` — APPEND-ONLY alerts log.
  - `C:/Users/Sagi/Desktop/Atlas/agent-memory/ready-queue.md` — APPEND-ONLY review queue.
  - Appends go via `>>` or `fs.appendFileSync` — never rewrite the two logs, never Edit them.
- **The two logs hold the CURRENT ERA ONLY (since 2026-08-09). Everything before that is
  verbatim and complete in `docs/archive/{cross-cutting,ready-queue}-2026-07-03--2026-08-10.md`,
  which are git-TRACKED** (the live logs are git-ignored, so the archive is the durable copy).
  **⇒ ANY SEARCH FOR PRIOR ART MUST INCLUDE THE ARCHIVE.** "It is not in cross-cutting" now means
  "it is not in the last few days", which is not the same sentence and must not be reported as it.
- **Compaction is the ONE sanctioned rewrite, it needs the founder's approval AND a verified
  snapshot first, and NO assistant session can perform it** — `Write`/`Edit` on both logs are in
  `settings.json`'s deny list and `pre-bash-gate.mjs` blocks `>`, `sed -i`, `tee`, `cp`, `mv`,
  `writeFileSync`, `rm` and `dd` onto them. That is deliberate. Prepare the new bodies, verify
  them, and hand the founder the placement commands — the same path migration 020 took.
- **Keep entries SHORT.** The logs are a hot working surface, not a report: a MERGE or FINDING
  line is ~3 lines naming what changed and who it bites. Detail belongs in
  `docs/evidence/<branch>/`, which already exists for exactly this. The 2026-08-10 compaction was
  needed because entries had grown to 13+ lines against a 4-line average.
- APPEND to cross-cutting BEFORE: applying any DB migration; changing shared types
  (`src/lib/types.ts`, `lib/api/types`), design tokens/DS components; changing lib/api or
  lib/db shapes. Read it before big moves — someone may have changed ground under you.
- Lanes NEVER push main (hook-blocked) — finish via `/ship` → append to the ready queue.
- Never edit another lane's state file. **One narrow exception (supervisor only, so stale
  sections stop being structurally uncorrectable):** at merge, retirement, or re-mission the
  supervisor may APPEND a dated `[supervisor note YYYY-MM-DD] …` line inside a lane's board
  section (e.g. "merged; next-line stale") and a dated `[graduated → <destinations> —
  supervisor YYYY-MM-DD]` marker under a lane state file's Lessons section. Notes and markers
  only — never rewriting the lane's own words.
- Counts on the board/queue (commits, tests) come from pasted git/test output or ranges
  (`abc123..def456`), never hand-typed from memory — three hand-typed counts disagreed once
  (2026-07-04: "18", "16", real 17).
- **Decisions are filed, not remembered:** the moment the founder decides anything (scope,
  UX, priorities, "do it that way"), append a one-line entry to **`agent-memory/DECISIONS.md`**
  — a decision living only in one session's chat is invisible to the rest of the fleet.
  **IN HIS OWN WORDS, quoted.** If the decision also moves shared ground (a migration, a shared
  type, a lane's mission), append the FULL entry to cross-cutting.md as well: DECISIONS.md is the
  permanent index, cross-cutting is what a lane reads before its next move.
- **Answers are filed, not spoken:** any nontrivial produced knowledge (research result,
  investigation, "how X actually works") gets written into the right doc under `docs/`
  (or the relevant rule/skill) and indexed in CLAUDE.md's doc map — chat is not storage.
- **The 5-strike rule (circuit breaker):** ~5 failed attempts at the SAME problem → STOP.
  Do not grind tokens on a loop. Write what you tried + what failed to your state file,
  append `[ts] ALERT lane — stuck on <problem>, 5 strikes, escalating` to cross-cutting.md,
  and hand it to the supervisor (who involves the founder if needed). Being stuck is data;
  burning the budget on it is the only failure.
- **Brainstorm before building:** every new feature starts with the brainstorming skill →
  spec → written plan (docs/superpowers/) → only then code. The founder joins the brainstorm.
- Write before walking away: end every session by updating your state file + board section.
