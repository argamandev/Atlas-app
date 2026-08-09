# MAYA / TASE Data Hub — WORKING as of 2026-08-06

Everything below came from a live 200, a portal page, or a command. Nothing here is
inferred.

## Status: LIVE. The key works. The base URL was the whole problem.

| | |
|---|---|
| **Base URL** | **`https://datawise.tase.co.il`** |
| Auth | header **`apikey`** (not a bearer token) |
| Language | header **`Accept-Language: he-IL`** or `en-US` — **required, and it matters, see below** |
| Portal | <https://datahubapi.tase.co.il/> (account `sagi.arg@gmail.com`) — a **Kong** dev portal |
| App the working key belongs to | **"Atlas - second application"** — product **APPROVED**, requests now counting |
| App NOT to use | **"Atlas"** — its credential is the one literally named `MAYA_API_KEY`, and its product is still **PENDING** with **0 requests**. The *name* is a trap; the working value is the second app's. |
| Key in this repo | `MAYA_API_KEY` in `.env.local` (32 chars). Verified working 2026-08-06. Never printed, never committed. |
| Rate limit | 10 requests / 2 seconds, then HTTP 429 (from the guide) |

**Proof it is a real authenticated call and not a WAF page** — three different answers to
three different keys, which is the test the two blocked sessions could never produce:

| Request | Result |
|---|---|
| real key, `apikey` header | **200** `{"data":[{"financialReportTypeId":1,...}]}` |
| no key | **401** `{"message":"No API key found in request"}` |
| deliberately bogus key | **401** `{"message":"Unauthorized"}` |

The portal's own request counter went **0 → 10** during that session, with a 10% error
rate that is exactly the one 400 deliberately triggered. The counter is the arbiter, and
it has now moved.

## THE `Accept-Language` TRAP — `en-US` RETURNS `title: null`

This is not a cosmetic locale choice. The **English feed has no titles at all**; the
Hebrew feed carries the real ones. Same report, same request, only the header differs:

```
Accept-Language: he-IL   title: "מצגת משקיעים  - דוחות כספיים לרבעון הראשון של שנת 2026"
                         issuer: "תיגבור קבוצה"
                         events: 104:דוח רבעון 1 / 270:מצגת

Accept-Language: en-US   title: null
                         issuer: "TIGBUR GROUP"
                         events: 104:1st Quarter Report / 270:Presentation
```

⇒ **Atlas must always send `he-IL`.** Sending `en-US` produces a shelf of untitled files
and forces a title to be synthesised out of `events[].eventName`, which is a worse label
that the issuer never wrote. Atlas is Hebrew-first anyway; here it is also the only feed
that answers the question.

## Endpoints (all `GET`, all verified 200)

| Path | For Atlas |
|---|---|
| `/api/v2/market-announcements/companies-disclosures/by-issuer` | **the company's filing history — reports, presentations, everything** |
| `/api/v2/market-announcements/financial-report-schedule/by-schedule-date` | who reports on a date — the Calendar feed |
| `/api/v2/market-announcements/financial-report-schedule/by-report-year` | the same schedule keyed by report year |
| `/api/v2/market-announcements/financial-report-schedule/event-types` | lookup: `financialReportTypeId` / name |
| `/api/v2/market-announcements/financial-report-schedule/period-types` | lookup: `periodTypeId` / name |

### `by-issuer` parameters (read off the portal's own spec)

| Name | Required | Notes |
|---|---|---|
| `FromDate` | **yes** | `YYYY-MM-DD`. Omitting it is a 400 naming the field. |
| `ToDate` | **yes** | `YYYY-MM-DD` |
| `IssuerId` | **yes** | int 1–99999. **Not the security id** — see below. |
| `EventId` | no | filters to one event type, e.g. **270 = מצגת (Presentation)** |
| `Accept-Language` | **yes** (header) | `he-IL` / `en-US` |

Response row shape, verified against Tigbur:

```jsonc
{
  "publicationDate": "2026-05-27T11:27:00.52",
  "mayaReportId": 1744031,
  "isPriorityReport": false,
  "title": "מצגת משקיעים  - דוחות כספיים לרבעון הראשון של שנת 2026",
  "isCorrection": false,
  "url": "https://maya.tase.co.il/he/reports/1744031",
  "issuer": [{ "issuerId": 1460, "issuerName": "תיגבור קבוצה", "assosiated": false }],
  "events": [{ "eventId": 104, "eventName": "דוח רבעון 1" },
             { "eventId": 270, "eventName": "מצגת" }],
  "attachedFiles": [{ "url": "https://mayafiles.tase.co.il/rhtm/…/H1744031.htm" },
                    { "url": "https://mayafiles.tase.co.il/rpdf/…/P1744031-00.pdf" }]
}
```

Event ids seen so far: **270 מצגת** · 104 דוח רבעון 1 · 101 דוח תקופתי ושנתי ·
233 Conference Call · 113 Statements Release Date.

~~Treat this list as a sample, not the vocabulary — there is no endpoint for the full
disclosure-event table.~~ **CORRECTED 2026-08-09: that endpoint exists**, it is
`GET /v1/maya-reports-online/events/company` in version 1.0.0, and it returns all **227**
company event types. The sentence was true of the endpoints we could reach, and was written as
though it were true of MAYA — the same error, on the same day, as the sector/logo claim below.

## `IssuerId` is NOT `tase_security_id`, and we do not have it yet

`companies.tase_issuer_id` is **NULL for all four rows** (checked 2026-08-06). We hold
`tase_security_id` (Tigbur `1105022`, 7 digits); the API wants the issuer number
(Tigbur **1460**, 4 digits). They are unrelated numbering schemes.

The mapping is readable from the TASE market page for a security — the company links
on `market.tase.co.il/he/market_data/security/<securityId>/major_data` point at
`maya.tase.co.il/he/companies/<issuerId>`. **Backfilling `tase_issuer_id` is the first
task of any MAYA ingest**, and it is a per-company one-off, not a runtime lookup.

## Downloading the files — `mayafiles.tase.co.il`, public, no key

`attachedFiles[].url` points at `mayafiles.tase.co.il`. Those are **public**: no `apikey`,
no cookie, no browser user-agent needed. Verified by downloading Tigbur's Q1 2026
presentation — 2,316,801 bytes, `%PDF-1.7`, **41 pages**, first page
`מצגת לשוק ההון מאי 2026`, Hebrew extracting cleanly through the repo's own pdfjs.

Attachment mix across Tigbur's 45 filings for 2026: **37 `.htm`, 22 `.pdf`, 2 `.xbrl`**.
The `.htm` is the MAYA report wrapper; the `.pdf` is the document a person wants.

**⚠️ A 200 from mayafiles is not proof you got the file.** One fetch returned
**HTTP 200, `content-type: text/html`, 212 bytes** — a WAF interstitial wearing a `.pdf`
URL. Eight subsequent fetches of the same URL all returned the real PDF, so it is
intermittent and cold-start-ish, which is the dangerous kind. **Any ingest MUST validate
the `%PDF-` magic bytes and reject short bodies**, not trust the status code. This is the
same class as the 0-byte-PDF-pinned-by-cache incident in `.claude/rules/app.md`:
degradation must be visible, and a "successful" 212-byte report would be stored, cached,
and shown as a document.

## ⚠️ THE CATALOG HAS 41 PRODUCTS. WE ARE SUBSCRIBED TO ONE VERSION OF ONE OF THEM.

Filed 2026-08-09 after the founder refused a claim of mine. I had written, in four places,
that "MAYA publishes no sector / description / website / logo". **That was false, and the way
it was produced is the repo's oldest error: I probed guessed paths, read the failures as
absence, and never opened the catalogue that lists what exists.** The founder's objection was
simply "I can see the sector and the logo on the MAYA website, so the data exists" — which is
evidence, and my probes were not.

Read off the portal (`datahubapi.tase.co.il`, SSO, `sagi.arg@gmail.com`) on 2026-08-09:

| | |
|---|---|
| Products in the catalog | **41** |
| Products Atlas subscribes to | **1** — `Market Announcements feed - MAYA` |
| Apps | `Atlas` → **pending** · `Atlas - second application` → **approved 2026-08-05** |
| Version both registered against | **`Market Announcements feed - MAYA 2.0.0`** (`863643bf-…`) |

**That product has TWO versions, and they are different APIs, not a version bump.**

| Version | Path family | Endpoints |
|---|---|---|
| **2.0.0** ← ours | `/api/v2/market-announcements/…` | the 5 in the table above, and only those |
| **1.0.0** ← NOT ours | `/v1/maya-reports-online/…` + `/v1/corporate-actions/…` | **10**, including `company-details` |

### `GET /v1/maya-reports-online/company-details` — the endpoint the founder was right about

Summary in its own spec: *"general details about the companies listed on the Tel Aviv Stock
Exchange"*. Response `CompanyDetailsResponse.getCompanyDetails.result[]` carries
**`issuerId`, `issuerName`, `sector`, `address`, `website`**, plus phone and email.
`issuerId` is **`required: false`** — so one call with no parameter returns the whole list.

Two consequences, both large:

1. **`sector`, `website`, `address`, `phone`, `email` are a subscription away, not a scrape
   away.** Keyed on `issuerId`, which we already store for 233 of 234 companies.
2. **"MAYA publishes no company-directory endpoint" — the finding the whole calendar sync was
   designed around — is true only of version 2.0.0.** The one-call directory exists in 1.0.0.
   `scripts/maya-refresh-issuers.ts` spends ~230 requests (or ~2,600 with `--sweep`) building
   by hand what one request would return. It is not wrong, and it still works; it is just no
   longer the only way, and the sweep in particular should be reconsidered before it is run.

### ✅ REGISTERED AND VERIFIED — founder approved 1.0.0 on 2026-08-09, same day

The paragraph that stood here warned that the field list came from the spec rather than a live
200. It now comes from a live 200, and the response is **richer than the spec advertised**:

```
GET /v1/maya-reports-online/company-details      → 1,630 companies, 1.28 MB, ONE request
GET /v1/maya-reports-online/company-details?issuerId=1460   → just that issuer
```

| Field | Coverage across all 1,630 |
|---|---|
| `issuerId`, `issuerName`, `sector` | **1,630 / 1,630** — 67 distinct sectors |
| `website` | 1,005 (62%) |
| `about` | a real Hebrew business description, e.g. Tigbur: *"החברה עוסקת בשירותי כח-אדם וסיעוד…"* |
| `address`, `zip`, `phone`, `fax`, `email`, `incorporation` | present, not measured per-field |
| `securityIncludedIndices` | index membership **with weights** — `{securityId, indexCd, weight, factor}` |

Three things that follow, none of them small:

1. **`securityIncludedIndices` is a real source for the index chips** that were deleted from the
   company page on `feat/maya-calendar` as fabricated. They can come back as facts.
2. **1,630 companies arrive in one request.** `maya-refresh-issuers.ts --sweep` walks ~2,600 ids
   over ~9 minutes to find a strict subset of this. **Do not run the sweep; retire it.**
3. **`sector` is space-padded and hierarchical** — `"ריאלי-מסחר ושרותים-שרותים        "`. Trim it,
   and split on `-` for super-sector / sector / sub-sector (the same three levels the
   `Securities - Basic` product exposes as separate fields).

### The other nine endpoints in 1.0.0, probed the same day

| Path | What came back |
|---|---|
| `…/events/company` | **227 event types** — the full company disclosure vocabulary |
| `…/events/tase` | 44 exchange-notice types |
| `…/latest-companies-disclosures` | the 30 most recent filings, live |
| `/v1/corporate-actions/assembly/by-dates` | **500** with no parameters — it wants dates |

**Event ids that matter for the calendar**, now read from the vocabulary rather than sampled:
`233 שיחת ועידה` · `108 שיחות ועידה` (plural — a distinct code) · `270 מצגת` ·
**`271 אירועי משקיעים` ("investor events")**, which is the most likely structured home of the
webinars the calendar still lacks. **What it does NOT yet establish is whether a webinar's DATE
is structured or lives in the announcement's Hebrew prose — that is the first question of the
webinar slice, and it decides whether that slice is plumbing or extraction.**

### The three-way probe result, which is the reusable part

Guessing paths against `datawise.tase.co.il` cannot tell you whether an endpoint exists,
because two different systems answer:

| Request | Answer | What it proves |
|---|---|---|
| `/api/v1/basic-securities/companies-list` | **F5 WAF**, `text/html`, "Request Rejected … support ID" | nothing — the gateway was never reached |
| `/v1/maya-reports-online/company-details` | **Kong**, `application/json`, `{"message":"You cannot consume this service","request_id":…}` | the route EXISTS, our key reached it, we are not subscribed |
| `/api/v2/market-announcements/…` | `200` + data | subscribed |

The WAF answer is the trap: it is indistinguishable from "no such thing" unless you already
know the right prefix. **A path list is configuration. Read it from the portal's spec, never
deduce it** — the same sentence this file already carries about the base URL, which did not
stop me from repeating the mistake one level down.

## Company logos — SOLVED, public, no key, no subscription

`https://mayafiles.tase.co.il/logos/he-IL/{issuerId padded to 6}.jpg` — e.g. issuer 1460 →
`…/logos/he-IL/001460.jpg`. Same public host as the filing attachments. Found by reading the
`<img>` sources on MAYA's own home page and pairing them with each row's `/he/companies/{id}`
link, so the id in the filename is confirmed to be `issuerId`, not a security id.

**Measured 2026-08-09 against all 233 companies in our DB that carry a `tase_issuer_id`:**

| | |
|---|---|
| real, distinct logo | **220** (94%) — 219 JPEG + 1 PNG |
| generic placeholder | 13 — one byte-identical 2,037-byte PNG shared by all 13 |
| HTTP not-200 | **0** |

Three traps for whoever ingests these:

- **The content-type lies.** Issuer 2356 is served `content-type: image/jpeg` and is a PNG.
  Sniff magic bytes (`ffd8ff` / `89504e47`), never trust the header or the `.jpg` extension.
- **A 200 is not a logo.** There are TWO distinct placeholders: `000000.jpg` (2,325-byte JPEG,
  what MAYA uses for non-company rows like exchange notices) and the 2,037-byte PNG above.
  Hash-compare against both, or 13 companies get a meaningless grey square presented as their
  identity — the "degradation must be visible" rule in `.claude/rules/app.md`.
- Re-fetched 3× each: byte-identical every time, so these are stable absences and **not** the
  intermittent WAF interstitial documented above. Do not conflate the two.

## What the two blocked sessions got wrong, so it is not repeated

The base URL was assumed to be `https://openapigw.tase.co.il/tase/prod` — TASE's published
base for its *other* products — and every probe went there. It answers Imperva **503** to
everything, with a real key, a bogus key, or no key. Seven hostnames were tried across two
sessions; `datawise.tase.co.il` was never among them, because nothing outside the portal
names it. The guide PDF was extracted in full (9 pages) specifically to settle the base URL
and **contains no hostname at all**.

Two readings were carried as live hypotheses and **both were wrong**: "the WAF blocks
non-browser clients" (refuted by the founder's own Chrome getting the same 503) and "the
subscription is not provisioned" (the 503-vs-403 split was read as evidence for it; the
product had in fact been APPROVED on the second app all along).

**The lesson, and it is the one this repo keeps filing in other forms:** the base URL is
configuration, and configuration is read from the system that issues it, not deduced. Two
sessions of probing could not produce what one look at the portal's `Servers` dropdown
gave in a minute. The founder had said "the key was approved" and that was true — the
disbelief was aimed at the wrong component, because a 503 was allowed to stand in for
evidence about a key it never reached.

Practical corollary for this portal specifically: it is **Kong**, and the server list lives
in a `KONG-SWAGGER-UI` **shadow root**, so `document.body.innerText` does not contain it and
a page-text scrape returns nothing. Walk `el.shadowRoot` to read it.

## Where it goes in Atlas

Decided 2026-08-01 (`agent-memory/cross-cutting.md`): **MAYA reports become
`company_documents`** — no new parallel tables. Company data is shared corpus, not per-user
(`docs/DATA-MODEL.md`). The intake path that will read the catalog is flagged in
`src/lib/workspace/intake/corpus.ts`; the ingest core a MAYA auto-fetch should reuse is
`src/lib/documents/ingest.ts`.

The `financial-report-schedule` endpoints are the Calendar feed: it currently shows
`scheduled_calls` only, and "who reports when" is exactly this data.

## Repro

Scripts used for the verification above live in the session scratchpad and are disposable;
the method is what matters. Load `.env.local` through `@next/env`, print variable NAMES and
lengths only, and redact the key out of every response body before printing.
**Never let a secret value into a transcript, a log, or a commit.**
