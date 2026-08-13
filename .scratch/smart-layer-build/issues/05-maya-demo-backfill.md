# A5 · MAYA demo backfill + freshness

Status: BUILT, not yet run. Branch `feat/smart-layer-a5-maya-backfill`.
Blocked by: 04 (landed)

> **Migration 031 IS APPLIED** (`atlas_search_chunks_v2`) — filed, reviewed on the file
> across three rounds, appended to `COLLISIONS.md`, then applied and verified through
> `retrieveChunks` against the live corpus. 029's function is deliberately left in place
> so the currently-deployed build keeps working until this branch ships.
>
> **THE BACKFILL IS RUNNING** (founder said go, 2026-08-14). Resume/finish it with:
> `node --import tsx scripts/backfill-maya-corpus.ts` — idempotent and resumable, so an
> interrupted run costs nothing but the MAYA reads to find its place again.
>
> **A second pass is required regardless of how the first ends.** Two mid-run fixes landed
> after it started: `pgSafe` (a NUL in extracted text was killing whole documents at the
> pages insert) and the no-pages repair path. The ~0.5% of documents that failed before
> those landed are self-healing — the next pass re-fetches them — but only if a next pass
> runs.
>
> **⚠ COST IS TRACKING ABOVE THE APPROVED FIGURE.** At 80/233 companies: 420 documents,
> 27,661 pages, i.e. ~66 pages/document against the 47–60 the $5–8 estimate assumed.
> Extrapolated: ~1,220 documents, ~80K pages, **≈$10–14 of embeddings rather than $5–8**.
> Not a defect — the corpus is simply denser than ticket 17 projected — but it is his money
> and his number, so tell him before the final pass rather than after.
>
> ## THEN, IN ORDER — and B1 must not start before this lands
>
> 1. **Finish the backfill**, then run it once more (see above).
> 2. **Re-run the gate:** `node --import tsx scripts/retrieval-eval/run.mjs --real`, compare
>    against `docs/evidence/feat-smart-layer-a4-backfill/gate.md`. Read `REAL_POOL`'s header
>    first — at this corpus size every unscoped dense case reads CUT SHORT by construction,
>    because ef_search clamps at 1000. That is not a regression.
> 3. **`/ship`** — it still owes STATUS.md, PROGRESS.md, a final review verdict + sha, and
>    one real ADR-0002 call (see `docs/evidence/.../review.md`, last section).
>
> **Do not start ticket 06 (B1a) from `main` until this merges.** B1a's main surface is the
> retrieval contract, and `src/lib/corpus/retrieve.ts` on `main` is the pre-A5 version — it
> calls `atlas_search_chunks` and its `ChannelReport` has neither `inScopeCapped` nor the
> `ran` semantics. Building B1a against that means a guaranteed conflict in the one file it
> touches most. B1a's `Blocked by: 04` is formally satisfied; this is a practical ordering,
> not a dependency.
>
> **And one decision:** 207 of the 1,385 selected filings (15%, all presentations, 91 of
> 233 companies) cannot be stored under `unique (company_id, quarter, doc_type)`. Measured,
> not predicted. Three ways out with a recommendation:
> `docs/evidence/feat-smart-layer-a5-maya-backfill/measurements.md` §2.

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
