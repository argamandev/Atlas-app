# MAYA filings at scale — growing the searchable filing corpus

Type: grilling
Status: resolved
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

## Answer

**Resolved 2026-08-13.** Grilled as four recommendations; founder approved all four in one
round: *"Okay I approve everything do it."* A live MAYA volume probe (4 issuers, calendar
2025) ran alongside and CONFIRMS the scope call — measured facts below.

**The four decisions:**

1. **Scope: periodic financial reports + investor presentations (מצגות).** Immediate
   disclosures stay OUT — backfill and ongoing — until a measured need says otherwise.
   Probe validation: immediate disclosures are 85–95% of all filing rows (small/mid-caps
   file ~50–60 rows/yr, Phoenix 315 — of which 74 were dormant-share notices alone);
   reports + presentations ≈ 10–15 documents/company/year, exactly the analyst-quoted
   material the discovery eval cases were answered from.
2. **Backfill depth: 3 years back** (the Mid scenario ≈ 346K pages, ≈ $19–39 one-time
   embeddings, ≈ 2.1GB pgvector). Additive — deepening later is an extension, not a rebuild.
3. **Ongoing trigger, layered:** poll `latest-companies-disclosures` every ~10 minutes
   (one request under the global limiter — a filing published at 09:00 is searchable
   ~09:15) **plus** a nightly per-company `by-issuer` sweep as the coverage guarantee
   (earnings-season bursts can outrun a 30-row feed). Both invoke the ingestion standard's
   birth sequence; identity keys make a sweep and a user click racing on one filing
   converge on one row.
4. **Extraction: plain text now (≈ $0); LLM per-page blurbs are NOT purchased until the
   standing harness measures their retrieval gain** on the existing corpus
   (measure-before-paying). W5-garbled pages ingest and are flagged visibly, never
   silently dropped; hybrid retrieval was chosen partly because dense survives garble.

**Measured implementation facts the spec (ticket 10) must carry** (probe, 2026-08-13,
4 MAYA GETs; script at the jobs tmp dir, params verbatim from `src/lib/maya/config.ts`):

- **Detect "real financial statement" by event ids 101/104/105/106, never by `.xbrl`
  attachment presence** — dual-listed/foreign-track issuers (ICL: 61 filings, 0 xbrl,
  files 6-K/8-K under event 231) have NO ISA XBRL; they still ingest as PDFs with a
  visible "no structured facts" flag (per the ingestion standard §6). Event-id filters
  overcount (corrections, board approvals share the ids) — dedup/corrections handling
  rides on `mayaReportId` identity + `isCorrection`.
- **Many rows carry no PDF at all** (Tigbur: only 26% of rows have one; most rows' sole
  attachment is the `.htm` MAYA wrapper). Fine for this scope — actual reports and
  presentations do carry PDFs — but a future "full filing history" surface would need
  `.htm` extraction; `src/lib/maya/filings.ts`'s PDF-only assumption is a scope
  boundary, not a bug.
- **A full-market ingest would want an event-id DENYLIST** (mechanical classes like
  מניות רדומות can be a quarter of a large issuer's rows) — noted for the day immediate
  disclosures are revisited; irrelevant to the approved scope.
- Market-wide planning number: ~35–50K filings/year across equity issuers; the approved
  scope is ~2,300–3,500 docs/year market-wide ongoing (≈ negligible cost, $1–7/mo holds).

**Costs into tickets 09/10:** one-time ≈ $19 (batch) – $39; ongoing ≈ $1–7/mo; both far
under the proposed ≤ $500 one-time ceiling. The blurbs line ($208 Mid) is spent only
after a measured yes.

Freshness surfaces via `publication_date` (standard §6). Execution — the sweep, the
poller, the backfill — is build work sequenced by the spec, outside this map.
