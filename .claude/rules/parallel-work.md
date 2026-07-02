# Parallel-work law (multi-session fleet)

- Ports: supervisor 3000 · frontend 3001 · ivrit 3002 · multiview 3003. Never take another
  lane's port. Live engine :8788 is SINGLE-OWNER — claim it in the cross-cutting log before
  starting it; release when done.
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
- Never edit another lane's state file.
- **Decisions are filed, not remembered:** the moment the founder decides anything (scope,
  UX, priorities, "do it that way"), append it as a `DECISION` line to cross-cutting.md —
  a decision living only in one session's chat is invisible to the rest of the fleet.
- **Answers are filed, not spoken:** any nontrivial produced knowledge (research result,
  investigation, "how X actually works") gets written into the right doc under `docs/`
  (or the relevant rule/skill) and indexed in CLAUDE.md's doc map — chat is not storage.
- Write before walking away: end every session by updating your state file + board section.
