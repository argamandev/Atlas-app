---
name: ship
description: The shipping ritual for any finished mini-feature — sync main, run the full verification battery, review with fresh eyes, merge, push, and log PROGRESS.md. Also holds the retirement ritual for a finished worktree. Use whenever work is ready to leave a branch.
---

# Ship — how work reaches main

main is always working. One session carries a mission from branch to merge (ADR-0001); there is
no queue to hand off to and no second seat to wait on. What used to be the supervisor's second
pair of eyes is now the `atlas-reviewer` subagent, dispatched in step 5 — **cold review did not
retire with the fleet, and it is the step that repeatedly caught what the author missed.**

## The ritual

1. **Re-read `COLLISIONS.md`** — a migration, a shared type or a design token may have moved
   under you since you started.
2. `git fetch origin && git merge origin/main` into your branch; resolve; re-run everything.
3. **Battery:** `npm test` (all pass) · `npx tsc --noEmit` (clean) · `npm run build` (green) ·
   `/verify-app` (clean pass, every state you can reach, in BOTH locales).
   **A running dev server owns `.next`** — building in a checkout it owns fails with
   `PageNotFoundError: /_document` or MODULE_NOT_FOUND. That is a stale artifact, not a broken
   branch: kill the dev server, `rm -rf .next`, rebuild.
4. **Small labeled commits only** — split anything mixed. Stage paths explicitly
   (`git add <paths>`), never `git add -A` / `git add .` — a blanket add swept untracked editor
   config into a commit once (2026-07-03); check `git status` for stowaways before every commit.
5. **Dispatch the `atlas-reviewer` subagent on the branch** (fresh context, zero attachment: it
   checks correctness, the iron rules, scope, secrets, evidence). Read its verdict, then do your
   own pass over `git diff main...<branch>` for mission fit. Two independent gates before
   anything touches main.

   **If you probe branch code directly, READ THE SIGNATURE AT THAT COMMIT AND INCLUDE A CONTROL
   WHOSE ANSWER YOU ALREADY KNOW.** Filed 2026-08-08, round 3 of `feat/workspace-tables`: a probe
   written against the previous round's signature kept running after the function lost a
   parameter, so every argument shifted one position and it reported five alarming failures that
   were pure artefact — a near-miss false BLOCKER on a branch already held twice. Nothing errored;
   the arguments were all the right TYPES. It was caught only because one control case returned
   something impossible. **When a function's shape changes under you, the command you typed stops
   being the question you mean, and silently** (`rules/app.md` M1).
6. **Durable-evidence law:** anything you cite as evidence (quality reports, walkthrough sheets,
   captures, screenshots-described) must exist as a tracked file before you cite it — reports and
   sheets → `docs/evidence/<branch>/`, call captures → `scripts/out/sessions/`. A worktree path, a
   session temp dir or an external URL may be *mentioned*, but never as the only copy: worktrees
   get removed, sessions die, links expire.
7. **Merge:** `git checkout main && git merge --no-ff <branch>` → battery again on merged main →
   `git push origin main` **from the primary checkout** (pushing main from a worktree is
   hook-blocked). Delete the merged branch.
8. **Merge-time doc truth** — these fire at EVERY merge, because retirement is too rare to carry
   them:
   - Append a PROGRESS.md entry (3-5 bullets: what + why + verification).
   - Update ARCHITECTURE.md for any new/moved/deleted files this merge introduces.
   - Rewrite `STATUS.md` — it describes NOW. Anything that just landed comes OUT of it; anything
     dated goes to PROGRESS.md. It is capped at 60 lines by `src/lib/environment.test.ts`.
   - Stamp any plan/spec in `docs/superpowers/` whose scope this merge completes with the
     historical banner (`> STATUS: SHIPPED — historical record, do not execute; current truth
     lives in ARCHITECTURE.md + PROGRESS.md`) — stamped in place, never moved.
   - **SWEEP, don't remember.** Editing the docs you recall is not a doc update: that failed FOUR
     consecutive review rounds on `fix/app-login-gate` (2026-08-01). Close this item only by
     grepping the **falsified claim** — not the feature name — across every tracked doc, then
     reading each hit. Legitimate survivors are dated log entries and SHIPPED-stamped plans;
     never rewrite those, because rewriting a dated record falsifies it. Any COUNT you write
     (tests, routes, findings) comes from a command, never from memory — three hand-typed counts
     were wrong on that one branch.
   - Commit + push the above.
9. **Distill:** any general lesson from this ship goes into the relevant skill or `.claude/rules/`
   file. A lesson that has now happened TWICE is a recurrence, and a recurrence means the law's
   mechanism is too weak — not that the law needs restating (ADR-0002, `CONTEXT.md`).
10. **File the decisions.** Anything the founder decided during this work goes to `DECISIONS.md`,
    one line, in his own words, quoted.

## Retirement (when a worktree's work is done)

1. Confirm the last piece merged and the milestone was founder-tested.
2. **Rescue evidence FIRST:** sweep the worktree for anything cited that lives only there
   (git-ignored reports, `.superpowers/` ledgers, `scripts/out/` captures) — copy it into
   `docs/evidence/` or `scripts/out/sessions/` in the primary checkout BEFORE any removal.
3. Append the feature's story to PROGRESS.md. Verify the plans/specs carry the SHIPPED banner
   from step 8; stamp any that were missed.
4. Move the working notes to history in the same motion: anything under `.scratch/<feature>/`
   that is now closed, and any era of `COLLISIONS.md` that has closed, goes to `docs/archive/`
   — **verbatim, copied, never re-authored.**
5. `git worktree remove <path>` and delete the branch. An empty worktree left standing reads as
   active work; two of them passed as live for months, which is why the word "lane" is retired
   (`CONTEXT.md`).
