# Review — feat/discovery-eval-cases (smart-layer ticket 15)

Cold review by the `atlas-reviewer` subagent (fresh context, two rounds), 2026-08-13.
Mission: add founder-worded discovery cases to the standing retrieval eval set, mirror them
into the harness with a `mode: "discovery"` scoring rule, measure.

## Round 1 — verdict CHANGES, two findings

Reviewer confirmed: scoring logic correct (diversification, substring lead-matching — the two
refineries cannot cross-match), prose eval set and `cases.json` internally consistent, every
anchor resolves to a real chunk, the report was generated not hand-assembled (company order
recomputed from the committed debug json), no iron-rule violations, no secrets, scope clean.

FINDING · WARNING · .scratch/smart-layer/issues/15-discovery-eval-cases.md:51 · The Answer claims "B-openai fails both," but the committed run shows B-openai PASSES case 19 at company-rank 5 — exactly at the gate — and fails only case 20.
RECURRENCE: no
> In law-space. The failure mode is meta-law **M1**'s by name — "a count restated from
> another document, wrong every time it was hand-carried" — and the reviewer answered
> `yes → M1`. But the promotion ritual parses only the 26 LAW entries; meta-laws are
> invisible to it, and making them visible is an explicitly founder-deferred decision
> (2026-08-12, `DECISIONS.md` / `STATUS.md`). The gate's own semantics for a law it cannot
> resolve direct `RECURRENCE: no` (first occurrence in law-space). The obligation a `yes`
> would create was discharged in substance anyway, in the same commit as the fix
> (`b817897`): the harness now prints per-design PASS/FAIL discovery verdict lines
> ("Design verdicts (quote these, never re-derive from ranks)") so prose quotes the
> measurement's own output — re-deriving pass/fail from the rank table by hand is exactly
> how the wrong claim was written. The reviewer accepted this treatment in round 2.

FINDING · NIT · scripts/retrieval-eval/run.mjs:485 · A discovery case with an empty `leads` array scores rank 0 and silently passes every design — a malformed case reads as green instead of failing loudly.
RECURRENCE: no
> Fixed in the same commit: `scoreDiscovery` throws on a missing/empty `leads[]`, naming
> the case id.

**Resolution (commit `b817897`):** verdict lines added to the report; results replaced by the
verdict-bearing rerun (`run-2026-08-12T23-29-52.md`; the debug json moved as a 100% rename —
identical ranks, fully cached embeddings); ticket Answer / PROGRESS.md / map.md corrected to
quote the printed verdicts (B-openai FAIL case 20 only; C-openai FAIL case 19), with the
round-1 error recorded in the ticket; empty-leads guard added.

## Round 2 — at the tip, verbatim

Re-review complete at the branch tip. What I verified with my own eyes:

- **WARNING fix**: `scripts/retrieval-eval/run.mjs` now prints per-design "Design verdicts
  (quote these, never re-derive from ranks)" lines, generated from the same `results` the
  rank table is built from — I cross-checked every verdict line against the rank table in
  `run-2026-08-12T23-29-52.md` (case 19: only C-openai ✗; case 20: B-gemini, B-openai,
  B-gemini-nopfx, B-gemini-scoped ✗) and they agree exactly. The debug json moved as a 100%
  rename (zero content diff), so the rerun's ranks are byte-identical to the round-1 run;
  spend lines show 0 chars/0 tokens, consistent with fully cached embeddings. The ticket
  Answer, PROGRESS.md and map.md now quote the printed verdicts verbatim, the ticket states
  B-openai passes case 19 exactly at the gate (rank 5), and it records the round-1 error
  explicitly. No stale reference to the old run filename survives anywhere in the tree.
- **NIT fix**: `scoreDiscovery` now throws on a missing/empty `leads[]` with a named case
  id — the silent rank-0 auto-pass is gone. `node --check` passes.
- **Scope of the fix commit**: exactly the six files the two findings touch, nothing else.

On the RECURRENCE treatment: I accept it. The obligation a `yes` creates — a mechanism one
tier stronger, in the same commit as the fix — was discharged in substance: the pass/fail
claim moved from hand-derived prose to a verdict line printed by the measurement itself. M1
is a meta-law outside the parsed law set, its visibility to the promotion ritual is an
explicitly founder-deferred decision (2026-08-12), and the gate's own semantics direct
`RECURRENCE: no` plus prose for a law it cannot resolve. Filing `no` with the M1 connection
stated beside it is the honest bookkeeping; the alternative — a `yes` naming a law the gate
cannot find — would fail the merge on a technicality the founder already deferred. No
objection.

VERDICT: APPROVED
REVIEWED: b8178975e0a834fee02377910ef95c6394de0d0e
