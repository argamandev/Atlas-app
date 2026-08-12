# Review — chore/workflow-reset (ticket 03, the rituals)

Cold review of `git diff 6dfa0d5...HEAD` on two axes, run in parallel sub-agents with fresh
context: **Standards** (the meta-laws in `.claude/rules/app.md`, `CONTEXT.md`'s vocabulary,
ADR-0002's ladder, plus the Fowler smell baseline) and **Spec** (the nine checklist items in
`docs/archive/scratch/2026-08-12-workflow-reset/issues/03-the-rituals.md`).

Every finding below was reproduced by running something — the hook against a real on-main
checkout, `recurrenceProblems` against a probe, `ship-gate.mjs` against `main` — before it was
written down. All are fixed in this branch; the fixes and their tests are in the same commits.

VERDICT: APPROVED
REVIEWED: fe22b21

FINDING · BLOCKER · scripts/lib/ship-gate.mjs:40 · tier comparison let missing→ENFORCED-none clear a recurrence, the one terminal state the spec forbids by name
RECURRENCE: no
FINDING · BLOCKER · .claude/hooks/pre-bash-gate.mjs:296 · the --abort/--continue exemption tested the whole command string, so `git merge X # --abort` and `git merge X && echo --abort` both bypassed the gate
RECURRENCE: yes → Fix at the choke point, with the fact, and make the lie unrepresentable
FINDING · BLOCKER · .claude/hooks/pre-bash-gate.mjs:314 · the ATLAS_SHIP_OVERRIDE regex scanned the whole command, so a mention in a later statement overrode the merge silently
RECURRENCE: yes → Fix at the choke point, with the fact, and make the lie unrepresentable
FINDING · BLOCKER · .claude/hooks/pre-bash-gate.mjs:320 · `git -C ../other merge` read as not-a-merge because toks[1] was taken as the subcommand, and it also acts on a repository the on-main probe never looked at
RECURRENCE: no
FINDING · WARNING · .claude/hooks/pre-bash-gate.mjs:282 · `git pull origin feat/x` on main is a merge that lands work, and the door did not cover it while its header claimed "a merge onto main runs the gate"
RECURRENCE: no
FINDING · WARNING · scripts/ship-gate.mjs:96 · the trend line compared `unenforced()` on a battery-checked branch against `unenforced()` on main read through git show, where 11 bare laws are invisible — printing an 11-law improvement as a 3x regression
RECURRENCE: yes → A green signal proves only what it measured
FINDING · WARNING · scripts/lib/ship-gate.mjs:270 · "closed notes become history" was measured only as absence from .scratch/, so `git rm -r` satisfied the gate and the notes were destroyed rather than filed
RECURRENCE: no
FINDING · WARNING · scripts/lib/ship-gate.mjs:60 · "FINDINGS: none" was honoured alongside FINDING lines the parser could not read, so a record in the previous verdict format reported a clean review of zero findings
RECURRENCE: no
FINDING · WARNING · scripts/lib/ship-gate.mjs:75 · nothing tied the review record to a commit, so a verdict filed at the first commit cleared a merge at the twelfth
RECURRENCE: no
FINDING · NIT · docs/agents/issue-tracker.md:14 · the closed-status vocabulary was hand-copied into prose from the CLOSED constant, with nothing keeping the two in step
RECURRENCE: yes → Counts carry their command
FINDING · NIT · scripts/lib/ship-gate.mjs:43 · three different minimum-reason lengths (20 in the hook, 25 here, 30 in environment.test.ts), and this one's comment claimed to match a file it disagreed with
RECURRENCE: no
FINDING · NIT · .claude/skills/ship/SKILL.md:60 · the FINDING/RECURRENCE grammar was spelled out in three documents plus the parser, so a format change would need four edits and three of them would fail silently
RECURRENCE: no

## The three recurrences, and what each law bought

The gate itself refuses a `RECURRENCE: yes` unless the named law's declaration got stronger on
this branch. These three did not — and that is the honest outcome, so it is recorded here rather
than dressed up.

- **M3.2 (choke point / fact not proxy)** and **M1 (a green signal proves only what it measured)**
  are **meta-laws**, not entries in a section with an `**ENFORCED**` line. They are the reading
  frame the other laws are written in, and no test can decide whether a given check was handed a
  fact or a proxy — that judgement is exactly what a cold reviewer is for. The mechanism they
  gained is therefore not a stronger declaration but a stronger *ritual*: the fire-test matrix now
  requires every blocking case to name the phrase it must block for, which is what turned all
  three hook bypasses from invisible into red. Before this change a bypass and a block were the
  same observation (`exit=2`).
- **"Counts carry their command"** is a paragraph in `app.md`'s preamble, same shape. Its
  recurrence was answered by deleting the copy rather than by re-stating the rule.

**This is the gap the gate cannot see, and it should be named as such:** the promotion ritual
reaches laws written in `**LAW ·` marker form, and the meta-laws and preamble rules — the ones
this review actually caught defects against — are invisible to it. Giving them declarations is
real follow-up work and is not attempted here.

## What was run

- `npm test` — 699 pass, in `Asia/Jerusalem` and under `TZ=UTC` with the zone printed from inside
  the run (a `TZ=` value containing a slash is silently dropped in Git Bash; this one has none,
  and it was verified rather than assumed).
- `npx tsc --noEmit` — clean.
- `node .claude/hooks/gate-tests.mjs` — 125/125, up from 103 at the start of this ticket. Every
  new merge-door case that expects a block also asserts the phrase it blocks for.
- `npm run ship:gate` — refuses this branch until this file exists, which is how the file came to
  be written.

## Not verified

No browser work: this branch touches no rendered surface, so `/verify-app` and the bidi law have
nothing to look at here. Said explicitly rather than left as an absence.
