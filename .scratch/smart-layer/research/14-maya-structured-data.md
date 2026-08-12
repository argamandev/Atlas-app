# MAYA structured data — what the TASE Data Hub already provides

Ticket: `.scratch/smart-layer/issues/14-maya-structured-data.md` · Written: 2026-08-12
Status: research complete

**How this was researched.** Live READ-ONLY probes against `datawise.tase.co.il` on 2026-08-12
(~15 requests, sequential, ≥300ms apart, `Accept-Language: he-IL`, key loaded from `.env.local`
and redacted from all output), plus two `.xbrl` downloads from the public `mayafiles.tase.co.il`
host. Base facts corroborated against `docs/MAYA-API.md` and
`docs/product/2026-08-09-documents-catalog-findings.md`. XBRL-ecosystem claims come from
web-searched primary/secondary sources, cited inline; anything not seen in a live response or an
owning source is marked **[unverified]**.

---

## 1. The headline: quarterly and annual reports ALREADY CARRY an XBRL instance with the core financials

Every probe result below is from a live 200 on 2026-08-12.

The v2 `by-issuer` catalog rows for actual financial reports (events 101/104/105/106) include an
`attachedFiles[]` entry ending `.xbrl`, hosted on the **public** file host (no API key):

```
https://mayafiles.tase.co.il/xbrl/1744001-1745000/X1744027.xbrl   ← X{mayaReportId}.xbrl
```

Downloaded and parsed two (Tigbur Q1 2026, 18.9 KB · Tigbur FY 2025, 20.5 KB). Both are real
XBRL instance documents — taxonomies `ifrs-full` (IFRS 2015-03-11) + **`ifrs-il`
(`http://xbrl.isa.gov.il/taxonomy/2017-07-15/ifrs-il`)**, ISA's own taxonomy. This is ISA/MAGNA
form **ת930** — the structured summary that accompanies every financial statement filed through
MAGNA, redistributed by MAYA as an attachment.

**26 financial facts, identical set in both files, unit ILS:**

| Class | Concepts (all `ifrs-full:`) |
|---|---|
| P&L | `Revenue`, `GrossProfit`, `ProfitLossFromOperatingActivities`, `ProfitLossBeforeTax`, `ProfitLoss` (+ owners/NCI split), `BasicEarningsLossPerShare`, `DilutedEarningsLossPerShare`, `ComprehensiveIncome` (+ split) |
| Balance sheet | `Assets`, `CurrentAssets`, `NoncurrentAssets`, `Liabilities`, `CurrentLiabilities`, `NoncurrentLiabilities`, `Equity`, `EquityAttributableToOwnersOfParent`, `NoncontrollingInterests`, `EquityAndLiabilities` |
| Cash flow | operating / investing / financing totals, FX effect on cash |

Verified values line up as real figures (Tigbur FY2025: Revenue 1,507,432,000 ILS; Q1 2026:
358,700,000). Contexts are exact periods: balance sheet `@2026-03-31`, P&L/CF
`2026-01-01..2026-03-31`. **Current period only — no comparatives in the instance.**

The `ifrs-il` fields are a second gift: filing metadata as data — MAGNA reference number
(`2026-01-049051`), `ReportReceiptTime` (to the second, with offset), auditing firm name,
`UnqualifiedReview: true/false`, signatory names/roles, signing dates, report period as a field.

### Coverage — measured, not assumed

| Issuer, year | Financial-report filings | with `.xbrl` |
|---|---|---|
| Tigbur (1460), 2026 | 2 (Q1 + FY2025) | **2** |
| Tigbur, 2018 | 9 | 4 (the actual reports; the rest are call/schedule announcements sharing the event ids) |
| Tigbur, 2012 | 11 | **0** — depth ends somewhere between 2012 and 2018 |
| מיכפל (2511), 2025 | 3 | 1 (the one actual report; other two were a call notice + liabilities statement) |
| ICL (281), 2025 | 14 | **0** — dual-listed, reports via 20-F/6-K "תרגום נוחות" filings |

Two consequences: (a) an "event 104/105/106/101" filter overcounts actual reports — the `.xbrl`
attachment itself is the reliable marker of a real financial-statement filing; (b) **foreign-track
dual-listed issuers (ICL-shaped) have no ISA XBRL** — their financials are only in PDFs.
How many of our 234 companies are foreign-track is unmeasured **[unverified — count it before
relying on XBRL coverage]**.

---

## 2. The publication-date answer: MAYA gives it on every filing — this is plumbing, not extraction

`by-issuer` (v2, subscribed, verified 200) returns per filing:

```
publicationDate  "2026-05-27T11:27:00.52"   ← to the sub-second, every row
mayaReportId, title, isCorrection, isPriorityReport, url,
issuer[{issuerId, issuerName}], events[{eventId, eventName}], attachedFiles[{url}]
```

`src/lib/maya/filings.ts` (`toRemoteSources`) already carries this as `publishedISO`; it is
dropped at the `company_documents` door because the table has no column. So "no publication date"
is a schema gap on our side, not missing data — an additive `ADD COLUMN` plus carrying the value
through `ingestFiling()` closes it. The XBRL's `ReportReceiptTime` is a second, independent source
for the same instant.

## 3. What else already arrives structured (all verified live 2026-08-12 unless noted)

- **Report schedule** — `financial-report-schedule/by-report-year?Year=2026` → 580 rows of
  `{scheduledDate, scheduledTime, timeZone, financialReportTypeId (1 call / 2 publication),
  periodTypeId (1–4 = Q1/Q2/Q3/FY), issuerId, year, url}`. Already consumed by the calendar sync.
  `by-schedule-date` is subscribed (Kong answers problem+json) but my param guesses got a 400;
  exact param name unprobed — read it off the portal spec **[unverified]**.
- **Company profile** — `/v1/maya-reports-online/company-details` (subscribed since 2026-08-09):
  `sector` (hierarchical, space-padded), `about` (Hebrew business description), `website`,
  address/phone/email/fax/zip, `incorporation`, and `securityIncludedIndices`
  `{securityId, indexCd, weight, factor}` — index membership **with weights**. 1,630 companies in
  one request.
- **Event vocabulary** — 227 company disclosure event types (`/v1/…/events/company`, per
  `docs/MAYA-API.md` 2026-08-09) — a controlled vocabulary for filing classification; no NLP
  needed to know a filing is a dividend notice, buyback, offering, etc.
- **Live filings feed** — `/v1/maya-reports-online/latest-companies-disclosures`: 30 most recent
  filings market-wide, same row shape (note v1 spells `attachedfiles` lowercase and fixes
  `assosiated`→`associated` — the two versions differ at the field level).

**Probe trap worth keeping:** an unknown query-param name (`ReportYear` instead of `Year`) on a
subscribed v2 endpoint returns an **Incapsula 403 HTML page**, indistinguishable from "no such
endpoint". Same lesson as `docs/MAYA-API.md`'s three-way probe table: params are configuration,
read them from the portal spec.

## 4. What does NOT exist structured (in anything we subscribe to)

- **EBITDA** — not an IFRS concept; absent from the XBRL (grep confirmed zero mentions). Lives
  only in PDF prose/presentations. Same for any non-GAAP metric (adjusted EBITDA, FFO, guidance).
- **Dividend per share** — no dividend concept in the ת930 instance. Dividend *announcements* are
  separate MAYA filings with their own event codes, but the amount there is title prose. The
  version-1.0.0 spec family we're subscribed to includes `/v1/corporate-actions/…` (only
  `assembly/by-dates` probed, 2026-08-09, 500 without params) — **corporate-actions may expose
  dividends as fields; read its portal spec before building any dividend extraction [unverified]**.
- **Comparatives, segments, full statement line items** — the XBRL is a 26-fact summary, current
  period only. Anything below the totals (revenue by segment, opex breakdown, backlog) is
  PDF-only today.
- **A fundamentals/ratios product** — the Data Hub catalog has 41 products and we have read the
  specs of one; public marketing lists market data, indices, Smart Money, announcements — no
  fundamentals product named ([TASE Data Services](https://www.tase.co.il/en/content/products_lobby/data_services),
  [PR Newswire launch note](https://www.prnewswire.com/news-releases/tase-data-hub-the-tase-data-hub-301135641.html)).
  A catalog read on the portal (SSO, founder's account) is the cheap way to close this
  **[unverified — portal check open]**.

## 5. The XBRL/ESEF ecosystem answer

- ISA has run XBRL through MAGNA for years: filers submit HTML/PDF and the ISA background system
  converts to XBRL/XML/Excel against an IFRS-based taxonomy
  ([IFRS Foundation Israel filing profile, 2018](https://www.ifrs.org/content/dam/ifrs/publications/jurisdictions/filing-profiles/israel-28-february-2018.pdf)).
  The `ifrs-il 2017-07-15` taxonomy in our downloaded instances is this program's artifact — and
  MAYA redistributes the result as the `.xbrl` attachment we can fetch today.
- **Full-statement Inline XBRL (ESEF-style) is in transition, not yet mandatory.** Voluntary
  iXBRL filing opened for 2021 annual reports; the first nine Israeli iXBRL reports appeared on
  MAGNA in July 2022 ([xbrl.org, 2022-07-29](https://www.xbrl.org/news/first-reports-available-as-israel-gets-into-the-swing-of-inline-xbrl/)).
  A mandate requires legislation and had no date as of the sources found; ISA was still running
  voluntary-phase calls in 2025 ([ISA קול קורא iXBRL 2025](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic/al_lobby/al_lobby-6253f4f00241c/iXBRLCall25.pdf);
  [Herzog, 2022-01-05](https://herzoglaw.co.il/he/news-and-insights/ixbrl-%D7%A8%D7%A9%D7%95%D7%AA-%D7%A0%D7%99%D7%99%D7%A8%D7%95%D7%AA-%D7%A2%D7%A8%D7%9A-%D7%A4%D7%A8%D7%A1%D7%9E%D7%94-%D7%A2%D7%93%D7%9B%D7%95%D7%9F-%D7%91%D7%A0%D7%95%D7%92%D7%A2-%D7%9C%D7%9E%D7%A2/)).
  Per ISA's 2023 update, a query system over the tagged financial-data repository exists on the
  ISA side ([ISA iXBRL update, Feb 2023](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic/al_lobby/al_lobby-63c5442fc580d/IXBRL042023.pdf))
  — whether it is programmatically consumable by us is **[unverified]**.
- Net: when the iXBRL mandate lands, full statements become machine-readable at the line level.
  Until then, the deterministic machine-readable layer for TASE issuers is the 26-fact ת930
  summary — which MAYA already hands us per filing, for free.

## 6. Consequences for the structured-facts layer — extract vs fetch, per fact class

| Fact class | Verdict | Why |
|---|---|---|
| Revenue, gross/operating/pre-tax/net profit, EPS, comprehensive income, BS totals, CF totals | **FETCH** — parse the `.xbrl` attachment at ingest | Deterministic XML from the regulator's own pipeline; public host, no rate-limit cost; keyed by `mayaReportId`; kills the W5 extraction-corruption risk for exactly the "known repeated numerics" of the founder's ticket-07 amendment |
| Publication date / filing metadata | **FETCH** — already in every `by-issuer` row (`publishedISO` in `toRemoteSources`); add the additive column | Schema gap, not a data gap |
| Auditor, review qualification, signing dates | **FETCH** — `ifrs-il` fields in the same instance | Nice-to-have facts for grounding, zero extra cost |
| EBITDA, adjusted metrics, guidance, segments, backlog | **EXTRACT** (ours) | Only exist in PDF prose/tables; this is the *residual* scope of Hebrew table extraction — much smaller than "extract the financials" |
| Dividends | **HOLD** — read the `/v1/corporate-actions` portal spec first | May already be structured in a family we subscribe to; building extraction before that read would repeat the sector/logo mistake |
| Sector, description, website, index weights | **FETCH** (already shipped via `company-details`) | — |
| Report/call schedule | **FETCH** (already shipped via schedule endpoints) | — |
| Dual-listed foreign-track issuers (ICL-shaped) | **EXTRACT or exclude, per-issuer flag** | No ISA XBRL exists for them; any structured-facts promise must say so visibly rather than silently returning nothing |

**Build-order implication for ticket 08:** the structured-facts lookup layer starts as an XBRL
attachment parser inside the existing `ingestFiling()` path plus one additive
`publication_date` column — no new extraction pipeline, no LLM, no rate-limit budget. Hebrew
table extraction is deferred to the residual classes (EBITDA/segments/non-GAAP) and to
foreign-track issuers, and can be judged as its own smaller project against measured need.

**Ingest guards owed** (same class as `docs/MAYA-API.md`'s WAF-interstitial law): validate the
`.xbrl` body is XML (BOM + `<?xml`, measured magic `efbbbf3c`), not a 200 HTML page; treat a
missing 26-fact set as "no structured facts", never as zeros.
