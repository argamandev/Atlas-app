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

**Status:** done

- [x] The board, ready-queue and lane state files are preserved as history, readable on demand, and absent from the always-on set
- [x] Their content is preserved verbatim — this is a move, not a rewrite, and no correct prose is re-authored
- [x] The cross-cutting log is scoped to collisions only: a migration, a shared type, a design token — current era only
- [x] Operational engine facts are removed from the always-on set and load on demand
- [x] The always-on documents no longer describe lanes, a supervisor role, or the parallel-work rule
- [x] The word "lane" does not appear in the always-on set, and the environment test asserts it cannot return
- [x] The two fully-merged worktrees are removed
- [x] The prose fleet lint is retired, with its checks either covered by the environment test or explicitly recorded as dropped and why
- [x] The environment test is green — **but read the budget note below before treating "materially lower" as met**
- [x] The count of unenforced laws is unchanged or lower — this ticket must not quietly weaken a law while moving it

## What landed

**History, verbatim.** `docs/archive/agent-memory-snapshots/2026-08-12-fleet-retired/` holds
`BOARD.md`, both logs, all four state files, `parallel-work.md`, `LAUNCH-KIT.md` and
`ENVIRONMENT.md` — each copied whole and verified byte-identical with `cmp`, never extracted.
`RETIRED.md` in that folder is the index. The one thing that was NOT archived-and-closed is
`DECISIONS.md`: it moved verbatim to the repo root and stays live, which finally puts the
permanent record of every founder decision in git instead of on one git-ignored disk.

**The collision channel.** `COLLISIONS.md` at the repo root, scoped to a migration, a shared type
or a design token. The deny-list and `pre-bash-gate.mjs` followed it there, and the gate's
destination check was widened from one hard-coded directory prefix to the basename — the old form
only recognised `agent-memory/cross-cutting.md`, so `./cross-cutting.md` walked past it, and after
the move to the repo root that near-miss is the ordinary way to write the path. The fleet's two
log names are still protected, deliberately: they survive under `docs/archive/`, and history is
exactly what must not be rewritten. **96/96 gate tests pass, up from 77** — run it, do not read it.

**The always-on set** is now `CLAUDE.md` · `CONTEXT.md` · `STATUS.md` · `app.md` · `db.md`, which
is the set the spec declares. `CONTEXT.md` and `STATUS.md` join as `@imports`, and
`discoverAlwaysOn` now FOLLOWS imports transitively — without that, the budget would price the
pointer instead of the paste, which is the failure M1 names. `live.md` became
`docs/live-engines.md`; `parallel-work.md` is gone, its four surviving rules folded into
CLAUDE.md § Working shape.

**The vocabulary cannot come back.** A new test fails the battery if `lane`, `supervisor`,
`BOARD.md`, `ready-queue`, `cross-cutting`, `agent-memory` or `parallel-work` appears in the
always-on set. It asserts an ABSENCE, so no sentence is pinned and improving any document cannot
break it. Two exemptions, both stated: `CONTEXT.md`, because a glossary that may not name the word
it retired cannot do its job; and a citation whose path is under `docs/archive/`, because pointing
at history is where the retirement PUT these things — `withoutArchivePaths` draws that line and a
fixture proves both directions. Verified by mutation, not by reading: inserting "your lane and
port" into the real `CLAUDE.md` turned it red, and reverting turned it green.

**⚠ The budget checkbox is met on removals and NOT on the net number, and that is a founder call.**
Before: 9,315 tokens over 5 files. After: **8,846 over 5 files — only 5% lower.** Removed:
`parallel-work.md` (1,276), `live.md` (574) and ~350 tokens of CLAUDE.md fat, about 2.2k, a
quarter of the old set. Added back deliberately: `CONTEXT.md` (780) and `STATUS.md` (500), because
the spec names them as part of the set. So the retirement did cut a quarter; the spec then spent
half of it on the glossary and the status page. `TOKEN_BUDGET` is 9,000 with 154 spare. **If the
6–8k target matters more than having the glossary always-on, dropping the two `@imports` reaches
~7.6k immediately** — that is a one-line change to `CLAUDE.md`, and it is his to make, not one to
be made quietly inside a retirement ticket.

**Unenforced laws: 16, unchanged.** No law was touched except two provenance citations repointed
into the archive. `db.md` stays exempt from the law scan, and its exemption reason was corrected:
the previous text promised this ticket would convert it, which would have RAISED the count while
this ticket was required not to move it. It now says plainly that its rules are invisible to the
scan and that converting them is separate work.

**Also found and fixed while sweeping:** four live documents still pointed at the retired brain —
`ARCHITECTURE.md` (the append-log door), `docs/VISION.md` (mission status "lives in BOARD.md"),
`docs/MAYA-API.md` and `src/lib/i18n/format.ts` (both citing decisions filed in `cross-cutting.md`).
Dated records in `docs/evidence/`, `docs/audits/` and `PROGRESS.md` were left alone: they were true
when written, and rewriting a dated record falsifies it.

## Left for the founder

- **A 35 KB skeleton of `Atlas-frontend` survives on disk.** Both worktrees are deregistered from
  git and `Atlas-ivrit` is fully gone, but an OS handle holds `Atlas-frontend/design-import`, so
  the last two empty directories could not be removed. `rmdir /s /q C:\Users\Sagi\Desktop\Atlas-frontend`
  after closing whatever has it open. **Nothing is at risk:** `design-import/` existed ONLY in that
  worktree and was copied to `C:/Users/Sagi/Desktop/Atlas/design-import` first (15 files, 1.5 MB,
  `diff -rq` clean), and `Atlas-ivrit`'s `.superpowers/sdd` ledger was copied to
  `Atlas/.superpowers/sdd-feat-ivrit-pipeline`. Its three archived call sessions were already
  byte-identical in the primary checkout.
- **The live `agent-memory/` folder is untouched**, with a `RETIRED.md` tombstone added pointing at
  the archive. It is git-ignored and now fully duplicated in git, so it can be deleted — but
  deleting a founder's only local copy of anything is his call, not a session's.
- **`COLLISIONS.md` carries one throwaway line** (`SMOKE — append door verified`) from testing the
  append door. Removing it needs a whole-file rewrite, which the gate correctly refuses. It was
  left rather than routed around.
