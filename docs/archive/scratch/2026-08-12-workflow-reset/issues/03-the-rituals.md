# 03 — The rituals

**What to build:** The two habits that keep the environment from regrowing, and keep it
learning.

**Eviction.** When work merges, its working notes become history in the same motion and the
status file is rewritten rather than appended to. This is the only part of the whole
migration that must keep working forever — every other item is a one-off move that either
happened or did not. It is bound to merge rather than to a periodic sweep, because a
periodic sweep is precisely how the retired apparatus reached 2.8 MB: the sweep existed, and
nothing forced it to run.

**Promotion.** At review, a finding must be answered against a question that cannot be
skipped: is this a recurrence of a law we already hold? If it is, the fix does not merge
until the law gains a mechanism one tier stronger — impossible, test, hook, ritual gate,
prose — or is honestly marked unenforceable with a reason. Review is the moment this is
cheap: the defect is in front of you, the code is open, the branch is unmerged (ADR-0002).

The escape hatch is not a weakness. Without it a hard gate pressures people into writing
mechanisms that only look like enforcement, and a law that merely appears enforced is worse
than one honestly marked bare — this repo has already filed the case where a test asserted a
defect and thereby defended it.

Finally, the laws that genuinely cannot become tests — drive every state in a browser, look
at both locales — become fixed items in the ship checklist, so that compliance stops
depending on someone recalling rule 14 of 27.

**Blocked by:** 02 — The retirement

**Status:** done

> **Some of this arrived early in ticket 02, and the checklist below is written as if it did
> not.** Retiring the fleet forced a rewrite of `/ship` and `atlas-reviewer.md` — both pointed at
> a board, a queue and a `/fleet-lint` that no longer exist — and the rewrite carried three items
> from this ticket with it: `/ship` step 8 rewrites `STATUS.md` at merge; `/ship` retirement step 4
> moves closed working notes to `docs/archive/` in the same motion; `atlas-reviewer` must name a
> repeat finding as a RECURRENCE and point at the law it belongs to. **All three are PROSE, which
> `CONTEXT.md` counts as the weakest tier and not as enforcement.** So this ticket's job on those
> items is unchanged in substance — turn them into gates that fire whether or not anyone reads the
> skill — but start by reading what is already there instead of writing it twice.

- [x] Merging archives the working notes and rewrites the status file, in the same ritual
- [x] The status file stays under its cap after the rewrite, proved by the environment test
- [x] Nothing in the always-on set is append-only after this ticket
- [x] Review asks explicitly whether a finding is a recurrence of an existing law, and the answer is recorded rather than assumed
- [x] A recurrence requires a mechanism one tier stronger, shipped in the same commit as the fix
- [x] The escape hatch exists: a law may be marked unenforceable with a stated reason, and that satisfies the gate
- [x] Laws that cannot be mechanised appear as fixed checklist items in the ship ritual, not as prose — **for the ones that carry a `**VERIFY**` step.** The rest are printed as a named, counted gap directly underneath, because inventing a manual step for a law that never stated one would be a checklist item that only looks like a mechanism. Closing that gap means writing VERIFY steps into `app.md`, which is work on the laws, not on the ritual.
- [x] The count of unenforced laws is reported at ship time, so the trend is visible rather than recalled
- [ ] The founder can read every always-on document end to end in under ten minutes — judged by him doing it, which is a ritual gate and not an assertion

## What landed

**The gate itself.** `npm run ship:gate` (`scripts/ship-gate.mjs`, rules in
`scripts/lib/ship-gate.mjs`, tested in `src/lib/shipGate.test.ts` — run it for the
count; an earlier draft of this line hand-typed "21 tests" and was wrong by the time
anyone read it, which is the defect `app.md` files three times). It prints three things
and fails on the third:

1. **WHAT ONLY YOU CAN CHECK** — every law declaring no working mechanism that also
   carries a `**VERIFY**` step, **generated from `app.md`** rather than copied out of
   it. That is the answer to "compliance stops depending on someone recalling rule 14
   of 27": a hand-copied list in the skill has the same problem one step later, plus
   the hand-carried-count defect `app.md` files three times.
2. **UNENFORCED LAWS**, branch and main side by side, so the trend is visible at the
   moment it is cheapest to move.
3. **The two rituals, as exit codes** — eviction (STATUS.md rewritten not appended,
   PROGRESS.md appended, closed `.scratch/` notes filed as history) and promotion
   (every review finding carries a recurrence answer; a `yes` names one law that main
   already holds, and that law's declaration must have got stronger on this branch, or
   be marked `UNENFORCEABLE` with a reason).

**It fires whether or not anyone reads the skill.** `pre-bash-gate.mjs` gained a merge
door: `git merge` while on `main` runs the gate for the named branch and refuses on a
non-zero exit. Merging `origin/main` INTO a feature branch is untouched — nothing lands
in that direction. The hatch is `ATLAS_SHIP_OVERRIDE="<reason ≥20 chars>"`, which puts
the reason in the transcript. **116/116 gate tests, up from 103** — run it, do not read
it.

**Append-only and always-on are now provably disjoint.** `APPEND_ONLY` in
`env-manifest.mjs` declares `COLLISIONS.md`, `PROGRESS.md` and `DECISIONS.md` with a
reason each; `environment.test.ts` fails if any of them joins the always-on set, and
`append-log.mjs` derives its doors from the same declaration instead of restating it.

**Two things the gate demands that no checklist item asked for, named because arriving
unannounced is how merge policy gets resented.** Both were already `/ship` steps that
nothing enforced, so this is the same move the ticket makes everywhere else — a written
rule becoming a mechanism — but neither is in the nine items, and the founder can strike
either one.
1. **A review record must exist and read APPROVED** before the merge (step 5 + the
   durable-evidence law, step 6). Item 4 requires the recurrence answer to be *recorded*,
   which requires somewhere to record it; refusing on `VERDICT: CHANGES` goes further
   than item 4 does.
2. **A PROGRESS.md entry must be present** (step 8). Item 1 names only the working notes
   and the status file.

**Found by building, not by reading:**
- The first eviction check read "no deletions" as "appended rather than rewritten", and
  fired on the very branch that CREATES `STATUS.md`. A proxy standing in for the fact
  (`app.md` M3.2). `statusExistedAtBase` is the fact.
- The merge door tokenised on whitespace, so `-m "shipping feat/x"` put two words of a
  commit message into the ref list. Caught only because the new matrix cases assert the
  PHRASE each block must fire for — exit=2 alone would have read as a pass (M1).
- `execFileSync` lets a child's stderr through, so every `git show` of a not-yet-existing
  file printed a raw `fatal:` above the gate's own explanation of the same fact.

## Found by cold review, before merge, and fixed

- **`ENFORCED none` satisfied a recurrence, which is the one thing the spec forbids by
  name.** `strengthened` compared tier numbers, so `missing`(0) → `none`(1) read as a
  promotion — and main holds eleven laws parsing as `missing`, so naming any of them and
  typing the words "ENFORCED none" cleared the whole promotion ritual. There is now a
  floor above the bottom of the ladder.
- **The trend number compared two different questions (M1).** `unenforced()` excludes
  laws that declare nothing, which is safe on a branch the battery has run on and false
  for `main` read through `git show`. It printed "16 on branch, 5 on main" for a branch
  that had just given eleven silent laws an honest declaration — a 3× improvement
  reported as a 3× regression. Both sides now count the bare ones, and say so.
- **Three bypasses in the merge door, all one family:** `git merge X # --abort`,
  `git merge X && echo --abort`, and an `ATLAS_SHIP_OVERRIDE` mentioned in a LATER
  command all walked through, because the exemption and the hatch were tested against
  the whole command string instead of the merge's own statement. M3.2, and the second
  time this file has filed it — the archive hatch was the first. Also `git -C ../other
  merge` was not a merge at all to the door, which read `toks[1]` as the subcommand.
- **`git pull` is a merge onto main** and the door did not know it. Pulling a feature
  branch onto main lands work without the ritual; bare `git pull` and `pull origin main`
  stay free.
- **"FINDINGS: none" was accepted alongside findings the parser could not read**, so a
  record in the OLD verdict format plus that line reported a clean review of zero
  findings. A `FINDING`-ish line that does not parse is now a problem.
- **Nothing tied the review to the code.** A verdict filed at the first commit cleared a
  merge at the twelfth. `REVIEWED: <sha>` is required and the gate blocks if anything but
  the record itself changed after it.
- **Deleting closed notes satisfied the eviction check**, which only ever looked at what
  was still in `.scratch/`. "Become history" was a claim nothing measured; the gate now
  compares against the merge base and asks whether the archive received them.
- **Three different minimum reason lengths** (20, 25, 30), one of which claimed in a
  comment to match another. One exported `MIN_REASON`, and a test keeps the hook's
  deliberately-unimported copy honest — the hook must not gain an import that could
  crash it, because a crashed hook exits 1 and the harness reads that as "allow".

## The one gap this ticket could not close — a founder call

**The promotion ritual reaches the marker-form laws and not the meta-laws, and the meta-laws are
what the code actually recurs against.** Six of this branch's own review findings repeat M3.2
(give the choke point the fact, never a proxy) and M1 (a green signal proves only what it
measured); none of them could be recorded as a recurrence, because `**M1 ·` is not `**LAW ·` and
the parser cannot see it. The gate refused the record rather than accept a name it could not
resolve, which is the mechanism telling the truth about its own reach.

Closing it costs two things that are his to spend, which is why it is not done here:
- roughly **140 tokens against 107 spare**, so `TOKEN_BUDGET` has to be raised deliberately —
  ticket 02 already left the budget as his decision;
- the unenforced count **rises by about three**, because these laws are genuinely unenforced and
  are currently invisible rather than clean. Honest direction, but it should be chosen.

**Left open, deliberately.** The tier comparison sees only what `app.md` declares —
none < partial < mechanism, plus the hatch. ADR-0002's finer ladder (impossible → test →
hook → ritual gate) is invisible to it, so a mechanism→mechanism promotion is judged by
the declaration text changing, which is a proxy and is stated as one in the module.
