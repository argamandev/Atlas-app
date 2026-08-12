# Review — chore/workflow-reset (ticket 03, the rituals)

Two rounds of cold review, both run in fresh contexts with no attachment to the code.

**Round 1** — two parallel sub-agents over `git diff 6dfa0d5...HEAD`, one on Standards (the
meta-laws in `.claude/rules/app.md`, `CONTEXT.md`'s vocabulary, ADR-0002's ladder, plus the Fowler
smell baseline), one on Spec (the nine checklist items in
`docs/archive/scratch/2026-08-12-workflow-reset/issues/03-the-rituals.md`).

**Round 2** — `atlas-reviewer` over the commit that applied round 1's fixes, asked to verify each
claimed fix by probing rather than reading. It found four more, three of them round 1's own
defects surviving through surfaces round 1 had not typed. That is the round this review is worth
having: the first pass fixed what it had named, and the second pass measured whether the naming
was the same thing as the rule.

Every finding below was reproduced before it was written down — the hook fed JSON on stdin against
a throwaway on-main checkout, `recurrenceProblems` probed directly, `ship-gate.mjs` run against
`main`. All are fixed on this branch, in the commits named at the end.

VERDICT: APPROVED
REVIEWED: d27b134

## Round 1

FINDING · BLOCKER · scripts/lib/ship-gate.mjs:40 · tier comparison let missing to ENFORCED-none clear a recurrence, the one terminal state the spec forbids by name, and main holds eleven laws parsing as missing
RECURRENCE: no
FINDING · BLOCKER · .claude/hooks/pre-bash-gate.mjs:296 · the abort/continue exemption tested the whole command string, so a trailing shell comment or a following echo bypassed the gate entirely
RECURRENCE: no
FINDING · BLOCKER · .claude/hooks/pre-bash-gate.mjs:314 · the ATLAS_SHIP_OVERRIDE regex scanned the whole command, so a mention in a later statement silently overrode the merge
RECURRENCE: no
FINDING · BLOCKER · .claude/hooks/pre-bash-gate.mjs:320 · a merge redirected at another checkout by a global option read as not-a-merge, because the second token was taken as the subcommand
RECURRENCE: no
FINDING · WARNING · .claude/hooks/pre-bash-gate.mjs:282 · pulling a feature branch onto main is a merge that lands work, and the door did not cover it while its header claimed otherwise
RECURRENCE: no
FINDING · WARNING · scripts/ship-gate.mjs:96 · the trend line compared unenforced() on a battery-checked branch against unenforced() on main read through git show, printing an eleven-law improvement as a 3x regression
RECURRENCE: no
FINDING · WARNING · scripts/lib/ship-gate.mjs:270 · closed notes becoming history was measured only as absence from .scratch/, so deleting them satisfied the gate
RECURRENCE: no
FINDING · WARNING · scripts/lib/ship-gate.mjs:60 · FINDINGS-none was honoured alongside FINDING lines the parser could not read, reporting a clean review of zero findings
RECURRENCE: no
FINDING · WARNING · scripts/lib/ship-gate.mjs:75 · nothing tied the review record to a commit, so a verdict filed at the first commit cleared a merge at the twelfth
RECURRENCE: no
FINDING · NIT · docs/agents/issue-tracker.md:14 · the closed-status vocabulary was hand-copied from the CLOSED constant into prose, with nothing keeping the two in step
RECURRENCE: no
FINDING · NIT · scripts/lib/ship-gate.mjs:43 · three different minimum-reason lengths, and this one's comment claimed to match a file it disagreed with
RECURRENCE: no
FINDING · NIT · .claude/skills/ship/SKILL.md:60 · the finding grammar was spelled out in three documents plus the parser, so a format change needed four edits and three would fail silently
RECURRENCE: no

## Round 2 — on the fixes

FINDING · BLOCKER · .claude/hooks/pre-bash-gate.mjs:315 · the statement split did not treat a newline as a separator, so a comment on a preceding line swallowed the whole merge and it was allowed
RECURRENCE: no
FINDING · BLOCKER · .claude/hooks/pre-bash-gate.mjs:366 · the override prefix was read from a statement that had never been split on newline, so an override named on a preceding line applied to the merge
RECURRENCE: no
FINDING · BLOCKER · .claude/hooks/pre-bash-gate.mjs:346 · a commit message reading dash-dash-abort exempted the merge, because the exemption test ran over raw arguments and never skipped the message value
RECURRENCE: no
FINDING · BLOCKER · docs/evidence/chore-workflow-reset/review.md:14 · the first use of the staleness mechanism this branch introduces was populated with a fabricated sha, certifying a review of code that never existed
RECURRENCE: no
FINDING · WARNING · .claude/hooks/gate-tests.mjs:345 · the matrix added exactly the three cases round 1 named and nothing that generalised them, so it read green while four bypasses stood
RECURRENCE: no
FINDING · WARNING · scripts/ship-gate.mjs:176 · the archive check accepted any path component ENDING with the folder slug, including a file name — a substring test inside an archive check
RECURRENCE: no
FINDING · WARNING · .claude/hooks/pre-bash-gate.mjs:317 · a command substitution in backticks was not recognised as a merge, and once it was, the ref carried a stray backtick so the door judged a branch by the wrong name
RECURRENCE: no
FINDING · NIT · scripts/lib/ship-gate.mjs:173 · a law already declaring a mechanism could answer its recurrence by being rewritten UNENFORCEABLE — a demotion wearing the honest hatch's clothes
RECURRENCE: no
FINDING · NIT · mainrepo/ · round 1 left a throwaway nested git repo untracked at the checkout root
RECURRENCE: no

## Why every RECURRENCE reads "no", and the gap that makes it so

**Six of these findings ARE recurrences — and not one of them is a recurrence of a law this gate
can see.** They repeat `app.md`'s **meta-laws**: M3.2 (give the choke point the fact, never a
proxy) for the substring and whole-string tests, and M1 (a green signal proves only what it
measured) for the matrix that read 125/125 with four bypasses standing. The archive substring test
is M3.2 in the sibling of the check whose own commit message, three commits earlier, is *"the
archive hatch was a substring test, so it was a bypass"*.

The meta-laws are written as `**M1 · …**`, not `**LAW · …**`, so `parseLaws` does not see them,
`env:health` does not count them, and `RECURRENCE: yes → Fix at the choke point…` resolves to
nothing. The gate said so, in those words, when this record first claimed those recurrences — it
refused the merge rather than accept a name it could not resolve, which is the mechanism working.

**Recorded as the ticket's one unclosed gap, and it is a founder call**, because closing it means
editing the most-loaded document in the repo and paying for it:

- Converting M1–M4 to `**LAW ·` form with honest declarations costs roughly 140 tokens against
  107 spare, so it needs `TOKEN_BUDGET` raised deliberately — and ticket 02 already flagged the
  budget as his decision, not a session's.
- It would also RAISE the unenforced count by about three, because these laws are genuinely
  unenforced and are currently invisible rather than clean. That is the honest direction, and it
  should be a decision rather than a side effect of a review.
- Until then the promotion ritual reaches the ~26 marker-form laws and not the four the code
  actually recurs against, which are the four about how to verify anything at all.

`RECURRENCE: no` is therefore the literally-true answer to the question the field asks — "is this a
recurrence of a law we already hold?", where *law* means what `app.md` declares in marker form —
and this section is the part the field cannot hold. Written here rather than left as an absence.

## What was run

- `npm test` — **700 pass**, in `Asia/Jerusalem` and under `TZ=UTC` with the zone printed from
  inside the run rather than assumed from the command line.
- `npx tsc --noEmit` — clean.
- `node .claude/hooks/gate-tests.mjs` — **131/131**, from 103 at the start of this ticket. Every
  merge-door case that expects a block also asserts the phrase it must block for; that assertion
  is what turned all seven hook bypasses from invisible into red.
- `npm run ship:gate` — refuses this branch until this file exists and parses, which is how both
  the fabricated sha and the meta-law gap above were found.

## Not verified

No browser work: this branch touches no rendered surface, so `/verify-app` and the bidi law have
nothing to look at here. Said explicitly rather than left as an absence.

## Fixes

Round 1 in `2a866b5`, round 2 in `d27b134`. `REVIEWED:` names the second, which is the tip of the
code; the only change after it is this record.
