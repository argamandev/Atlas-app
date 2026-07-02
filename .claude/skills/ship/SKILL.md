---
name: ship
description: The shipping ritual for any finished mini-feature — sync main, run the full verification battery, post READY-FOR-REVIEW to the board (lanes) or review+merge+push (supervisor), log PROGRESS.md. Use whenever work is ready to leave a branch.
---

# Ship — how work reaches main

main is always working. Only the supervisor pushes it. There are two roles:

## If you are a LANE session

1. Update your board section; re-read CROSS-CUTTING (someone may have changed shared surfaces).
2. `git fetch origin && git merge origin/main` into your branch; resolve; re-run everything.
3. Battery: `npm test` (all pass) · `npx tsc --noEmit` (clean) · `npm run build` (green) ·
   `/verify-app` (clean pass with screenshots).
4. Small labeled commits only — split anything mixed.
5. Push YOUR BRANCH: `git push -u origin <your-branch>` (pushing main is hook-blocked).
6. Post to BOARD.md READY-FOR-REVIEW: timestamp · lane · branch · what it does · how verified
   (evidence refs) · any migrations/shared-surface changes.
7. Update your state file (lessons learned → note candidates for skill graduation). Move on
   to your next step or wait if blocked.

## If you are the SUPERVISOR

1. Pick the oldest READY-FOR-REVIEW entry. `git fetch origin && git checkout <branch>`.
2. COLD review of `git diff main...<branch>`: correctness, iron rules (additive-only DB, RTL,
   no legacy imports), scope creep, secrets. Spot-check the lane's evidence; re-run
   `npm test` + build yourself. You are the fresh-eyes gate — do not rubber-stamp.
3. Verdict on the board: APPROVED (proceed) or CHANGES (list them in the lane's section; done).
4. Merge: `git checkout main && git merge --no-ff <branch>` → battery again on main →
   `git push origin main`. Delete merged branch. (Worktree branches: coordinate with the lane
   before deleting.)
5. Append PROGRESS.md entry (3-5 bullets: what + why + verification). Commit + push.
6. Update the Supervisor board section; ping the founder when a MILESTONE is testable.
7. Distill: any general lesson from this ship → the relevant skill or rules file.
