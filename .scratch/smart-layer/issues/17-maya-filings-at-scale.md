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
