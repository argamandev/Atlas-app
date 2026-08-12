Status: ready-for-agent

# Retire the fleet and make the environment self-correcting

## Problem Statement

Atlas is built by a solo non-engineer founder working through Claude sessions. The
environment those sessions run in has grown to 146 markdown files and 2.8 MB, organised
around a 4-lane agent fleet with a shared 179 KB `BOARD.md`, four lane state files, and
two append-only logs. The founder cannot read it, cannot predict what a session will do
with it, and therefore cannot correct it — which matters because he is the only person
who can.

Three concrete symptoms:

1. **Cost without benefit.** Sessions are instructed to read the board at start and the
   logs before "big moves" — roughly 45k and 26k tokens of mostly closed history. Over 90
   days the fleet landed work concurrently on 8 days out of ~47 active days, while 10 of
   38 merges were lanes re-syncing `main` into themselves, and 207 of 590 commits touched
   no product code at all.

2. **No eviction.** Three of the four memory files are append-only by written rule.
   Two-thirds of the board is labelled "CLOSED CHAPTER" or "PREVIOUS CHAPTER" *by the
   board itself*, and nothing removes it. Any structure built here regrows to 2.8 MB
   unless something takes things out.

3. **Lessons that do not hold.** Defects are recorded diligently — some filed four times
   across four documents — and recur anyway, up to a 7th occurrence. Sorting the laws by
   whether they carry an enforcement mechanism explains it exactly: laws enforced by a test
   stopped recurring; laws marked `ENFORCED none` are the ones that keep coming back.

The founder's goal is not a tidier repo. It is to develop the product accurately, one
piece at a time, in an environment he understands.

## Solution

Retire the standing fleet apparatus, cap what loads on every session, make eviction
automatic at merge, and give the workflow's own laws the same enforcement the product's
laws get.

From the founder's perspective, afterwards:

- He starts a session, and it knows what Atlas is, what the laws are, and where he is —
  from about 6–8k tokens instead of ~60k.
- He opens `STATUS.md` and it is one page describing now, not a log of everything.
- When he wants two things at once, he makes a second worktree and closes it when done.
  There is no board to update, no lane to claim, no queue to append to.
- When a defect recurs, the fix does not merge until something mechanical stops it
  recurring again — and he can see the system's health with one command.

## User Stories

1. As the founder, I want a session to know what Atlas is without me explaining it, so that I can start working immediately.
2. As the founder, I want a session to know where I am and what I am mid-way through, so that I do not have to reconstruct it from memory.
3. As the founder, I want the always-on context to fit a readable budget, so that I can actually read everything a session is told.
4. As the founder, I want to read every always-on file end to end in under ten minutes, so that I can tell when one is wrong.
5. As the founder, I want status separated from law, so that stale status cannot masquerade as a rule.
6. As the founder, I want facts separated from laws, so that reference material about MAYA or Recall does not cost me a session where I never touch that code.
7. As the founder, I want `STATUS.md` rewritten rather than appended, so that it cannot become another board.
8. As the founder, I want a hard cap on `STATUS.md`, so that "rewritten" is enforced rather than intended.
9. As the founder, I want finished work evicted from the always-on set at merge, so that removal happens without me deciding to do it.
10. As the founder, I want the retired board, queue, logs and state files preserved as history, so that nothing learned is lost when the apparatus goes.
11. As the founder, I want to work on two features at once without a shared brain, so that parallelism costs me nothing when I am not using it.
12. As a session, I want to know the small set of things another session could break for me — a migration, a shared type, a design token — so that concurrent work stays safe on a database shared with production.
13. As the founder, I want the word "lane" gone, so that an empty worktree can never again read as active work.
14. As the founder, I want stale worktrees removed, so that the shape of my work is visible from the repo.
15. As a reviewer, I want to be asked whether a defect is a recurrence, so that the question is never skipped.
16. As a reviewer, I want a recurring defect to gain a mechanism one tier stronger before merge, so that the fix is the last one of its kind.
17. As a reviewer, I want an explicit escape hatch for laws that genuinely cannot be mechanised, so that nobody writes a fake mechanism to satisfy a gate.
18. As the founder, I want laws that cannot become tests to become fixed checklist items instead, so that compliance does not depend on recalling rule 14 of 27.
19. As the founder, I want one command that reports how many laws are unenforced, so that I can see whether the system is improving.
20. As the founder, I want the workflow's own laws enforced by the test battery, so that the workflow is not exempt from the rule it imposes on the product.
21. As a session, I want the environment checks to fail loudly in `npm test`, so that drift is caught by the battery rather than by a human noticing.
22. As the founder, I want the destructive-SQL gate to keep working after the fleet is gone, so that retiring the apparatus does not weaken the database protections.
23. As the founder, I want tickets committed with the branch, so that the work and its description travel together.
24. As the founder, I want the product's next chapter — the smart layer over chat, workspace and agents — untouched by this change, so that I can start it cleanly afterwards.

## Implementation Decisions

**Working shape (ADR-0001).** Single session by default. A worktree is created on demand
when two efforts must not touch the same files, and removed when the work lands. Sessions
integrate through `main`. The standing apparatus — the board, the four lane state files,
the ready-queue, the parallel-work rule, and the supervisor role — is retired.

**Collision channel.** The one thing `main` cannot arbitrate ahead of time is a change two
simultaneous sessions could break for each other: a Supabase migration (the database is
shared with production Timlul), a shared type, a design token. `cross-cutting.md` is
slimmed to this purpose and nothing else. It stays append-only *for the current era only*,
and eviction moves closed eras to history.

**The always-on set is declared, closed, and budgeted.** Exactly: `CLAUDE.md`, the laws
(`app.md`, `db.md`), `CONTEXT.md`, and `STATUS.md`. `live.md` becomes on-demand — it is
almost entirely operational facts about two engines, irrelevant to most sessions. Adding a
file to the always-on set is a deliberate act that fails the environment test until
declared.

**Law, fact, history, status are four different things with four homes.** A **law**
constrains how Atlas is built and is always-on. A **fact** describes how something outside
Atlas behaves, cannot be violated, and loads on demand. **History** is why a law exists and
is read only when a law is challenged. **Status** is now, lives in one rewritten file, and
never appears in a law file. `CONTEXT.md` defines all four.

**Every law declares its enforcement.** Each law carries either a mechanism or an explicit
`UNENFORCEABLE` marker with a stated reason. `ENFORCED none` is not an acceptable terminal
state for a law that has recurred. The existing `LAW / ENFORCED / VERIFY` structure in
`app.md` already implements this shape and is kept.

**The promotion ladder (ADR-0002).** Strongest first: **impossible** (the mistake cannot be
expressed) → **test** → **hook or grep** → **ritual gate** (a fixed checklist item that
fires every time) → **prose**. A recurrence moves a law up a tier; it never restates it at
the same tier.

**The gate is at review, not after merge.** The reviewer must answer whether a finding is a
recurrence of a known law, and the mechanism ships in the same commit as the fix. This is
the only moment when adding the mechanism is cheap.

**Eviction is bound to merge.** When work lands, its working notes become history in the
same motion and `STATUS.md` is rewritten. Nothing in the always-on set is append-only.
Eviction belongs in the existing ship ritual, not in a periodic sweep — a periodic sweep is
how the current state was reached.

**Health metric.** The count of unenforced laws is reported by one command and is expected
to trend down. This is what "self-improving" means here: not better-written lessons, but a
system that can see whether the last one worked.

**Hook fallout, which is load-bearing.** The destructive-SQL gate and its test matrix
hard-code fleet paths — a supervisor checkout constant, a lane worktree constant, and a
settings deny-list pinned to the two append-only logs. Retiring the fleet touches all three.
The gate's protections must not weaken; its existing test matrix is extended rather than
replaced, and the deny-list follows the files to their new homes.

**Vocabulary.** `CONTEXT.md` is the source of truth. "Lane" is retired and split into
*worktree*, *session* and *mission*; the migration includes removing the word from the
always-on files.

**Documentation is renamed, not rewritten.** The 146 existing files are not rewritten. They
are re-homed: laws stay always-on, history moves to case history, closed chapters move to
archive. Text that is already correct is not touched.

## Testing Decisions

**A good test here asserts external, observable properties of the environment** — what a
session is handed, and whether a law carries a mechanism — never the prose of any particular
document. It must fail for the *class* of drift, not for one instance of it. A test that
asserts a specific sentence exists is a test that will be deleted the first time someone
edits the sentence.

**One seam, and it already exists.** The environment's laws become tests in the existing
vitest battery, so they run in `npm test` and cannot be forgotten.

**Prior art, deliberately copied:** the API auth boundary test. It walks every route file,
splits it into exported handlers, fails the battery for any method that resolves no user,
and carries an allowlist where every entry must state its reason. That shape — enumerate
from the filesystem, assert a structural property, require a stated reason for each
exception — is exactly what the environment test needs. `app.md` describes the effect as
"API auth is now a TEST, not a habit"; this is the same move applied to the workflow.

**What the environment test asserts:**

- The always-on set contains exactly the declared files — a new one fails until declared.
- The always-on set stays under its token budget.
- `STATUS.md` is under its line cap.
- Every law carries a mechanism or an `UNENFORCEABLE` marker with a reason.
- No law that has recurred is left with no mechanism.
- Retired constructs — the board, the ready-queue, the lane state files, the word "lane" —
  do not appear in the always-on set.
- Every document referenced by the always-on set exists.

**Existing batteries are extended, not replaced.** The destructive-SQL gate has its own fire
test matrix; changes to its path constants extend that matrix. The battery is run under
`TZ=UTC` as well as locally, per the existing law — and note that a `TZ=` prefix containing
a slash is silently ignored in Git Bash, so the zone is verified from inside the run, never
assumed from the command line.

**Not tested:** whether the founder finds the result readable. That is judged by him reading
it, which is a ritual gate in the ship checklist, not an assertion.

## Out of Scope

- **The smart layer** over chat, workspace and agents. It is the next chapter and it starts
  after this lands. Nothing in this spec touches product code.
- **Rewriting the content of existing documentation.** Files move and shrink; correct prose
  is not re-authored.
- **Migrating to GitHub Issues.** Deliberately deferred with the ceiling recorded; re-run the
  setup skill when it bites.
- **Visual-regression testing** for the laws that cannot be mechanised. They become ritual
  gates; real visual testing is its own project.
- **Changing the review agent or the cold-review practice.** Discovery already works — it
  repeatedly caught what both the lane and the supervisor missed. Only the disposal of what
  it finds changes.
- **`PROGRESS.md`, `ARCHITECTURE.md` and the archive.** They are on-demand already and are
  not in the always-on budget.

## Further Notes

The spec names specific documents because in this feature the documents *are* the subject —
`STATUS.md` is a decision, not an incidental path. Code paths are still avoided.

The riskiest part is not the retirement; it is the eviction rule. Everything else is a
one-off move that either happened or did not. Eviction is the only part that must keep
working forever, and it is the only reason to believe this does not regrow. If a ticket has
to be cut for time, cut a retirement, never the eviction mechanism or the environment test.

The second risk is the destructive-SQL gate. It protects a database shared with live
production Timlul, and it is wired to paths this change removes. Its ticket should be worked
before the worktrees are retired, not after.
