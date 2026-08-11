---
status: accepted
date: 2026-08-12
---

# Retire the standing agent fleet

Atlas was built by four standing agent "lanes" in parallel worktrees, coordinated
through a shared 179 KB `BOARD.md`, four state files and two append-only logs. Over
90 days that produced 590 commits and 28 lane landings — but only **8 days out of
~47 active days saw two lanes land work concurrently**, while **10 of 38 merges were
lanes re-syncing `main` into themselves**, and **207 of 590 commits (35%) touched no
product code at all**. We were paying the coordination cost daily and collecting the
parallelism benefit about 17% of the time. So the standing apparatus is retired:
work is single-session by default, a worktree is created on demand when two efforts
must not touch the same files, and sessions coordinate through `main` plus one small
file for genuine collisions.

## Considered options

- **Keep the fleet.** It shipped a live product, which is real evidence. Rejected
  because the measurements show the concurrency it charges for was rarely used, and
  because the founder — the only person who can correct this system — could no longer
  read it.
- **Kill parallelism entirely.** Rejected: occasionally two efforts genuinely are
  independent, and `git worktree` already provides that for free. What was costly was
  *standing* parallelism, not parallelism.

## Consequences

Two simultaneous sessions no longer have a shared brain, so a mission must be
self-contained enough that a fresh session can execute it from the repo alone. That is
a real constraint on how work is written up, and it is the point rather than a
side effect. Collisions that `main` cannot arbitrate — a Supabase migration against the
database shared with production Timlul, a shared type, a design token — still need an
explicit channel, which is the one coordination file that survives.
