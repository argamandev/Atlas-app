# The documents catalog — measured findings for a deferred slice

**Filed 2026-08-09 by Lane M (multiview). DEFERRED by founder decision the same day: it gets its
own session, after the smart-chat-layer brainstorm.** Nothing here is built. Everything here is
measured — the numbers come from a live probe against MAYA and the live database, not from
another document.

Read this before planning the slice. It exists because the first estimate given to the founder
was wrong in both directions, and the corrections are the useful part.

---

## What the founder asked for, in his words and shape

A **documents section on the company profile**, drilling down three levels:

1. **Years** — 2025, 2024, 2023 … and *only* years this company actually filed in.
2. Open a year → **quarters**.
3. Open a quarter → **the artifacts as icons**: the report, the slide deck, and the transcript
   *if one exists*. No transcript ⇒ that icon is simply absent.
4. Click any icon → the **same exact page** used for a call hosted on Atlas
   (`LiveTranscriptView`), opened in **Multi**: report and deck side by side, transcript pane too
   when we have one, with speakers. Ask Atlas works there as it already does.

Founder's framing: *"closing the loop"* — Atlas shows you the call live, and Atlas shows you
Q2 2023 as a throwback, through one screen. He asked for it **fast and clean**.

**There is no Q4.** Israeli issuers file Q1, Q2 and Q3, then an **annual report**
(דוח תקופתי ושנתי) covering the fourth quarter and the full year. MAYA's event codes work exactly
this way (`PERIOD_BY_EVENT` in `lib/maya/events.ts` = `{101:'FY', 104:'Q1', 105:'Q2', 106:'Q3'}`).
A year opens to **Q1 · Q2 · Q3 · Annual**, not Q1–Q4. The founder said "Q4" and was told
otherwise; this is a property of the data, not a design choice.

---

## Correction 1 — this is NOT blocked on a migration

Stated to the founder on 2026-08-09 morning: *"blocked on schema — `company_documents` has no
publication-date column."* **That was about sorting filings by exact date. It is not what this
feature needs.**

`company_documents.quarter` is text already holding `"FY 2024"`, `"Q1 2025"`, `"FY 2015"`, and
`CompanyView` already has a `yearOf()` helper that reads the year out of it. **Year and quarter
bucketing need no new column.**

The publication-date column remains worth having for ordering *within* a period — it is simply
not a prerequisite, and the slice can start without it.

## Correction 2 — no bulk sync and no catalog table either (founder's idea, and he was right)

The founder asked: *"can't we just do fetch on demand, like we do with the PDFs in workspace?"*
**Yes, and it is literally the same code.**

- `listDisclosures({issuerId, fromYear, toYear})` — `src/lib/maya/disclosures.ts` — returns one
  issuer's whole filing catalog live from MAYA. Windows the request per year because MAYA refuses
  a range wider than a year, and assembles the result.
- `toRemoteSources()` — `src/lib/maya/filings.ts` — maps filings to
  `{sourceId, docType:'report'|'slides', period, pdfUrl, publishedISO, title}`, dropping anything
  with no whitelisted event or no PDF.
- `ingestFiling()` — `src/lib/maya/ingestFiling.ts` — fetches and stores ONE filing on demand.
  This is what Workspace already calls when an analyst picks a PDF.

So the Reports tab lists **live from MAYA**, and a PDF is stored only when a user opens it. The
"few days of catalog sync" in the first estimate was unnecessary.

## Correction 3 — investor presentations already work, and they are common

`EVENT_PRESENTATION = 270` (מצגת) was already a known event id, already in `DOCUMENT_EVENT_IDS`,
already mapped to `docType: 'slides'` by `docTypeFor()`. Presentation wins over report when a
filing carries both, deliberately.

**Live probe, 2026-08-09** — 15 companies sampled evenly across the alphabet from the 233 carrying
a `tase_issuer_id`, years 2023–2026, via `listDisclosures` → `toRemoteSources`:

| measure | result |
|---|---|
| reports | **272** |
| presentations | **131** |
| companies with ≥1 presentation | **14 of 15** (only בירמן had none) |
| periods carrying BOTH a report and a deck | **76** |
| catalog fetch, 4 years, one company | **~1.6 s** (avg 1610ms) |

Examples: גילת טלקום 16 report / 17 slides · מזרחי טפחות 29/15 · הולמס פלייס 33/14 · אפקון 25/14 ·
טאואר 38/1 · בירמן 7/0. Coverage reached back to 2022 for 13 of 15 (a 2022 annual report is
published in 2023).

Note the filtering ratio: אאורה returns **623 raw filings** of which **38 are usable**. That is the
founder's 2026-08-06 "analyst-relevant kinds only" decision working, not data loss.

**A simplification this uncovers:** presentations arrive as PDFs, same as reports. The Slides pane
needs no new machinery — it is the existing `PdfViewer` pointed at a different file.

---

## What already exists in the UI (more than expected)

`src/components/company/CompanyView.tsx`:

- The **Reports tab already groups quarters by year, newest first** (`byYear`, built at :101).
- Each row **already renders three artifact buttons** — transcript, report PDF, slides
  (`artifactBtn` at :109, used at :356-363). The design anticipated exactly the three artifacts
  the founder named.
- The **transcript button already links** to `/app/live/${t.id}` — the finished-call multiview.

## What is actually missing

1. **`artifactBtn('pdf', …, null)` and `artifactBtn('sl', …, null)`** — both hardcoded `null`, so
   they render as dashed disabled tiles. Two of three artifacts are dead affordances today.
2. **Rows are built from `transcripts` only** (`groupByQuarter(transcripts)`), so a period with a
   report but no transcript produces **no row at all** — the exact opposite of the requirement.
   The list must come from the MAYA catalog, merged with the transcripts we hold.
3. **No route for a period without a transcript.** `/app/app/live/[id]/page.tsx` keys on a
   transcript id via `loadCompletedCall(params.id)`. A 2024 period holding a report and a deck has
   no id to link to. This is the one genuinely new piece of plumbing.
4. **The Slides pane is fabricated.** `SlidesPane` calls `slideStubs()` **unconditionally**
   (`FacetPanes.tsx:103`) — four invented Hebrew slides about אפגלו's ownership and Qatari/Saudi
   sovereign wealth funds, shown for every call of every company. `reportStub()` is its sibling and
   is the filed FINDING 2026-07-17 (`rules/app.md`: a failed `/api/documents` fetch falls back to
   it silently). **Both get deleted by this slice, not replaced.** Sending a user to invented
   content on a real issuer's page is the founder's stated intolerable class, now on a live host.
5. **Ingest is not instant.** Download + per-page text extraction takes seconds (Tigbur's annual is
   2.3 MB). The UI needs an honest "fetching this from MAYA" state; a spinner that completes before
   the file arrives is the lying-UI class.

## The current data floor, so nobody plans against a fantasy

Measured against the live DB 2026-08-09:

- `company_documents`: **12 rows across 3 companies** (of 234), every one `doc_type='report'`,
  **zero presentations**. They got there one at a time via Workspace pulls.
- `transcripts`: **60 rows, only 2 companies linked**, 55 with `company_id` null.

This is *why* on-demand listing matters: the stored corpus is nearly empty, but the MAYA catalog
behind it is not.

---

## Two real constraints for whoever plans this

**A. The rate limit is the binding one.** 10 requests / 2 seconds is **ONE budget for our whole
key** — every user, every consumer (`lib/maya/client.ts` is the single chokepoint, and says so).
Listing 4 years for one company costs **4–5 requests**, so two analysts browsing company pages
simultaneously will collide, as will any background sync. **This is the recorded trigger for the
priority queue deferred on 2026-08-06.** Cheapest mitigation, and it belongs inside this slice
rather than after it: cache a company's catalog listing for a few minutes so a second visitor pays
nothing.

**B. The upsert key genuinely collides for presentations — and the fix is not ours to choose.**
`company_documents` has `unique (company_id, quarter, doc_type)` from migration 012, and
`ingestDocument()` upserts on exactly that (`lib/documents/ingest.ts:79`). Storage paths are keyed
by `mayaReportId` so *bytes* never collide — but **rows do**.

The sharp edge: `periodFor()` returns a period prefix only for the four report events. A
presentation tagged **only** with event 270 gets no prefix, so its period is the **bare year**
(`"2025"`). Every standalone deck a company files in one year therefore maps to
`(company, "2025", "slides")` — **one row survives**. Symptom: open deck A, come back later, get
deck B. Silent wrong content.

Listing is unaffected (that comes live from MAYA where each filing carries its own
`mayaReportId`); this only bites what we keep after a click.

**Why it is escalated rather than solved here:** widening the key means removing a UNIQUE
constraint on a table in the database shared with production Timlul. `DROP CONSTRAINT` is
destructive, hook-blocked on both doors, and `rules/db.md` sends that class to the supervisor and
founder before anything is written. Do not design around it unilaterally, and do not "fix" it by
making the `quarter` label uglier — that pollutes what the user reads.

**Not yet measured, and it should be before designing the fix:** how often a single company files
2+ decks that map to the same period label. The probe counted periods carrying both a report and a
deck (76), not periods carrying two decks.

---

## Shape and size

Estimated **2–3 days**, not the half-hour the founder hoped for and not the week first quoted. The
drill-down UI is roughly half a day because the year grouping and the icons already exist; the
weight is in the live listing, the honest loading states, and the second entrance to the viewer.

Founder decisions already taken:
- **Opens in Multi**, not Single — it shows immediately that two documents exist, and it is the
  view that distinguishes Atlas from downloading a PDF off MAYA.
- Same `LiveTranscriptView`, not a lookalike.
- Deferred to its own session; **brainstorm → spec → plan before code**.
