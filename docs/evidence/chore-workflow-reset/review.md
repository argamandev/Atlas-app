# Review — chore/workflow-reset (ticket 03, the rituals)

Four rounds of cold review, each in a fresh context with no attachment to the code. Each round
found defects in the previous round's fixes, which is the argument for the ritual in one sentence.

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
`main`. All are fixed on this branch, in the commits named at the end — **with one exception,
named because "all fixed" was itself a round-3 finding**: `mainrepo/`, the throwaway repo round 1
left behind, is still an untracked nested git repo at the checkout root. Deleting it was refused
by the permission layer, so it is handed over rather than quietly dropped. It is untracked and
committed to nothing; `rmdir /s /q mainrepo` clears it.

**Round 4** — `atlas-reviewer` over `620fb21`, the commit salvaging four corrections from the
never-merged `fix/meta-review-2026-08-10`. Briefed to re-run every command that commit cites
rather than trust its message; it did, and confirmed all four. What it found instead was one
shape, five times: a claim restated in a second document and never re-derived after the thing it
describes moved. That is the same class the commit was fixing, committed inside the commit fixing
it — `app.md`'s preamble, `ARCHITECTURE.md`, `CLAUDE.md`'s doc map, `STATUS.md`, and the bash
gate's own header, which carried the twin of the false door-count `620fb21` corrected in
`CLAUDE.md`. Fixing one and leaving its twin is exactly what a fourth cold round is for.

**The fourth round to hit this class, and it still cannot be filed as a recurrence.** Each entry
below reads `RECURRENCE: no` because *law* means what `app.md` declares in `**LAW ·`
marker form, and the laws these repeat are `M1` and the preamble's "counts carry their command" —
neither of which the parser can see. That is the ticket's one unclosed item, deferred off this
branch by founder decision on 2026-08-12 (`DECISIONS.md`) to the self-improving-layer chapter.
The deferral is his call and stands; recording that the class has now recurred four times is what
this paragraph is for, so the next chapter starts from a count rather than a memory.

VERDICT: APPROVED
REVIEWED: a546c17

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

## Round 3 — on the write-up

FINDING · BLOCKER · docs/archive/scratch/2026-08-12-workflow-reset/issues/03-the-rituals.md:152 · the founder call cited "140 tokens against 107 spare" from a measurement several commits old; the real headroom was smaller by a factor of six, so he was being asked to approve an overrun a quarter of its true size
RECURRENCE: no
FINDING · BLOCKER · docs/evidence/chore-workflow-reset/review.md:89 · the same stale figure was restated here, so both founder-facing documents agreed with each other and disagreed with the tool
RECURRENCE: no
FINDING · WARNING · docs/evidence/chore-workflow-reset/review.md:18 · "all are fixed on this branch" was false while the round-2 mainrepo NIT was still standing untracked at the checkout root
RECURRENCE: no
FINDING · WARNING · docs/evidence/chore-workflow-reset/review.md:120 · "the only change after it is this record" was untrue at the tip, which is the fabricated-provenance defect of round 2 in a milder form
RECURRENCE: no
FINDING · NIT · docs/evidence/chore-workflow-reset/review.md:91 · "raises the unenforced count by about three" — declaring four meta-laws raises it by four, with no stated basis for the discount
RECURRENCE: no
FINDING · NIT · docs/archive/scratch/2026-08-12-workflow-reset/issues/03-the-rituals.md:148 · the founder call was posed as a binary when one declared law naming the actual recurring defect shape would cost a fraction and was never considered
RECURRENCE: no

Round 3's first two findings are the hand-carried-count defect, committed **inside the document
arguing about which laws nothing enforces**, and it is the third of these three rounds to catch a
class the previous round had just written about. It is also unfileable as `RECURRENCE: yes` for
precisely the reason the next section describes, which makes it the best available evidence for
closing that gap rather than deferring it.

## Round 4 — on the salvaged corrections

FINDING · BLOCKER · DECISIONS.md:82-84 · the two founder decisions that authorise 620fb21 — the budget trade-off it acts on and the deferral closing the branch's outstanding meta-law call — were uncommitted working-tree changes, so the merge would have landed the change without the record of who approved it
RECURRENCE: no
FINDING · WARNING · .claude/rules/app.md:24 · the preamble still said open findings "are in the last section" while the same commit deleted that section from the file
RECURRENCE: no
FINDING · WARNING · ARCHITECTURE.md:497 · still listed "open findings (marked NOT laws)" as a section of rules/app.md after the move, and docs/open-findings.md appeared in no doc table
RECURRENCE: no
FINDING · WARNING · CLAUDE.md:96 · docs/open-findings.md was the only file under docs/ root missing from the doc map, in the commit restoring an audit certifying zero such omissions
RECURRENCE: no
FINDING · WARNING · .claude/hooks/pre-bash-gate.mjs:3 · the gate's own header said "BOTH doors to the DB" while wired to three matchers — the identical false count 620fb21 fixed in CLAUDE.md, and finding 17 of the audit it restores
RECURRENCE: no
FINDING · WARNING · docs/evidence/chore-workflow-reset/review.md:26 · REVIEWED: 01690ce and its closing "the only change after it is this record" were both false at 620fb21; ship:gate refused the merge on exactly this
RECURRENCE: no
FINDING · WARNING · STATUS.md:36 · still said "Two founder calls before it merges" and named the meta-law call, which the DECISIONS entry had settled as deferred
RECURRENCE: no
FINDING · NIT · docs/audits/2026-08-10-supervisor-meta-review.md:369 · restored with all 20 Status cells blank, so nothing distinguished the four findings the commit fixed from the sixteen it did not
RECURRENCE: no
FINDING · NIT · .claude/rules/app.md:38 · the DEMO_USER_ID figures carried no command and no `-- src` scope, so a reader re-running them repo-wide gets a different number — the file's own "counts carry their command", unmet in the paragraph pair the commit corrected
RECURRENCE: no
FINDING · NIT · .claude/rules/app.md:99 · `^import { supabaseAdmin }` is an exact-spelling anchor; a combined or line-wrapped import would silently drop a module from the admin list, which is the security-relevant direction
RECURRENCE: no

All ten fixed in `a546c17`. The NIT on the audit's blank Status cells was answered by APPENDING a
dated DISPOSITION section rather than editing the table — a restored historical record is not
re-authored, which is the convention the meta-review branch itself set. The NIT on the grep anchor
was answered twice over: the pattern is widened to tolerate a combined import, **and** the law now
states that it remains a proxy (M3.2) for the line-wrapped case, because a grep that silently
drops a module reads as "RLS-safe" — the failure direction that matters.

## Why every RECURRENCE reads "no", and the gap that makes it so

**Eight of these findings ARE recurrences — and not one of them is a recurrence of a law this gate
can see.** They repeat `app.md`'s **meta-laws**: M3.2 (give the choke point the fact, never a
proxy) for the substring and whole-string tests, and M1 (a green signal proves only what it
measured) for the matrix that read 125/125 with four bypasses standing and for round 3's two stale counts. The archive substring test
is M3.2 in the sibling of the check whose own commit message, three commits earlier, is *"the
archive hatch was a substring test, so it was a bypass"*.

The meta-laws are written as `**M1 · …**`, not `**LAW · …**`, so `parseLaws` does not see them,
`env:health` does not count them, and `RECURRENCE: yes → Fix at the choke point…` resolves to
nothing. The gate said so, in those words, when this record first claimed those recurrences — it
refused the merge rather than accept a name it could not resolve, which is the mechanism working.

**Recorded as the ticket's one unclosed gap, and it is a founder call**, because closing it means
editing the most-loaded document in the repo and paying for it:

- Converting M1–M4 to `**LAW ·` form with honest declarations costs more tokens than the budget
  has. **Run `npm run env:health` for the headroom rather than trusting a figure here** — an
  earlier draft of this bullet carried "107 spare" from a measurement several commits old, and
  round 3 of this review caught it wrong by a factor of six. That is `app.md`'s "counts carry
  their command", broken in the record arguing about unenforced laws, and it is why this bullet
  now names a command instead of a number.
- It would also RAISE the unenforced count, by up to one per meta-law converted, because these
  laws are genuinely unenforced and are currently invisible rather than clean. Honest direction,
  and it should be a decision rather than a side effect of a review.
- **The cheaper option, which this record originally failed to consider** (round 3's NIT): six of
  the nine findings are ONE defect shape — a gate deciding on a proxy for the command instead of
  on the fact. A single declared law naming that shape makes them all filable, costs a fraction of
  converting the preamble, and leaves M1–M4 where they are.
- Until one of those happens, the promotion ritual reaches the marker-form laws (`env:health`
  prints how many) and not the four the code actually recurs against, which are the four about how
  to verify anything at all.

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

Round 1 in `2a866b5`, round 2 in `d27b134`, round 3 in `01690ce`, round 4 in `a546c17`.
`REVIEWED:` names the last of them, and the only change after it is this record — which is the one
file `stalenessProblems` exempts, because writing it IS the act of filing the review.

Round 4 exists because `620fb21` landed *after* round 3 approved the branch, and `ship:gate`
refused the merge by name rather than letting a stale approval through. That refusal is the whole
ticket working on its author, which is the best evidence in this file that the gate is real.
