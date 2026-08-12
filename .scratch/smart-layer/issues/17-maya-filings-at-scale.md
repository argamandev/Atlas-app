# MAYA filings at scale — growing the searchable filing corpus

Type: grilling
Status: open
Blocked by: (none — frontier; its inputs 08 and 14 are resolved)

## Question

Today a filing's text joins the corpus only when a user opens it (23 documents, 2,549 pages).
Search mode and agents want the market's filings searchable without waiting for a click.
Decide, with the founder (these are cost/scope calls): **which document types** get ingested
at scale (quarterly/annual reports first? presentations? immediate disclosures?); **how many
years back** the one-time backfill reaches; **the ongoing trigger** (ingest on publication via
a scheduled MAYA sweep? nightly?); **the Hebrew PDF extraction pipeline** at that volume
(quality per W5, cost per thousand pages); **freshness** surfaced via the publication-date
column; and what all of it costs — the numbers feed ticket 09 and the spec (10). Constraints:
MAYA's 10 req / 2s rate limit, `Accept-Language: he-IL`, and the ingestion standard (ticket 16)
governs the shape of everything ingested.

**Cost inputs ready (ticket 09, 2026-08-12 — `research/09-cost-budgets.md` §3):** embedding
is never the cost story — Low/Mid/High backfill scenarios (103K/346K/600K pages) cost
$11/$39/$67 in embeddings ($6/$19/$33 batch). The real cost call this grilling decides is
the **extraction pipeline**: plain-text ≈ $0; LLM-per-page blurbs add $62/$208/$360 one-time
(Haiku batch) — and the blurbs' retrieval gain is still unmeasured, so measure before paying.
Ongoing ingestion ≈ $1–7/mo. Non-API note: the High scenario ≈ 3.7GB of pgvector — a
Supabase plan consideration.
