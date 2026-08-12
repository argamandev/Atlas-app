# Retrieval methods for a Hebrew financial corpus

Type: research
Status: claimed

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
