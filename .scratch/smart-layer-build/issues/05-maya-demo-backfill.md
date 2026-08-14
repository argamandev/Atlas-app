# A5 · MAYA demo backfill + freshness

Status: DONE — closed 2026-08-14. Both owed items from the merge are finished and filed; read
"What closed, and what stays open" below before picking up related work.
Blocked by: 04 (landed)

## What closed, and what stays open

**1 · Embedding finished.** The corpus is 1,298 of 1,300 `company_documents` indexed. Two documents
(426 and 537 pages) remain `index_status = 'failed'` after several repair passes — `atlas_replace_chunks`
hits `canceling statement due to statement timeout` on their bulk chunk insert every time. This is
a structural scale-tail (a real design question for that function, batching the insert), not a
retry problem, and is small enough (2 of 1,300) not to block the gate. Named, not rounded off.

**2 · The retrieval gate re-ran. Filed at `docs/evidence/feat-smart-layer-a5-maya-backfill/gate.md`.**
Headline: dense retrieval quality DROPPED at this corpus size — MRR roughly halved unscoped (0.254
→ 0.131), down ~27% scoped (0.268 → 0.195), and the MUST-PASS alias case (14, `בז"א`) now fails
UNSCOPED, holding only in the scoped design. This is real: A4 never actually exercised the HNSW
index (the planner seq-scanned 3,181 rows), so its numbers described exact cosine, not the
approximate ANN search production now runs. **Founder decision, 2026-08-14 (`DECISIONS.md`):** try
a cheap fix (index tuning), and if it doesn't resolve cleanly, move on to tickets 06/07 and open a
dedicated PRD/grill session for retrieval quality rather than guess at a fix overnight. The index
rebuild attempt (`m=32, ef_construction=128`) did not complete cleanly (see `gate.md`'s "What was
tried" section) and is left for that dedicated session, not this ticket.

**Open, not blocking:** 102 of 1,374 selected filings cannot be stored under
`unique (company_id, quarter, doc_type)` — measured, named per filing at run time, three ways out
in `measurements.md` §2 and §6. And neither the poller nor the sweep is SCHEDULED; the founder
deferred that until after V1 ("those sweep and poller are too advanced for us... after atlas v1 is
done"). `docs/corpus-freshness.md` carries the cron lines for the day that changes.

---

## What landed on the branch

| | |
| --- | --- |
| `filingKind()` + `selectLatestOfEach()` | the approved depth, pure and tested; event ids 101/104/105/106/270, never `.xbrl` |
| `syncCompanyFilings()` | ONE door for backfill, poller and sweep — what to spend, what is held, what races |
| `latestDisclosures()` | the live feed, normalised (see below) |
| `scripts/backfill-maya-corpus.ts` | the backfill, and — run again — the nightly sweep |
| `scripts/maya-poll.ts` | the ~10-minute poller |
| `/app/admin/corpus` | `index_status` visible, both locales, every state driven in a browser |
| migration 031 | the truncation blind spot below, closed |
| `docs/corpus-freshness.md` | how to schedule the two jobs (**not scheduled yet — Railway, founder**) |

**The trap this found, which no document recorded:** the live feed is MAYA product 1.0.0
and spells attachments `attachedfiles`, while `by-issuer` spells it `attachedFiles` —
measured present on 100% and 0% of each other's rows. Unnormalised, the poller would have
run every ten minutes forever, exited 0, and ingested nothing.

## Both things A4 owed here

1. **The ANN re-run is DONE** — `docs/evidence/feat-smart-layer-a5-maya-backfill/gate.md`, compared
   against `docs/evidence/feat-smart-layer-a4-backfill/gate.md`. It found what it was built to find:
   HNSW's approximation costs real rank quality once the index actually engages. Founder-deferred
   to a dedicated retrieval PRD session rather than fixed here.
2. **The `truncated` blind spot is CLOSED** — migration 031. Note that the fix ticket 05
   prescribed (`saw = least(pool, in_scope)`) was right and my first version was not: I
   dropped the pool, which makes every production query read as truncated. Caught in
   pre-apply review. The ticket's own formulation is the one in the code.

   Also: 031 could NOT be a `create or replace` as this ticket assumed — Postgres refuses
   to widen a `returns table`, and removing the old function is hook-blocked. Hence a new
   name, with 029's left in place and filed in `docs/open-findings.md`.

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
