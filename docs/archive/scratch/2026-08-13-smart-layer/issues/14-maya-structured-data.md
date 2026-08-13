# What does MAYA already provide structured?

Type: research
Status: resolved (2026-08-12)

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

## Answer

MAYA already hands us far more than expected: every quarterly/annual report of an
Israeli-track issuer carries an **`.xbrl` attachment on the public file host** (ISA MAGNA form
ת930, `ifrs-il` + `ifrs-full` taxonomies) with 26 core facts — revenue, gross/operating/
pre-tax/net profit, EPS, comprehensive income, balance-sheet and cash-flow totals, in ILS with
exact period contexts, plus auditor/review/signing metadata — verified by downloading and
parsing two live instances (coverage measured back to 2018; absent for dual-listed
foreign-track issuers like ICL, and absent in 2012). **Publication date is in every
`by-issuer` row** (`publicationDate`, sub-second) and already flows as `publishedISO` through
`toRemoteSources` — the gap is one additive column, not extraction. EBITDA, segments and
non-GAAP metrics are NOT structured anywhere (PDF-only, extraction stays ours, but the scope
shrinks to those residuals); dividends may live structured in the `/v1/corporate-actions`
family we subscribe to — read its portal spec before building anything. Full-statement iXBRL
(ESEF-style) is voluntary in Israel since the 2021 annuals, mandate pending legislation. So
the structured-facts layer starts as an XBRL parser inside `ingestFiling()` + a
`publication_date` column — no LLM, no new pipeline, no rate-limit cost.
Full fact sheet: `../research/14-maya-structured-data.md`.
