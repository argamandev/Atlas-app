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
- [x] Laws that cannot be mechanised appear as fixed checklist items in the ship ritual, not as prose
- [x] The count of unenforced laws is reported at ship time, so the trend is visible rather than recalled
- [ ] The founder can read every always-on document end to end in under ten minutes — judged by him doing it, which is a ritual gate and not an assertion

## What landed

**The gate itself.** `npm run ship:gate` (`scripts/ship-gate.mjs`, rules in
`scripts/lib/ship-gate.mjs`, 21 tests in `src/lib/shipGate.test.ts`). It prints three
things and fails on the third:

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

**Found by building, not by reading:**
- The first eviction check read "no deletions" as "appended rather than rewritten", and
  fired on the very branch that CREATES `STATUS.md`. A proxy standing in for the fact
  (`app.md` M3.2). `statusExistedAtBase` is the fact.
- The merge door tokenised on whitespace, so `-m "shipping feat/x"` put two words of a
  commit message into the ref list. Caught only because the new matrix cases assert the
  PHRASE each block must fire for — exit=2 alone would have read as a pass (M1).
- `execFileSync` lets a child's stderr through, so every `git show` of a not-yet-existing
  file printed a raw `fatal:` above the gate's own explanation of the same fact.

**Left open, deliberately.** The tier comparison sees only what `app.md` declares —
none < partial < mechanism, plus the hatch. ADR-0002's finer ladder (impossible → test →
hook → ritual gate) is invisible to it, so a mechanism→mechanism promotion is judged by
the declaration text changing, which is a proxy and is stated as one in the module.
