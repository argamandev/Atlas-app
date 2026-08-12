# Retrieval eval — measured, not assumed

Type: prototype
Status: open
Blocked by: 01, 05

## Question

Measure the candidate retrieval designs from ticket 01 against the eval set from ticket 05,
on our own corpus — Hebrew embedding quality measured, not assumed (the 2026-08-04 spec's
explicit warning). Output: scores per candidate design, per-query cost and preprocessing
cost alongside quality, and a recommendation the founder can react to. This harness is kept,
not thrown away — it becomes the standing quality gate for every future retrieval change.
