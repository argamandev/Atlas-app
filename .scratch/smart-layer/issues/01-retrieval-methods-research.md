# Retrieval methods for a Hebrew financial corpus

Type: research
Status: resolved

## Question

Which retrieval architecture best serves Atlas's goal — accurate, **cited** answers over
Hebrew investor-call transcripts, structured filings (PDF pages), and MAYA company data, at
controlled cost?

Evaluate at least: size-based / structure-based / sentence-based chunking, semantic
embeddings, Anthropic's Contextual Retrieval, hybrid search (BM25/lexical + vector),
long-context-instead-of-RAG below ~200K tokens, and per-corpus-type strategies (the
founder's hypothesis: structure-based for reports, sentence-based + hybrid for transcripts).
Weigh specifically: which embedding models actually handle **Hebrew** well; pgvector-on-
Supabase fit (extension available, not installed); exact-term retrieval needs (tickers,
dates, financial figures); citation anchoring — transcript line ids (`L0001`) and document
page numbers must survive chunking; preprocessing cost; per-query cost.

The founder's own research (2026-08-12, "amateur" by his account) is the hypothesis menu;
this ticket must confirm, correct, or replace it with cited primary sources. He asked us to
"lead the way to the correct approach."

Deliverable: a recommendation per corpus type + candidate designs concrete enough for the
eval prototype (ticket 07) to measure.

## Answer

Full findings, every claim cited (claims resting on model knowledge marked `[unverified]`
inline — WebFetch was unavailable, so corroboration ran through WebSearch snippets of the
primary sources): `../research/01-retrieval-methods.md`.

The founder's hypothesis is largely confirmed, with refinements:

- **Filings:** page-as-chunk (structure-based) — `document_pages` is already the right unit.
- **Transcripts:** not single lines but **line-windows of ~200–400 tokens cut on
  section/speaker seams**, carrying `first_line_id`/`last_line_id` so the shipped
  citation-anchor format survives chunking trivially.
- **MAYA data: don't embed it** — it's structured. The highest-leverage investment is the
  **alias table**, so `company_id` filters become reachable from Hebrew user language (the
  בז"א failure is a resolver problem, not retrieval).
- **Contextual Retrieval:** real (Anthropic's measured 35%→49%→67% failure-rate reductions),
  but most of its value here is capturable **deterministically** — company/date/quarter/
  section/speaker prefixes from metadata at zero LLM cost. Schema rule: embedded text ≠
  stored citable text, or `source_quote` drift detection breaks.
- **Hybrid search** is justified by exact-term needs (tickers, figures) via Supabase's own
  tsvector+pgvector+RRF recipe — but Postgres has **no Hebrew stemmer**, making Hebrew
  lexical recall the single most uncertain component. Mitigations to measure: dual-indexing
  prefix-stripped forms (the ו/ה/ב trick `plan.ts` already uses), PGroonga, pg_trgm.
- **Embeddings:** no trustworthy public Hebrew retrieval benchmark exists — our own eval
  (ticket 05) IS the benchmark. Shortlist: gemini-embedding-001 vs text-embedding-3-large
  (both vendors already wired in), truncated to **1536 dims** for pgvector's 2000-dim HNSW
  limit, with multilingual-e5/BGE-M3 as open-source control.
- **Three candidate designs for ticket 07:** A = scoped long-context stuffing + caching (the
  baseline retrieval must beat at today's corpus size) · B = pgvector-only with
  deterministic context prefixes · C = B + lexical channel + RRF, with LLM-written context
  and a reranker as separately measured increments. Decision rule + a 10-item
  "measure before trusting" list are in the file.
