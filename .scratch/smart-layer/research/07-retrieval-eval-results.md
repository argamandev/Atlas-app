# Retrieval eval — measured results and recommendation

Ticket: `.scratch/smart-layer/issues/07-retrieval-eval.md` · Measured: 2026-08-12
Harness: `scripts/retrieval-eval/` (kept — the standing quality gate). Full numbers:
`scripts/retrieval-eval/results/run-2026-08-12T13-52-12.md` (+ `debug-*.json` top-20 per case).

**What was measured.** The candidate designs from research/01 §9, scored against the
founder-approved 18-case eval set on the REAL corpus — 3,202 chunks (113 transcript
line-windows cut on speaker seams, 3,089 filing page-chunks), live from Supabase, ranked
in-process (brute-force cosine + in-memory BM25). **No pgvector was installed** — the
migration is a conclusion of this eval, not its prerequisite. Metric: the rank at which a
design's top-k covers ALL of a case's anchors (the eval set's own pass rule); 15 of 18 cases
are rankable (13 is an architecture gate, 15/17 are answer-layer policy cases, recorded as
evidence).

## Headline

| Design | hit@5 | hit@20 | MRR |
| --- | --- | --- | --- |
| L — BM25 lexical only | 4/15 | 8/15 | 0.207 |
| B-gemini — dense only, gemini-embedding-001 @1536 | 6/15 | 7/15 | 0.254 |
| B-openai — dense only, text-embedding-3-large @1536 | **2/15** | **2/15** | 0.055 |
| C-gemini — hybrid (dense+BM25, RRF) | 5/15 | 9/15 | 0.300 |
| C-openai — hybrid | 5/15 | 8/15 | 0.207 |
| B-gemini-nopfx — dense, NO metadata prefix | 3/15 | 4/15 | 0.100 |
| **C-gemini-scoped — hybrid + company_id filter** | **7/15** | **10/15** | **0.365** |
| B-gemini-scoped — dense + company_id filter | 7/15 | 8/15 | 0.268 |

## Findings

1. **OpenAI embeddings fail on Hebrew — ruled out.** `text-embedding-3-large` covers 2/15
   anchors in top-20 vs Gemini's 7/15 on identical chunks. It also *costs* more than its
   price suggests: OpenAI metered **5,001,141 tokens for ~5.0M chars** of corpus — Hebrew is
   ≈1 char/token in its tokenizer, ~2–4× the token count the repo's 2.1-chars/token Hebrew
   calibration would predict. D8's "measured, not assumed" clause just paid for itself:
   both leading candidates score within a few points on English benchmarks.

2. **The deterministic metadata prefix is load-bearing.** Removing it collapses dense
   retrieval (case 05: rank 1 → rank 417; hit@20 7/15 → 4/15). Anthropic's contextual-
   retrieval gain is real here, and most of it comes from metadata we already own
   (company · call/doc · section · speaker · page) at zero LLM cost. The LLM-blurb
   increment remains unmeasured (see "not measured").

3. **Hybrid earns its keep.** RRF fusion beats both channels alone (MRR 0.300 vs 0.254
   dense / 0.207 lexical; misses@20 6 vs 8). The lexical channel rescues exactly the
   predicted cases: case 11 (מילואים, conversational Q&A) 136 → 17; the W4 garble case 02
   (הרווח הטיפולי for התפעולי) 56 → 6 — dense bridges the garble, lexical anchors the rest.

4. **Company scoping is the single biggest multiplier.** Filtering to the resolved
   company's chunks lifts the hybrid to 10/15 @20 / MRR 0.365 (case 09: 8 → 1). And case 17
   (טבע — no corpus content) returns an **empty scoped ranking**: the honest
   "cannot ground" signal falls out of the design for free. This is the measured proof of
   research/01 §6: the **alias table + resolver is the prerequisite investment** — retrieval
   filters by `company_id`; it never hopes an embedding lands.

5. **The strict misses mostly retrieve a CORRECT alternative source.** Of the winner's 5
   misses@20: case 04's top-6 are Tigbur's own Q1-2026 investor presentation (same numbers,
   different document); case 08's rank-1 is the half-year *report* page 8 while the anchor
   is the *presentation* page 8 (same figure); case 06's top hits are annual-report pages
   of a staffing company discussing headcount. A model reading top-20 answers these
   correctly with a valid citation — the anchor-strict score is the floor. The genuine
   failures: **case 10** (the segment-table page — table pages embed poorly) and
   **case 18** (duplicate discipline, next finding).

6. **The duplicate transcript pollutes every design.** `PyuMxe88e8g_live` outranks or
   crowds its canonical twin everywhere (dup at 15 while the canonical anchor sits at 51).
   No ranker fixes this — it is corpus hygiene: delete or suppress the duplicate
   (**feeds ticket 13**), and the ingestion standard must dedup at birth.

7. **Window policy validated.** Case 05 (Q&A pair split across L0030+L0031) and case 16
   (the 12-vs-16 self-correction across L0253–L0256) both land in ONE window at rank 1–2 —
   the speaker-seam/target-size cut (700/1100 chars) kept the pairs together, which was the
   exact hazard those cases exist to catch.

8. **Attribution trap confirmed at the retrieval layer (case 15).** Scoped to Tigbur, every
   design's top-5 is Zim-hearing chunks wearing Tigbur's `company_id`. Scoping cannot fix
   W1 — the guard belongs at the answer layer ("no Tigbur-management statement exists"),
   exactly as the eval set ruled.

9. **Design A arithmetic (measured, not estimated).** All 5 transcripts ≈ **39.5K tokens**
   — whole-transcript-corpus stuffing is trivially affordable today and any single call is
   6–18K tokens. All filing pages ≈ **2.29M tokens** — permanently out of stuffing range.

## Costs (this run, measured)

- **Preprocessing**: Gemini 10.9M chars sent (two variants; a single production pass is
  ~half) ≈ $0.71 at the still-[unverified] $0.15/M; OpenAI 5.0M tokens metered ≈ $0.65.
  Steady state: one-time corpus pass ≈ **$0.35**, incremental per new call ≈ 8–20K tokens ≈
  **well under a cent**. Cost is a non-issue at this scale; it was measured because the
  2026-08-09 brief makes cost-per-answer a design constraint.
- **Per query**: query embedding is negligible (~30 tokens); the real per-query cost is the
  context handed to the answering model — top-20 chunks ≈ 6–9K tokens, vs 6–40K for scoped
  stuffing. Both are cheap; pricing the answering model is ticket 09's job (blocked on the
  Anthropic account, ticket 11).

## Recommendation (for the founder to react to)

**Ship the C-gemini-scoped shape, behind a scope router:**

1. **Chunking as the harness builds it**: transcript line-windows on speaker seams
   (~700/1100 chars) carrying line-id ranges; page-as-chunk for filings (split >3,500
   chars, keeping `page_no`); verbatim `content` separate from prefixed `embedding_input`
   — anchors stay pure.
2. **Embeddings: `gemini-embedding-001` @1536 (MRL, re-normalized)**. OpenAI is ruled out
   on measured Hebrew quality (and pays a 2–4× Hebrew token tax).
3. **Hybrid dense + lexical fused with RRF** (the Supabase recipe), deterministic metadata
   prefix in the indexed text.
4. **Resolve the company first, filter by `company_id`** — which makes the alias table the
   first build item, closes MUST-PASS case 14 by construction, and yields honest empty
   results for out-of-corpus companies (case 17).
5. **Route by scope size**: scope resolves to a call or two (≤ ~40K tokens) → stuff the
   full document(s), Design-A style, with caching; anything bigger or cross-corpus →
   retrieve top-20. Our own numbers reproduce the SELF-ROUTE conclusion.
6. **Corpus prerequisites**: delete/suppress the `PyuMxe88e8g_live` duplicate (ticket 13);
   the answer layer carries the W1 attribution guard (case 15); case 13 (intake regression)
   gates the architecture ticket 08, not the ranker.

pgvector installation + the `document_embeddings` migration are now justified by
measurement and go through the DDL gate as designed (file → review → COLLISIONS.md → apply).

## What this did NOT measure (each is one harness rerun away)

- End-to-end answer quality (retrieval-rank is the proxy; the eval set's pass rule).
- Chunk-size sweep (one configuration measured); window overlap.
- MRL truncation loss (1536 only; 3072/halfvec untested).
- Real Postgres lexical behavior (`tsvector 'simple'` / pg_trgm / PGroonga on Supabase) —
  the BM25 here is an in-process simulation of the dual-indexed lexical channel.
- The LLM contextual-blurb increment over the deterministic prefix (Anthropic's +35→49%).
- A multilingual reranker over top-50.
- gemini-embedding-001 was the only strong dense candidate tested; an open-source control
  (BGE-M3 / multilingual-e5) would need self-hosting and stays optional.
