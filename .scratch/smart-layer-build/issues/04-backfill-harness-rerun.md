# A4 · Backfill + harness re-run (the gate)

Status: backfill DONE · gate RAN and returned a finding · one founder decision open
Branch: feat/smart-layer-a4-backfill
Blocked by: 02, 03 (both landed)

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

## The open decision — founder's call, and it blocks B1

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

Also for the founder: a stray diagnostic function `public.probe_idf_tsquery(text, float)` sits on
production (recorded in `COLLISIONS.md`). It is referenced by nothing; removing it is hook-blocked
and needs an explicit OK.

Not a regression, but needs re-approval: **discovery case 20 now reads 6 ✗ for every design**,
because the corpus holds seven companies rather than eight (`תמיס` left with the demo row) and the
pass gate counts distinct companies. The threshold should be re-approved against the real corpus.
