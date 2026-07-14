# Parallel-work law (multi-session fleet)

- Ports: supervisor 3000 · frontend 3001 · ivrit 3002 · multiview 3003. THIS LINE is the
  single source of truth for ports — when any other doc restates a number and disagrees,
  this line wins; new/edited docs must reference it, not restate (fleet-lint check 6 flags
  restatements). Never take another lane's port. Live engine :8788 is SINGLE-OWNER — claim
  it in the cross-cutting log before starting it; release when done.
- Shared memory (absolute paths — work from any worktree):
  - `C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md` — mission + lane sections. Read at
    session start and before big moves. Edit ONLY your own lane section.
  - `C:/Users/Sagi/Desktop/Atlas/agent-memory/cross-cutting.md` — APPEND-ONLY alerts log.
  - `C:/Users/Sagi/Desktop/Atlas/agent-memory/ready-queue.md` — APPEND-ONLY review queue.
  - Appends go via `>>` or `fs.appendFileSync` — never rewrite the two logs, never Edit them.
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
  UX, priorities, "do it that way"), append it as a `DECISION` line to cross-cutting.md —
  a decision living only in one session's chat is invisible to the rest of the fleet.
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
