# Parallel-work law (multi-session fleet)

- Ports: supervisor 3000 · frontend 3001 · ivrit 3002 · multiview 3003. Never take another
  lane's port. Live engine :8788 is SINGLE-OWNER — claim it in BOARD.md CROSS-CUTTING before
  starting it; release when done.
- The board (`C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md`): read at session start and
  before big moves. Update ONLY your own lane section + CROSS-CUTTING/READY-FOR-REVIEW.
  Never edit another lane's state file.
- Post to CROSS-CUTTING **before**: applying any DB migration; changing shared types
  (`src/lib/types.ts`, `lib/api/types`), design tokens/DS components; changing lib/api or
  lib/db shapes.
- Lanes NEVER `git push` to main (hook-blocked) — finish via `/ship` → READY-FOR-REVIEW.
- Write before walking away: end every session by updating your state file + board section.
