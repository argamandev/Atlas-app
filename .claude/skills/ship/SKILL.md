---
name: ship
description: The shipping ritual for any finished mini-feature — sync main, run the full verification battery, review with fresh eyes, merge, push, and log PROGRESS.md. Also holds the retirement ritual for a finished worktree. Use whenever work is ready to leave a branch.
---

# Ship — how work reaches main

main is always working. One session carries a mission from branch to merge (ADR-0001); there is
no queue to hand off to and no second seat to wait on. What used to be the supervisor's second
pair of eyes is now the `atlas-reviewer` subagent, dispatched in step 5 — **cold review did not
retire with the fleet, and it is the step that repeatedly caught what the author missed.**

**Most of this file is no longer the thing that makes it happen.** `npm run ship:gate` checks the
mechanical half — STATUS.md rewritten, PROGRESS.md appended (and any `Verified: N/N` count in the
new entry re-measured against a battery run the gate makes itself; founder decision 2026-08-13),
closed working notes filed as history, every review finding answered against the recurrence
question — and
`.claude/hooks/pre-bash-gate.mjs` runs it again at the `git merge` onto main, so it fires whether
or not anyone opened this skill. That is deliberate: `CONTEXT.md` counts prose as the weakest tier
and not as enforcement, and ADR-0002 does not exempt the workflow from the rule it imposes on the
product. **What is left here in prose is what a script honestly cannot check** — and the gate
prints that part too, generated from the laws, so the list can never drift from `app.md`.

## The ritual

1. **Re-read `COLLISIONS.md`** — a migration, a shared type or a design token may have moved
   under you since you started.

   **And append YOUR entry here, before the merge, DERIVED FROM `git diff main...HEAD`.** Four
   consecutive slices (08a, 08b, 08c-1, 08c-3) appended at ship time or later, and three of the
   four named an INCOMPLETE list. The two failure modes are different and both are now paid for:
   - **Enumeration.** A list assembled from recollection of the work misses what you did not
     think of as a shared change — a test seam added to an exported interface, for instance.
     Derive it: `git diff main...HEAD` and read the exported surface of every file it touches.
   - **Judgement.** 08c-3 derived the list and still missed the i18n dictionaries, because
     "adding a translation string" does not feel like a shared type. **It is one: a shared type
     includes any file whose SHAPE another file is compiled against.** `en.ts` defines
     `Dictionary`; `tsc` holds `he.ts` to it; two sessions adding keys collide exactly as they
     would on an interface.

   Nothing mechanical checks this yet — a branch whose diff touches an exported type under
   `src/lib` having a COLLISIONS line is the check that is owed, and it is the founder's call
   because it changes the workflow.
2. `git fetch origin && git merge origin/main` into your branch; resolve; re-run everything.
3. **Battery:** `npm test` (all pass) · `npx tsc --noEmit` (clean) · `npm run build` (green) ·
   `/verify-app` (clean pass, every state you can reach, in BOTH locales).
   **A running dev server owns `.next`** — building in a checkout it owns fails with
   `PageNotFoundError: /_document` or MODULE_NOT_FOUND. That is a stale artifact, not a broken
   branch: kill the dev server, `rm -rf .next`, rebuild.

   Then **`npm run ship:gate`**, which prints three things and fails on the third:
   - **WHAT ONLY YOU CAN CHECK** — every law that declares no working mechanism *and* carries a
     `**VERIFY**` step, in full, generated from `app.md`. **These are checklist items, not
     reading.** Work the list; it is short because it is only the laws nothing automatic reaches.
     Copying it into this file by hand is exactly the hand-carried-count defect `app.md` records
     itself committing three times, which is why it is generated.
   - **UNENFORCED LAWS**, on this branch and on main. A merge that raises it should say why in
     the commit; a merge that lowers it is the point of the whole arrangement (ADR-0002).
   - **THE GATE** — steps 6, 8 and the recurrence question below, as exit codes.
4. **Small labeled commits only** — split anything mixed. Stage paths explicitly
   (`git add <paths>`), never `git add -A` / `git add .` — a blanket add swept untracked editor
   config into a commit once (2026-07-03); check `git status` for stowaways before every commit.
5. **Dispatch the `atlas-reviewer` subagent on the branch** (fresh context, zero attachment: it
   checks correctness, the iron rules, scope, secrets, evidence). Read its verdict, then do your
   own pass over `git diff main...<branch>` for mission fit. Two independent gates before
   anything touches main.

   **File the verdict at `docs/evidence/<branch-with-slashes-as-dashes>/review.md`, and answer the
   recurrence question for every finding.** The gate reads that file; a review that exists only in
   a transcript is a review that expires. **The record's grammar is normative in
   `.claude/agents/atlas-reviewer.md` — read it there, not here**, because a format spelled out in
   two places is a format that disagrees with itself in one of them.

   **Every finding gets exactly one `RECURRENCE:` line** — `no`, or `yes → <the law it
   repeats>`. This is the whole promotion ritual (ADR-0002): a `yes` does not merge until that law
   gains a mechanism **one tier stronger in this same commit** (impossible → test → hook or grep →
   ritual gate), or is marked `UNENFORCEABLE` with a stated reason. The gate checks the law's
   declaration on your branch against main's and blocks if it did not move.

   **Do step 8's doc updates BEFORE this step, not after.** The review approves a diff, so
   anything that changes the diff afterwards makes the approval stale and the gate says so by
   name. The order that works is: finish the code → write PROGRESS.md, STATUS.md and the doc sweep
   → review → merge. Getting this backwards costs a re-review, which is the correct price and an
   avoidable one.

   **The escape hatch is not a weakness.** Marking a law honestly unenforceable satisfies the
   gate. Without that, a hard gate pressures people into mechanisms that only look like
   enforcement, and this repo has already filed the case where a test asserted the defect and
   thereby defended it.

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

   **The merge itself runs the gate.** `git merge` while on main re-runs `ship:gate` for the named
   branch and refuses the merge if it fails, so step 8 cannot be deferred to "right after this
   lands" — which is where it went every time it was only written down. Merging `origin/main` INTO
   a feature branch (step 2) is untouched: nothing lands in that direction.
   Genuinely wrong for one merge? `ATLAS_SHIP_OVERRIDE="<why, in a sentence>" git merge --no-ff
   <branch>` — the reason is required, and it goes in the transcript.
8. **Merge-time doc truth** — these fire at EVERY merge, because retirement is too rare to carry
   them. **The first three are gated in step 7**; the rest are still yours:
   - **[gated]** Append a PROGRESS.md entry (3-5 bullets: what + why + verification).
   - **[gated]** Rewrite `STATUS.md` — it describes NOW. Anything that just landed comes OUT of
     it; anything dated goes to PROGRESS.md. **Rewritten, never appended**: the gate reads the
     diff and refuses a STATUS.md that only grew. Capped at 60 lines by
     `src/lib/environment.test.ts`.
   - **[gated]** **Evict the working notes in the same motion.** Any `.scratch/<feature>/` whose
     every ticket now reads done, and any closed era of `COLLISIONS.md`, is copied to
     `docs/archive/` — **verbatim, never re-authored** — and removed from `.scratch/`. Bound to
     the merge on purpose: the retired apparatus reached 2.8 MB with a periodic sweep on the books
     that nothing forced to run.
   - Update ARCHITECTURE.md for any new/moved/deleted files this merge introduces.
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

## The founder's read — RETIRED 2026-08-12 (founder decision, filed in `DECISIONS.md`)

The timed end-to-end read is retired: asked once, the founder refused outright, and the refusal
was the gate firing — the set measured ~28 min at 200 wpm against the 10-minute bar. Readability
is now watched by machine: the env-manifest token budget (test-enforced) plus the estimated
read time `npm run env:health` prints. When that estimate offends, the fix is shrinking the set
(the deferred self-improving-layer chapter: app.md's mechanism-backed laws become pointers at
their tests) — never asking a human to prove it by stopwatch.

## Retirement (when a worktree's work is done)

1. Confirm the last piece merged and the milestone was founder-tested.
2. **Rescue evidence FIRST:** sweep the worktree for anything cited that lives only there
   (git-ignored reports, `.superpowers/` ledgers, `scripts/out/` captures) — copy it into
   `docs/evidence/` or `scripts/out/sessions/` in the primary checkout BEFORE any removal.
3. Append the feature's story to PROGRESS.md. Verify the plans/specs carry the SHIPPED banner
   from step 8; stamp any that were missed.
4. Working notes were already evicted at each merge (step 8) — confirm nothing is left, don't
   redo it. Retirement is too rare to be where eviction lives.
5. `git worktree remove <path>` and delete the branch. An empty worktree left standing reads as
   active work; two of them passed as live for months, which is why the word "lane" is retired
   (`CONTEXT.md`).
