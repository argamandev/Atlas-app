# A5 · MAYA demo backfill + freshness

Status: ready-for-agent
Blocked by: 04

Spec §2.7 + §6 A5 (ticket 17's decisions). "Latest of each" per company (latest
quarterly + latest annual + 12 months of presentations, 234 companies, ≈55–70K pages);
detection by event ids 101/104/105/106, never `.xbrl` presence; ~10-minute
latest-disclosures poller + nightly per-company sweep, both through the birth sequence.
Acceptance: a fresh filing searchable ≤ ~15 min after publication; `index_status`
visible in admin. Cost: $5–8 one-time, ~$1–7/mo.

## Owed here by A4 — two things that only bite at THIS slice's scale

A4 measured retrieval on 3,181 chunks. This slice takes it to ~55–70K pages, which is exactly
where two stated limits stop being theoretical. Neither is a defect today; both become one here.

1. **The dense channel's reproduction was measured with the ANN index never engaged.** At 3,181
   rows the planner answers by sequential scan — it returned all 3,181 while `hnsw.ef_search` was
   clamped to 1,000, which an HNSW scan cannot do. So "dense reproduces the eval exactly" is a
   statement about exact cosine, not about HNSW. At this slice's size the index WILL engage and it
   is approximate by construction. **Re-run `run.mjs --real` after the backfill** and compare
   against `docs/evidence/feat-smart-layer-a4-backfill/gate.md`; a drop here is an index-tuning
   problem (`m`, `ef_construction`, `ef_search`), not a design problem.

2. **`retrieveChunks`' `truncated` flag has a blind spot that opens at this scale.** It reports a
   channel truncated when it fills its candidate pool; it cannot see one cut short by
   `hnsw.ef_search` (≤1,000) or by a scoped iterative scan hitting `hnsw.max_scan_tuples`
   (default 20,000) while still under the pool. That is a thin answer reported as a complete one —
   the failure `Degradation must be VISIBLE` exists to prevent. **The fix is small and known:**
   have `atlas_search_chunks` return one more index-backed count (rows in scope carrying an
   embedding) so completeness reads `saw = least(pool, in_scope)` with no ceiling comparison.
   Additive `create or replace`, through the usual DDL gate.

Also worth knowing here: the `index_status` admin surface this slice owes was deferred out of A3,
and A4 left `filing_facts` populated for 19 filings — the shapes both already exist.
