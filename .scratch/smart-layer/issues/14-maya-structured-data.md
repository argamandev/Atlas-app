# What does MAYA already provide structured?

Type: research
Status: claimed (2026-08-12, research agent)

## Question

The founder's structured-facts amendment (ticket 07) makes the known repeated numerics of
TASE filings a lookup layer — but building our own Hebrew financial-table extraction is a
real project with a measured weak link (W5: extraction corruption). Before designing any
extraction: **what structured data does MAYA / the TASE Data Hub already hand us?** Read
`docs/MAYA-API.md` and `docs/product/2026-08-09-documents-catalog-findings.md`, then probe
the live API (rate limit 10 req / 2s, `Accept-Language: he-IL` mandatory): are key
financials (revenue, profits, EBITDA, equity, dividend), report metadata (publication date —
`company_documents` has no such column today), or per-period figures available as fields
rather than PDF text? Also check whether the ISA/TASE ecosystem exposes any XBRL/ESEF-style
machine-readable filings for TASE issuers. Output: a fact sheet — what exists, coverage,
freshness — so the architecture ticket (08) can decide extract-vs-fetch per fact class.
