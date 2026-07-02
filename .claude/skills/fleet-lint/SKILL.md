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
2. **Queue hygiene** — unprocessed entries in `agent-memory/ready-queue.md` older than a
   day? VERDICTs missing? CHANGES verdicts never followed up?
3. **Repeated findings → rules** — `grep "FINDING" agent-memory/ready-queue.md`: has the
   same class of defect appeared 2-3 times? Then it graduates into the relevant rule or
   skill NOW (that's the Catch→Distill link).
4. **Un-graduated lessons** — read every `agent-memory/state-*.md` "Lessons learned":
   anything general still sitting there? Graduate it to the right skill/rule.
5. **Doc-vs-code drift** — spot-check ARCHITECTURE.md and docs/ENVIRONMENT.md claims against
   the tree (files that no longer exist, counts/numbers that rotted, harness rows vs actual
   .claude/ contents). CLAUDE.md doc map: does every entry exist? Does every doc in docs/
   appear in the map (or is it deliberately unindexed history under superpowers/)?
6. **Contradictions** — do CLAUDE.md, rules/, skills/, and LAUNCH-KIT.md disagree anywhere
   (ports, paths, protocol names, who-may-do-what)?
7. **Decision capture** — skim recent founder conversations you know of: any decision made
   in chat that never landed as a `DECISION` line in cross-cutting.md / PROGRESS.md?

## Output

Append one line to `agent-memory/cross-cutting.md`:
`[ts] LINT — N findings (M fixed inline, K filed); worst: <one-liner or "clean">`
Fix small findings immediately; file bigger ones on the board (owner = the right lane or
supervisor). A lint that only produces a report failed its purpose.
