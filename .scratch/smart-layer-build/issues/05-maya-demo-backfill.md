# A5 · MAYA demo backfill + freshness

Status: MERGED to main 2026-08-14, with TWO THINGS OPEN. Read those first.
Blocked by: 04 (landed)

## OPEN · what a session picking this up does, in order

**1 · Finish the embedding.** The Gemini prepaid credits ran out mid-backfill and were topped up
(founder, 2026-08-14). A repair pass may still be running; if not, run it — it is idempotent and
costs nothing for what is already indexed:

    node --import tsx scripts/backfill-maya-corpus.ts

Check progress at `/app/admin/corpus`, or
`select index_status, count(*) from company_documents group by 1`. Done = zero rows `failed`.
Documents that are ingested but unembedded are INVISIBLE to search (dense retrieval filters on
`embedding is not null`) — honest, but a thinner corpus than the document count suggests.

**2 · Re-run the retrieval gate. THIS IS A5'S OWN ACCEPTANCE AND IT WAS DEFERRED PAST THE MERGE**
by founder decision (`DECISIONS.md`, 2026-08-14) to unblock ticket 06. It gates B1 SHIPPING, not
B1 starting.

    node --import tsx scripts/retrieval-eval/run.mjs --real

Compare against `docs/evidence/feat-smart-layer-a4-backfill/gate.md`, and file the result in
`docs/evidence/feat-smart-layer-a5-maya-backfill/gate.md`.

**Read `REAL_POOL`'s header in `run.mjs` BEFORE reading the numbers.** At this corpus size
`hnsw.ef_search` is clamped at 1000, so every unscoped dense case will report CUT SHORT by
construction. That is not a regression. What the run exists to answer is whether HNSW's
approximation costs ranking quality now that the index really engages — A4 measured with the
planner seq-scanning 3,181 rows, which is not the same thing. A drop is an index-tuning problem
(`m`, `ef_construction`, `ef_search`), not a design one.

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

1. **The ANN re-run is still OWED and is blocked on the real backfill.** `run.mjs --real`
   is meaningless until the corpus is big enough to engage the index — that is the whole
   point of it. Run it after the backfill and compare against
   `docs/evidence/feat-smart-layer-a4-backfill/gate.md`.
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
