---
name: fleet-lint
description: The supervisor's periodic health-check of the fleet's memory and docs — finds drift, contradictions, evaporating knowledge, and un-graduated lessons. Run every 2-3 merges or whenever the environment feels stale. Karpathy's "lint" operation applied to the Atlas smart environment.
---

# Fleet Lint — keep the brain honest

Knowledge rots silently: docs drift from code, decisions live in one session's chat, lessons
sit un-graduated, the board says "in progress" about a branch that merged yesterday. This
sweep catches it. Findings get FIXED (small ones inline) or FILED (bigger ones as board next
steps) — never just listed.

## The sweep (run each check, report per check: CLEAN or findings)

1. **Board vs git reality** — for each lane section in `agent-memory/BOARD.md`: does its
   status match `git branch -a` + recent `git log`? Stale "last verified"/"next" lines?
   Also every `agent-memory/state-*.md` INCLUDING the supervisor's own: is its "last session"
   older than that seat's latest board/log activity? A stale state file lies to exactly the
   fresh session this system is built for.
2. **Queue hygiene** — unprocessed entries in `agent-memory/ready-queue.md` older than a
   day? VERDICTs missing? CHANGES verdicts never followed up?
3. **Repeated findings → rules** — has the same class of defect appeared 2-3 times? Then it
   graduates into the relevant rule or skill NOW (that's the Catch→Distill link).
   **⚠ GREP THE ARCHIVE TOO, or this check silently stops working.** Since the 2026-08-10
   compaction the live queue holds only the current era, so `grep "FINDING"
   agent-memory/ready-queue.md` alone sees a few days and will report "first occurrence" about a
   class on its fifth. The command is:
   `grep -c "<pattern>" agent-memory/ready-queue.md docs/archive/ready-queue-*.md`
   Then check each recurring class against `.claude/rules/` before concluding it is un-graduated —
   that cross-check is what found CRLF (2 defects, one chapter, zero rule coverage) on run 5.
4. **Un-graduated lessons** — read every `agent-memory/state-*.md` "Lessons learned":
   anything general still sitting there? Graduate it to the right skill/rule.
5. **Doc-vs-code drift** — spot-check ARCHITECTURE.md and docs/ENVIRONMENT.md claims against
   the tree (files that no longer exist, counts/numbers that rotted, harness rows vs actual
   .claude/ contents). ARCHITECTURE.md minimum bar (it's the doc most likely to rot once
   lanes build in parallel): sample ≥5 file paths it names and confirm each exists, and
   verify ONE behavioral claim against the actual code. CLAUDE.md: does every doc-map entry
   exist? Does every doc in docs/ appear in the map (or is it deliberately unindexed history
   under superpowers/)? Is CLAUDE.md still under its ~500-token budget
   (`wc -w CLAUDE.md` ≲ 380 words)?
6. **Contradictions** — do CLAUDE.md, rules/, skills/, and LAUNCH-KIT.md disagree anywhere
   (ports, paths, protocol names, who-may-do-what)? Specifically: does each LAUNCH-KIT
   opening prompt still match its lane's MISSION line + branch on the board? A stale prompt
   births a lane with a dead mission (re-mission runbook in /ship owns the fix).
7. **Decision capture (evidence-based — a cold supervisor knows no conversations)** — grep
   the board + PROGRESS.md + ready-queue for founder verdicts/approvals ("founder decided/
   approved/verdict/gate passed") and diff against **`agent-memory/DECISIONS.md`** (the permanent
   one-line-each record, since 2026-08-10) plus `grep DECISION` over cross-cutting AND
   `docs/archive/cross-cutting-*.md`: any verdict mentioned anywhere with no decision line is a
   capture failure — file it now, in DECISIONS.md.
8. **PROGRESS.md compaction** — `wc -l PROGRESS.md` > 1000? Propose a compaction to the
   founder: distill the oldest era into a short "era summary" section at the bottom and move
   its raw entries to `docs/archive/PROGRESS-<from>-<to>.md` (linked from the summary).
   Append-only stays the law for current entries; compaction only ever touches the old tail,
   and only with founder approval.
9. **Stale plans/specs** — every file in `docs/superpowers/plans/` and `docs/superpowers/specs/`
   whose feature already shipped must carry the historical banner as its first content line
   after the title (blank line between) (`> STATUS: SHIPPED — historical record, do not execute; current truth lives in
   ARCHITECTURE.md + PROGRESS.md`). Any shipped plan missing it → stamp it now. Files are
   stamped, never moved — moving breaks references from other docs. Sweep the whole
   `docs/superpowers/` root too — stray result/report files either get the banner or an
   index entry, not limbo.
10. **Log compaction thresholds** — `wc -l` on cross-cutting.md and ready-queue.md: either
    >400 lines → propose compaction to the founder. Append-only stays law; compaction happens
    only with founder approval and only AFTER a verified snapshot (below).
    **THREE THINGS RUN 5 (2026-08-10) LEARNED THE HARD WAY — read before proposing:**
    · **MEASURE THE ERA SPLIT BEFORE PROMISING IT.** This skill used to prescribe moving the old
      tail out by date. Measured, July was **88 of 978** cross-cutting lines and **192 of 1764**
      queue lines — archiving the entire previous month would have bought **9%**. The bulk is
      always the current era, because that is where the work is. Date is usually the WRONG axis.
    · **THE ARCHIVE IS A COMPLETE VERBATIM COPY OF THE WHOLE FILE, and the live log is rebuilt as
      an extract from it.** Not "the old tail moves out" — a full copy first means a parsing bug
      in the extractor cannot lose an entry. Verify with `cmp`, not with a clean exit code.
    · **DO NOT FILTER BY INFERRED STATUS.** Run 5's first build kept queue entries matching
      `/NOT fixed|STILL OPEN|…/` and dropped genuinely open findings written as "which is why it
      was filed rather than fixed". Findings carry no status field, so any such regex is a PROXY
      at the choke point deciding what a lane sees — see the rule in `rules/app.md`. **Keep by
      DATE, which is a fact.** Verify by naming the known-open items and grepping for each.
    **YOU CANNOT PLACE THE RESULT.** `Write`/`Edit` on both logs are denied in `settings.json` and
    every bash door (`>`, `sed -i`, `tee`, `cp`, `mv`, `writeFileSync`, `rm`, `dd`) is blocked by
    `pre-bash-gate.mjs`. Prepare + verify, then hand the founder the commands.
11. **Snapshot the brain** — copy `agent-memory/BOARD.md` + the two logs to
    `docs/archive/agent-memory-snapshots/<today>/` (they're small; this is the ONLY backup
    of every founder DECISION ever made — agent-memory is git-ignored, one disk, one copy).

**Timing law:** always run this lint BEFORE archiving/resetting any agent-memory file
(feature retirement, queue pruning) — the logs are the lint's evidence; sweep first, recycle after.

**Trigger law (mechanical, not a mood):** /ship supervisor step 6 appends a `MERGE` line per
merge and forces this lint when ≥3 MERGE lines have accumulated since the last `LINT` line
in cross-cutting.md. "Every 2-3 merges" is the counter, not a feeling.

**Meta-review law (who audits the supervisor):** roughly every ~10 merges or once per feature
cycle, dispatch a COLD external audit agent (fresh context, given the reference docs in
`Atlas Documents/Atlas smart environment files/` + this environment) to grade the supervisor's
own decisions and the environment against its goals — the 2026-07-02 harness audit and
Karpathy advisory are the template. The supervisor must not be the only grader of itself.

## Output

Append one line to `agent-memory/cross-cutting.md`:
`[ts] LINT — N findings (M fixed inline, K filed); worst: <one-liner or "clean">`
Fix small findings immediately; file bigger ones on the board (owner = the right lane or
supervisor). A lint that only produces a report failed its purpose.
