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
6. APPEND to `agent-memory/ready-queue.md`: timestamp · lane · branch · what it does · how
   verified (evidence refs) · any migrations/shared-surface changes. Append-only, never rewrite.
7. Update your state file (lessons learned → note candidates for skill graduation). Move on
   to your next step or wait if blocked.

## If you are the SUPERVISOR

1. Take the oldest unprocessed ready-queue entry. `git fetch origin && git checkout <branch>`.
2. **Dispatch the `atlas-reviewer` subagent on the branch** (fresh context, zero attachment —
   it checks correctness, iron rules, scope, secrets, evidence). Read its verdict. Then do
   your own pass over `git diff main...<branch>` for mission fit: does this advance the lane's
   MISSION line on the board? Re-run `npm test` + build yourself. Two independent gates —
   the reviewer's and yours — before anything touches main.
3. APPEND to the ready queue: the verdict line (`[ts] VERDICT lane/branch — APPROVED/CHANGES`)
   AND every reviewer finding as its own line — the reviewer's `FINDING …` text with YOUR
   timestamp prepended: `[ts] FINDING …` (findings must not evaporate — /fleet-lint greps
   them to detect repeated defect classes). CHANGES → also list the fixes in the lane's
   board section; stop here.
4. Merge: `git checkout main && git merge --no-ff <branch>` → battery again on main →
   `git push origin main`. Delete merged branch (coordinate with the lane for worktree branches).
5. Append PROGRESS.md entry (3-5 bullets: what + why + verification). Commit + push.
6. Update the board (your section + the lane's MISSION line if its focus moved). Ping the
   founder when a MILESTONE is testable.
7. Distill: any general lesson from this ship → the relevant skill or rules file.

## Feature retirement (supervisor, when a lane's WHOLE feature is done)

1. Confirm the last piece merged and the milestone was founder-tested.
2. Distill the lane's state file one final time: general lessons → skills/rules.
3. Append the feature's story to PROGRESS.md (the permanent compact record).
   Stamp the feature's plan/spec files in `docs/superpowers/` with the historical banner
   (`> STATUS: SHIPPED — historical record, do not execute; current truth lives in
   ARCHITECTURE.md + PROGRESS.md`) — stamped in place, never moved (moves break references).
4. Archive the state file → `agent-memory/archive/state-<lane>-<feature>-<date>.md`; create a
   fresh empty state file for the seat.
5. Reset the lane's board section to `idle — awaiting next assignment` and update MISSION.
6. If the seat won't be reused soon: `git worktree remove <path>` + delete the branch.
7. New feature intake: founder brief → brainstorm/spec → write the new opening prompt →
   update MISSION + the lane section → founder pastes the prompt in the lane session.
