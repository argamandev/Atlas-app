# 02 — The retirement

**What to build:** The standing fleet apparatus stops being something every session carries,
and becomes history a session can go and read when it needs to (ADR-0001).

The board, the ready-queue and the per-lane state files move to history — preserved
verbatim, nothing learned is lost — and leave the always-on set. The cross-cutting log
shrinks to the one job that survives: the narrow set of things two simultaneous sessions can
genuinely break for each other, being a database migration, a shared type, or a design
token. Operational facts about the live engines stop loading for the many sessions that
never touch them.

Then the always-on documents stop describing a fleet that no longer exists: the parallel-work
rule retires, supervisor and lane language goes, and the vocabulary matches the glossary —
*worktree*, *session*, *mission*. The two fully-merged worktrees are removed, and the prose
lint that a human had to remember to run is retired in favour of the test from ticket 01,
which now does its job mechanically.

The point of ordering this after 01 is that the test is what makes "the fleet is gone" a
verified fact rather than a belief.

**Blocked by:** 01 — The machinery

**Status:** ready-for-agent

- [ ] The board, ready-queue and lane state files are preserved as history, readable on demand, and absent from the always-on set
- [ ] Their content is preserved verbatim — this is a move, not a rewrite, and no correct prose is re-authored
- [ ] The cross-cutting log is scoped to collisions only: a migration, a shared type, a design token — current era only
- [ ] Operational engine facts are removed from the always-on set and load on demand
- [ ] The always-on documents no longer describe lanes, a supervisor role, or the parallel-work rule
- [ ] The word "lane" does not appear in the always-on set, and the environment test asserts it cannot return
- [ ] The two fully-merged worktrees are removed
- [ ] The prose fleet lint is retired, with its checks either covered by the environment test or explicitly recorded as dropped and why
- [ ] The environment test is green, and the reported token budget is materially lower than before this ticket
- [ ] The count of unenforced laws is unchanged or lower — this ticket must not quietly weaken a law while moving it
