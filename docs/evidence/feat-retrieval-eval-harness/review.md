# Review — feat/retrieval-eval-harness

Branch: `feat/retrieval-eval-harness` (retrieval eval harness + ticket 07 resolution;
scripts + docs + .gitignore only — no app code, no migrations).
Reviewer: `atlas-reviewer` subagent, dispatched 2026-08-12. Two rounds: findings on the
initial diff, fixes in `ccb918d`, delta re-review → clean approval.

REVIEWED: ccb918d

Battery at review time: 700/700 tests · `tsc` clean · `npm run build` green.
`/verify-app`: not run, stated honestly — the diff contains zero app code, so a browser
pass would measure surfaces this branch never touched (M1: say what the evidence measured).
The harness itself was verified by executing it; its output is committed at
`scripts/retrieval-eval/results/run-2026-08-12T13-52-12.md`.

## Round 1 verdict (verbatim), with recurrence answers

```
VERDICT: APPROVED
FINDING · WARNING · scripts/retrieval-eval/run.mjs:509 · The comment's claim that post-filtering equals pre-filtering is false for the RRF-fused designs — RRF weights derive from GLOBAL ranks, so a production company_id-pre-filtered hybrid would fuse scope-local ranks and can order differently, making the winner C-gemini-scoped's reported numbers an approximation the comment presents as exact (true only for the dense-only channel).
RECURRENCE: no
FINDING · WARNING · scripts/retrieval-eval/cases.json:185 · Case 14's own committed measurement (rank 1 in every design, unscoped included) falsifies the note's "Expected: no — which is the evidence FOR the alias table", and no document on the branch records that the honest fallback actually bridged; for the scoped designs the rank-1 is additionally tautological (filter to company X, then score the first company-X chunk).
RECURRENCE: no
FINDING · WARNING · scripts/retrieval-eval/cases.json:184 · expectCompany re-decides MUST-PASS case 14 against the canonical prose — retrieval-eval-set.md says "must reach בתי זיקוק content" and its corpus snapshot lists no בית זיקוק אשדוד, yet the corpus contains BOTH companies and the mirror silently targets בית זיקוק אשדוד instead of amending the canonical file first, violating the README's own "prose first, then mirror" rule.
RECURRENCE: no
FINDING · NIT · .scratch/smart-layer/research/07-retrieval-eval-results.md:84 · "Costs (this run, measured)" cites 10.9M Gemini chars and 5,001,141 OpenAI tokens, but the only committed run artifact reports 0/0 spend (fully cached) — the metered numbers trace to an uncommitted earlier run and are restated in PROGRESS.md.
RECURRENCE: no
FINDING · NIT · scripts/retrieval-eval/run.mjs:153 · transcripts, companies and company_documents are fetched without pagination, so the standing gate will silently truncate the corpus at Supabase's 1000-row default once any of them grows past it (only document_pages is paginated) — a green run that measures less than it claims.
RECURRENCE: no
FINDING · NIT · .scratch/smart-layer/issues/06-agent-experience.md:17 · Stowaway: the ticket-06 founder note rode in commit 6525808 whose message names only tickets 07/14/15, and the added line has an unclosed ** and no trailing newline.
RECURRENCE: no
```

Recurrence rationale, brief: none of the six repeats a defect class a law in
`.claude/rules/` already records for this repo. (4) is close to "counts carry their
command" but the number came from the run's own console meter, not restated prose — the gap
was the evidence trail, closed by the provenance line. (6) was a deliberate, disclosed
filing of the founder's own tracker note staged by explicit path, not a blanket-add sweep;
its formatting is fixed and the note preserved verbatim.

## Fixes

All six addressed in `ccb918d` — paged corpus fetch (every table), honest
exact-for-dense/approximate-for-RRF comment, case-14 note rewritten to match its own
measurement, dated amendment in the canonical eval set disambiguating issuer 1361
(בית זיקוק אשדוד vs בז"ן), cost-provenance line, founder note labeled verbatim. A
behavior-control run after the pagination refactor produced an identical corpus (3,202
chunks) and identical lexical-design ranks (case 01 → 9, case 16 → 1).

## Round 2 verdict (verbatim, branch through `ccb918d`)

```
VERDICT: APPROVED
FINDINGS: none
```
