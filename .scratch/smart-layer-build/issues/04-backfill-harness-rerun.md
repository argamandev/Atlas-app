# A4 · Backfill + harness re-run (the gate)

Status: DONE — backfill applied, gate run, founder decision taken (dense-only). Ready to ship.
Branch: feat/smart-layer-a4-backfill
Blocked by: 02, 03 (both landed)
Unblocks: every surface slice. **B1 may proceed, on the DENSE channel.**

> **DECIDED 2026-08-14 — Option 1, semantic search.** His words: *"okay yes lets just go with the
> semantic search now, and after we finish working on the rest of the tickets and test the product
> we can come back to it and improving it."* Filed in `DECISIONS.md`. He chose the simplest of the
> four options over this ticket's recommendation (Option 4); taken at his word.
> `retrieveChunks` now defaults to `channels: 'dense'`, with a battery test holding that default,
> and the lexical channel stays reachable so the revisit costs a flag rather than a rebuild.
> **Whoever revisits: re-enabling lexical re-runs the eval gate** (ingestion standard §5), and the
> eval set needs an exact-lookup case first — see "Option 4" below for why that is the class that
> would decide it.

Spec §6 A4; the standard's backfill section. Existing corpus (5 transcripts, 23
documents) through the standard: publication dates, XBRL facts, source keys, timestamp
alignment, ~3,200 chunks embedded. **Acceptance — the gate for every surface slice: the
standing 18-case harness (`scripts/retrieval-eval/`) re-runs against the REAL pipeline
(pgvector + real tsvector lexical channel) and reproduces the measured eval results,
MUST-PASS cases included.** Cost: ≈ $0.35.

---

## What landed

**The backfill ran against production, clean, zero failures.** It was 26 documents, not 23.

| | |
| --- | --- |
| `document_chunks` | **3,181**, none missing an embedding |
| transcripts | 3 `indexed`, 2 `excluded` (the demo row and the duplicate) |
| documents | 26/26 `indexed`; 26/26 carry a real `publication_date` |
| `filing_facts` | 1,398 rows across 19 filings (492 numeric); the 7 presentations say `none` |
| constraint | `transcripts_company_required` is now VALIDATED (migration 030) |

`scripts/backfill-corpus.ts` is idempotent, resumable and `--dry-run`-able. It writes through
doors that already exist — `saveFormattedData`, `reindexTranscript`/`reindexDocument`,
`persistFilingFacts` — and owns only `source_key`, which no door can compute for a row born
before the door existed.

**Three defects it exposed, all fixed at the choke point rather than in the script:**

1. **MAYA's `publicationDate` carries no timezone.** It is naive Israel wall-clock; a
   `timestamptz` column reads it in the session zone (UTC on Supabase) and stores an instant
   2–3 hours wrong, on a product that renders Israel time to every viewer. Fixed at
   `toRemoteSources` via `israelInstant` in `lib/i18n/format.ts` — which is now the ONE file
   allowed to know what Israel time means, enforced by a ratchet test.
2. **A ת930 instance repeats a concept once per signatory.** Nine key collisions on בז"א's 2025
   annual report; Postgres refused the whole upsert and 26 numeric facts were lost behind a
   visible `facts_status = 'failed'`. `dedupeFactsByKey` collapses repeated text keeping every
   value, and THROWS on two different numbers for one period rather than picking one.
3. **A transcript with no `source_key` can no longer be chunked.** That, not a hardcoded id in
   a one-time script, is what keeps `PyuMxe88e8g_live` out of search.

**The real pipeline exists**: migration 029 (`atlas_search_chunks` — pgvector + the dual-form
tsvector, RRF k=50, a true company pre-filter), `src/lib/corpus/retrieve.ts` as its one caller,
and `run.mjs --real` scoring that module rather than a copy of it.

## The gate's answer

Full evidence: `docs/evidence/feat-smart-layer-a4-backfill/gate.md`.

- **Dense reproduces the measurement exactly** — MRR 0.254 / 0.268 unscoped and scoped, case for
  case, missed-set for missed-set.
- **MUST-PASS holds** — case 14 (`בז"א`) ranks 1 in every real design, through the production
  resolver against the live alias table.
- **The lexical channel does not reproduce** — MRR 0.207 → 0.075 — and it drags the chosen hybrid
  design below dense-only (0.365 measured → 0.141 real, against dense-only's 0.268).
- **Root cause, verified:** `ts_rank`/`ts_rank_cd` have no IDF. `שנת` is in 96% of chunks and is
  scored like `ההכנסות`, which is in 5%. Real BM25 computed in SQL over the same `tsvector`
  reproduces the measured rank exactly (case 16 → rank 1), so the tokenizer, chunks and index are
  all correct; only the scorer is wrong.

## The decision — CLOSED 2026-08-14, Option 1 (the four as they were put to him)

B1 must not ship on a channel that measurably underperforms the design it claims to be.

**Option 1 — ship dense-only now.** Zero further work; it is what already reproduces (MRR 0.268).
Costs the hybrid's measured advantage (0.365) — most visibly on lexical-friendly questions: exact
figures, quoted phrases, ticker and מספר-נייר lookups, which are what an analyst types most.

**Option 2 — build a real BM25 channel.** A precomputed inverted index over the corpus
(`chunk_terms(chunk_id, lexeme, tf)` + df + doc length), maintained where chunks are written.
~860K rows today, ~16M at A5's scale. Reproduces the chosen design. Costs a migration, a
write-path change, a backfill and a re-run — and it is a real addition to the shared corpus, so
it goes through the DDL gate. Computing BM25 per query WITHOUT that index is not an option: 31
seconds on 3,181 chunks, measured.

**Option 3 — re-measure and re-choose.** The eval was run against an in-process BM25 that
production cannot cheaply have. Re-approve the design against what production can actually do.

**Option 4 — dense now, lexical demoted to exact-match only (RECOMMENDED).** Ship Option 1's
dense channel as the ranker, and keep the tsvector for the one job it is still perfect at:
finding an exact string. Dense embeddings are weakest exactly where lexical is strongest — a
ticker, a `מספר נייר`, a figure like `358.7`, a quoted phrase — and for those the ordering
problem does not arise, because a query of one rare term has nothing to mis-weight. Concretely:
route to the lexical channel only when the query carries a term the corpus rarely holds, and rank
with dense otherwise.

Why this one: it unblocks B1 today at no cost, it keeps the exact-lookup ability that a financial
product cannot do without, and it does not spend a migration on a design the eval has not
re-approved. It also leaves Option 2 fully open — an inverted index can be added later without
undoing anything, and by then A5's real corpus (~60K pages) will say whether the cost is worth
it on data that actually matters. The measured downside is real and should be said plainly: the
in-process hybrid scored 0.365 against dense-only's 0.268, so this defers a ~36% relative
retrieval gain that may or may not survive contact with real BM25 in Postgres.

**This needs a measurement before it is trusted, not just an argument** — the eval set has no
exact-lookup case today (no ticker, no `מספר נייר`, no verbatim-figure question). Adding two and
re-running the gate is the cheap next step whichever option is chosen.

Also for the founder: a stray diagnostic function `public.probe_idf_tsquery(text, float)` sits on
production (recorded in `COLLISIONS.md`). It is referenced by nothing; removing it is hook-blocked
and needs an explicit OK.

Not a regression, but needs re-approval: **discovery case 20 now reads 6 ✗ for every design**,
because the corpus holds seven companies rather than eight (`תמיס` left with the demo row) and the
pass gate counts distinct companies. The threshold should be re-approved against the real corpus.
