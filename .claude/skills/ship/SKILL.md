---
name: ship
description: The shipping ritual for any finished mini-feature — sync main, run the full verification battery, append to the ready queue (lanes) or review+merge+push (supervisor), log PROGRESS.md. Also holds the feature-retirement ritual for finished lanes. Use whenever work is ready to leave a branch, and when a lane's whole feature completes.
---

# Ship — how work reaches main

main is always working. Only the supervisor pushes it. There are two roles:

## If you are a LANE session

1. Update your board section; re-read `agent-memory/cross-cutting.md` (someone may have
   changed shared surfaces under you).
2. `git fetch origin && git merge origin/main` into your branch; resolve; re-run everything.
3. Battery: `npm test` (all pass) · `npx tsc --noEmit` (clean) · `npm run build` (green) ·
   `/verify-app` (clean pass with screenshots).
4. Small labeled commits only — split anything mixed. Stage paths explicitly (`git add <paths>`),
   never `git add -A`/`git add .` — a blanket add swept untracked editor config into a commit
   once (2026-07-03); check `git status` for stowaways before every commit.
5. Push YOUR BRANCH: `git push -u origin <your-branch>` (pushing main is hook-blocked).
6. **Durable-evidence law:** anything you cite as evidence (quality reports, walkthrough
   sheets, captures, screenshots-described) must exist IN THE MAIN CHECKOUT before you cite
   it — reports/sheets → `docs/evidence/<branch>/`, call captures →
   `C:/Users/Sagi/Desktop/Atlas/scripts/out/sessions/`. A worktree path, a session temp dir,
   or an external URL may be *mentioned*, but never as the only copy (worktrees get removed,
   sessions die, links expire).
7. APPEND to `agent-memory/ready-queue.md`: timestamp · lane · branch · what it does · how
   verified (evidence refs per step 6) · any migrations/shared-surface changes. Append-only,
   never rewrite. Counts come from pasted git output (e.g. `git rev-list --count main..HEAD`)
   or ranges (`abc123..def456`) — never hand-typed numbers.
8. Update your state file (lessons learned → note candidates for skill graduation). Move on
   to your next step or wait if blocked.

## If you are the SUPERVISOR

1. Take the oldest unprocessed ready-queue entry. `git fetch origin && git checkout <branch>`.
   **First, check whether the lane is still LIVE** — a ready-queue entry does not mean the
   session ended. The tell: `git log -1 <branch>` newer than the lane's last board line, or a
   recently-modified `agent-memory/state-<lane>.md`. Never ask the founder "is that port
   leftover?" — they run several sessions and cannot know; on that answer a supervisor once
   killed a live lane's dev server (2026-07-31, no work lost, but the founder took the blame
   for a supervisor error). NEVER kill a process, wipe a `.next`, or run a build inside another
   lane's worktree while its session may be live. Verify in YOUR checkout instead.
2. **Dispatch the `atlas-reviewer` subagent on the branch** (fresh context, zero attachment —
   it checks correctness, iron rules, scope, secrets, evidence). Read its verdict. Then do
   your own pass over `git diff main...<branch>` for mission fit: does this advance the lane's
   MISSION line on the board? Re-run `npm test` + build yourself. Two independent gates —
   the reviewer's and yours — before anything touches main.
2b. **If you probe branch code directly, READ THE SIGNATURE AT THAT COMMIT AND INCLUDE A CONTROL
   WHOSE ANSWER YOU ALREADY KNOW.** Filed 2026-08-08, round 3 of `feat/workspace-tables`: a probe
   written against the previous round's signature kept running after the function lost a
   parameter, so every argument shifted one position and it reported five alarming failures that
   were pure artefact — a near-miss false BLOCKER on a branch already held twice. Nothing errored;
   the arguments were all the right TYPES. It was caught only because one control case returned
   something impossible. This is the repo's "a command answers the question you typed, not the
   question you meant" one turn further on: **when a function's shape changes under you, the
   command you typed stops being the question you mean, and silently.**
3. APPEND to the ready queue: the verdict line (`[ts] VERDICT lane/branch — APPROVED/CHANGES`)
   AND every reviewer finding as its own line — the reviewer's `FINDING …` text with YOUR
   timestamp prepended: `[ts] FINDING …` (findings must not evaporate — /fleet-lint greps
   them to detect repeated defect classes). CHANGES → also list the fixes in the lane's
   board section; stop here.
4. Merge: `git checkout main && git merge --no-ff <branch>` → battery again on main →
   `git push origin main`. Delete merged branch (coordinate with the lane for worktree branches).
   **A running dev server owns `.next`** — `npm run build` against a worktree it owns fails with
   `PageNotFoundError: /_document` or MODULE_NOT_FOUND. That is a stale artifact, NOT a broken
   branch: kill the dev server, `rm -rf .next`, rebuild. Best avoided entirely — run the build
   on merged main in your own checkout (per step 1, don't build inside a live lane's worktree).
5. **Merge-time doc truth** (these fire at EVERY merge — retirement is too rare to carry them):
   - Append PROGRESS.md entry (3-5 bullets: what + why + verification).
   - Update ARCHITECTURE.md for any new/moved/deleted files this merge introduces.
   - Stamp any plan/spec in `docs/superpowers/` whose scope this merge completes with the
     historical banner (`> STATUS: SHIPPED — historical record, do not execute; current truth
     lives in ARCHITECTURE.md + PROGRESS.md`) — stamped in place, never moved.
   - **SWEEP, don't remember.** Editing the docs you recall is not a doc update: on
     `fix/app-login-gate` that failed FOUR consecutive review rounds (2026-08-01). Close this
     item only by grepping the **falsified claim** — not the feature name — across every tracked
     doc **AND `agent-memory/`**, then reading each hit. `agent-memory/` is git-ignored, so a
     tracked-file sweep is structurally blind to `BOARD.md` and the lane state files: **the
     documents a new session is BORN from**, where a stale claim does the most damage because a
     lane born on a false premise produces confident wrong work instead of an error. Legitimate
     survivors are dated log entries and SHIPPED-stamped plans — never rewrite those; rewriting
     a dated record falsifies it. Any COUNT you write (tests, routes, findings) comes from a
     command, never from memory — three hand-typed counts were wrong on that one branch.
   - **If the merge invalidates how another lane VERIFIES** (a screenshot recipe, a probe, a
     fixture — not just what it builds), push it to that lane the same session via the dated
     `[supervisor note YYYY-MM-DD]` line the parallel-work law permits in its board section. The
     lane cannot know its recipe expired, and the dangerous failures are the ones that still
     produce plausible output: after the login gate, an anonymous screenshot silently became a
     picture of the login page — a real screenshot of a real page, which passes review.
   - Commit + push the above.
6. **Lint counter:** append `[ts] MERGE supervisor — <branch> → main (<sha>)` to
   cross-cutting.md. Then count MERGE lines since the last `LINT` line: **≥3 → run
   /fleet-lint NOW**, before updating the board. The lint is mechanical, not a mood.
7. Update the board (your section + the lane's MISSION line if its focus moved). Ping the
   founder when a MILESTONE is testable.
8. Distill: any general lesson from this ship → the relevant skill or rules file.

## Feature retirement (supervisor, when a lane's WHOLE feature is done)

1. Confirm the last piece merged and the milestone was founder-tested.
2. **Rescue evidence FIRST:** sweep the worktree for anything cited on the board/queue that
   lives only there (git-ignored reports, `.superpowers/` ledgers, `scripts/out/` captures) —
   copy to `docs/evidence/` / `scripts/out/sessions/` in the main checkout BEFORE any removal.
3. Distill the lane's state file one final time: general lessons → skills/rules.
4. Append the feature's story to PROGRESS.md (the permanent compact record). Plans/specs
   should already carry the SHIPPED banner from merge-time step 5 — verify, stamp any missed.
5. Archive the state file → `agent-memory/archive/state-<lane>-<feature>-<date>.md`; create a
   fresh empty state file for the seat.
6. Reset the lane's board section to `idle — awaiting next assignment` and update MISSION.
7. If the seat won't be reused soon: `git worktree remove <path>` + delete the branch.
8. New feature intake: founder brief → brainstorm/spec → write the new opening prompt →
   update MISSION + the lane section → founder pastes the prompt in the lane session.

## Re-mission runbook (supervisor, when a lane's MISSION changes but the seat continues)

The path exercised when a lane finishes a chapter and the founder redirects it. A lane's
identity lives in exactly four files; a re-mission touches all four, in this order:

1. **The decision is already filed** — a `DECISION` line in cross-cutting.md the moment the
   founder decides (parallel-work law). If missing, file it now with the founder's words.
2. **Close the old chapter** — everything merged, findings filed, lessons graduated, evidence
   rescued from the worktree (retirement step 2), plans/specs stamped SHIPPED.
3. **Brainstorm with the founder** (in the LANE's session, brainstorming skill) → spec + plan
   in `docs/superpowers/`. No identity rewrite before a spec exists — a lane must not be
   reborn with a vague mission.
4. **Rewrite the four identity files:**
   - `agent-memory/BOARD.md` MISSION section — the lane's new one-line north star.
   - `agent-memory/BOARD.md` lane section — reset status/next; old milestone stays as record.
   - `docs/LAUNCH-KIT.md` — the lane's opening prompt rewritten for the new mission (this is
     the file a fresh session is BORN from; a stale prompt births a lane with a dead mission).
   - `agent-memory/state-<lane>.md` — distill + archive per retirement steps 3+5.
5. **Relaunch** — founder pastes the new prompt in the lane session; the loop resumes.
