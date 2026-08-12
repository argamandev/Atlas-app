# The ingestion standard — how a document is born

Type: grilling
Status: open
Blocked by: (none — frontier; its inputs 07, 08 and 14 are all resolved)

## Question

The standard every new transcript and filing obeys the moment it joins the corpus — written
once, cited by the spec (ticket 10). Decide the end-to-end birth sequence: **born attributed**
(`company_id` required at creation — no unattributed rows ever again); **chunked** per the
measured shapes (speaker-seam line-windows for transcripts, page-as-chunk for filings);
**embedded** (`gemini-embedding-001` @1536 with the deterministic metadata prefix, verbatim
`content` kept separate from `embedding_input`); **anchored** (real per-line timestamps from
the pipeline, quote snapshots, the corpus-level anchor from ticket 08); **deduped at birth**
(the `PyuMxe88e8g_live` lesson — a duplicate must be caught at ingestion, not by a ranker);
**structured facts extracted** (the XBRL parser in `ingestFiling()`, ticket 14); **publication
date recorded** (the new additive column). Also decide: where the pipeline runs, how it
respects MAYA's rate limit, and the re-processing story — what happens to chunks, embeddings
and anchors when `formatted_data` regenerates (drift is rendered, never hidden).

Most of this is engineering under laws already set; the founder confirms the product-visible
calls. Deliverable: the standard as a document the spec cites, plus the migration list it
implies.
