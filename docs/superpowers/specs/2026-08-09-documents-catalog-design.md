# The documents catalog — design spec

**Branch:** `feat/documents-catalog` (Lane M, off main `9fbd475`)
**Brainstormed with the founder 2026-08-09.** Supersedes the shape proposed in
`docs/product/2026-08-09-documents-catalog-findings.md` where the two disagree — that document's
*measurements* stand and are re-used here; two of its design assumptions were corrected by the
founder during this brainstorm and by probes run the same evening.

**Founder's framing, verbatim:** *"this will just close the loop as a user experience"* — every
user can reach every document he would like to see, in a good experience. And the tiebreaker for
the whole chapter, also his: *"the goal actually is to create the best possible user experience
for our users"* — the corpus is a by-product of people using Atlas, never the objective.

---

## The goal, in one line

A company's documents section lists the years that company filed in; a year opens to its periods;
a period opens to its artifacts; clicking one lands in the **same viewer Atlas uses for a live
call**, with Ask Atlas, the snipping tools, Multi/Single and a way back.

## Hard boundary, set by the supervisor and honoured throughout

**NO NEW TABLE AND NO NEW COLUMN.** The catalog lists live from MAYA (`listDisclosures`) and
stores one PDF when a user opens it (`ingestFiling` → `company_documents`), which is the path
Workspace already runs. If a step here appears to need schema, it stops and asks — the database is
shared with production Timlul under an additive-only law, and schema belongs to tomorrow's agent
brainstorm.

---

## What was measured for this spec (2026-08-09, live MAYA + live DB)

All numbers below come from probes run this evening, not from another document.

| measure | result |
|---|---|
| sample | 20 issuers, evenly spaced across the 233 carrying a `tase_issuer_id`, years 2022–2026 |
| filings surviving `toRemoteSources` | **814** (519 report · 295 slides) |
| of those, scheduling **announcements** (carry event `113`) | **80** — 100% announcements, 0 presentations |
| distinct `(period, docType)` keys | 556 · **191 hold more than one filing** |
| after excluding announcements | 734 filings · 551 keys · **137 still hold more than one** |
| decks whose period is a **bare year** (no quarter/FY) | **115 of 295** |
| open a document: download + per-page text extraction | **82 ms – 2.3 s** (10 real filings, 9–139 pages, up to 17.7 MB) |
| MAYA date-window limit | **hard 1 year**, confirmed: a 2-year, 5-year, 16-year and 26-year request all return `"The date range cannot exceed 1 year."`, and an `EventId` filter does not lift it |
| `company-details` fields, all 1,631 companies | `securityIncludedIndices, issuerId, zip, email, phone, fax, issuerName, about, sector, address, website, incorporation` — **no listing date**; `incorporation` is a country (`"ישראל"`), not a date |

**What the remaining 137 multi-filing keys actually are** — every case is legitimate, which is why
none of them is treated as an error:

| kind | example |
|---|---|
| Hebrew **and** English of one report | אלוני חץ Q1 2026 — `"דוח רבעון 1 לשנת 2026"` + `"Board of Directors Report & Consolidated Financial Statements"` |
| a correction | סלקום — `"דוח רבעון 1 לשנת 2026 - תיקון דוח"` |
| several standalone decks in one year | דנאל 2023 — four: March, May, August, November |
| dual-listed extras | ביוליין — `20F` beside `"תוצאות כספיות"` |

---

## The flow, as the founder described it

```
Company page → Documents tab
  2026  2025  2024  2023 …            ← years, listed. Nothing fetched yet.
   └ click 2025 → fetch that year
       Q1 2025   Q2 2025   Q3 2025   Annual 2025
        └ click Annual → its artifacts
            📄 report    📊 presentation    🎙 transcript (only if we have one)
             └ click → THE VIEWER
```

**The viewer is the existing `LiveTranscriptView`**, not a lookalike: Ask Atlas top-right, the
snipping tools, Multi/Single, and back at the top-left returning to **the documents tab with the
same year and period still open**.

**There is no Q4.** Israeli issuers file Q1, Q2, Q3 and then an annual report covering the fourth
quarter and the full year; MAYA's event codes are built exactly that way
(`PERIOD_BY_EVENT = {101:'FY', 104:'Q1', 105:'Q2', 106:'Q3'}`). A year opens to
**Q1 · Q2 · Q3 · Annual**.

---

## Scope

### In

1. The company page's Reports tab becomes the **documents catalog**, fed from MAYA.
2. Three levels of drill-down: years → periods → artifacts.
3. Three artifacts per period: **report PDF · presentation · transcript when one exists**.
4. A second entrance to the viewer, for a period Atlas holds no transcript for.
5. On-demand fetch + store of a PDF when a user opens it.
6. Deletion of `slideStubs()` and `reportStub()`.
7. `src/lib/transcripts.ts:33` — the UTC-day bug filed at the israel-time merge, because the date
   it renders wrong is the date on these very rows.

### Out — the founder's "later" bucket, named so nobody has to guess

Announcements · webinars · **standalone company presentations with no period** (115 of 295 decks —
`"מצגת שוק ההון"` filed outside a reporting cycle) · English duplicate versions · dual-listed
extras like a 20-F. And no schema of any kind.

---

## 1 · The catalog

### Years are listed, not fetched

MAYA refuses any window wider than a year (measured above, four ways), so discovering *which* years
a company filed in costs one request per year — there is no cheap coverage query, and
`company-details` carries no listing date to bound the list with. **Therefore the year list is UI
only and nothing is fetched until a year is clicked**, which is the founder's own model:

> *"We are literally just presenting them the years they would like to click through in our UI and
> we fetch on demand."*

Years run from the current year back to **2015** — the oldest period label already present in
`company_documents` (`"FY 2015"`). The floor is a display choice with no data cost; a year holding
nothing says so plainly.

### Opening a year costs one request, usually

`listDisclosures({issuerId, fromYear: Y, toYear: Y})` windows to `Y` **and** `Y+1`, because a
fiscal-year report for Y is published in March of Y+1. Both windows are cached per company+year, so
walking down the years costs **one new request per year after the first**. The newest year opens
automatically so the tab is not a wall of closed rows.

**Rate limit.** 10 requests / 2 seconds is one budget for our whole key across every user and
consumer (`lib/maya/client.ts` is the single chokepoint and says so). The per-company cache lives
inside this slice, not after it — this is the recorded trigger for the priority queue deferred
2026-08-06, and the cache is what keeps a second visitor free.

### What a period offers

Filings are grouped by their period label. For each period and each of the two document types, one
filing is chosen:

1. **Announcements are excluded** — any filing carrying event `113` (`מועד פרסום דוחות`). Measured:
   80 of 814, and 100% of them are scheduling notices such as
   *"מועד פרסום דוח רבעון 1 לשנת 2026 ושיחת ועידה ביום 27.5.26, שעת השיחה: 10:00"*. They carry the
   report's own event id, which is why they are currently filed **as if they were the report** —
   `isDocumentEvent()` returns true when *any* event matches, so `[104, 113]` reads as a Q1 report.
   `lib/maya/events.ts` already has the concept (`SCHEDULE_EVENT_IDS`) and its header already says
   these belong to the calendar, not to a shelf; this slice applies it.
   **This is a live defect in Workspace's file picker too, not only in the new screen.**
2. **Hebrew before English** — same document, two languages; `company_documents.lang` records which.
3. **Then newest** — a correction supersedes what it corrects. MAYA states this itself: each filing
   carries `isCorrection`.
4. **Standalone decks are not offered here** (out of scope above), which also removes the
   bare-year period entirely from what this screen can store.

Everything dropped by rules 2–4 is dropped *silently by design*, and that is the one place this
spec accepts a quiet omission: each is another version of the same document, not a document the
user cannot otherwise reach. Rule 1's exclusions are not documents at all.

---

## 2 · The viewer, entered from a period

### The route

`/app/company/[id]/period/[period]` — a server component that resolves the company, reads the
period's chosen filings from the cached listing, and renders `LiveTranscriptView`.

`/app/live/[id]` cannot serve this: it keys on a transcript id via `loadCompletedCall(params.id)`,
and a 2024 period holding a report and a deck has no transcript id to key on. This is the one
genuinely new piece of plumbing in the slice.

### What it shows

**Two panes when there is no transcript** — report and deck, full width (founder's call). Not three
with an apology in the third. `LiveTranscriptView` gains an initial view + facet set so a
document-only period opens in **Multi** with `{slides, report}`; today it hardcodes `'single'` and
a three-facet set.

With a transcript, the period opens the transcript too, and the existing page is unchanged.

### Back

The viewer's existing top-left control routes to `/app/company/${companyId}`, which lands on the
Overview tab — so the founder's *"back to the same page that he was before"* needs the return
target to carry tab, year and period. Two consequences:

- back → `/app/company/[id]?tab=reports&year=2025&period=FY%202025`
- `src/app/app/company/[id]/page.tsx` currently accepts only `tab=quotes|calls` and silently falls
  back to `overview` — **`reports` is not even in the list today**, so the return path is broken
  before it is built. Widened, with the year and period restoring the open drill-down.

**The tab keeps its internal key `reports`** — only its visible label becomes מסמכים / Documents.
Renaming the key would churn every existing link for a string the user never sees.

### The wait, and what the user sees

Opening a document is 82 ms – 2.3 s of download + text extraction, plus storage upload and page
inserts. The pane therefore states plainly that it is fetching the filing from MAYA, and renders
the PDF when it arrives. **A failure says it failed.** There is no stub behind it any more, and
nothing renders success UI for content that never arrived (`rules/app.md`, the visible-degradation
law).

---

## 3 · The honesty deletions

`slideStubs()` and `reportStub()` (`src/lib/live/call-stubs.ts`) are **deleted, not replaced**:

- `SlidesPane` calls `slideStubs()` **unconditionally** (`FacetPanes.tsx:103`) — four invented
  Hebrew slides about אפגלו's ownership and Qatari/Saudi sovereign wealth funds, rendered for every
  call of every company, on a live host today.
- `reportStub()` is the silent fallback of a failed `/api/documents` fetch — FINDING 2026-07-17.

`SlidesPane` becomes the existing `PdfViewer` pointed at the deck, since presentations arrive as
PDFs like reports. Its stub navigation ("Slide N of 4") goes with them.

---

## 4 · Storage, and the one hazard

`ingestFiling()` writes `company_documents` **with a `company_id`**, so this screen *is* Atlas's
ingestion path: every document a real user opens becomes corpus, correctly attributed, aimed at
exactly the documents users want. Current floor: 12 rows across 3 of 234 companies.

**The hazard, and the guard.** `company_documents` is unique on `(company_id, quarter, doc_type)`
(migration 012) and storage paths are keyed by `maya_report_id`, so *bytes* never collide but
*rows* do — one period and type keeps one row, the most recently pulled. With standalone decks out
of scope the common collision is gone, but a Hebrew/English pair or a correction can still map two
filings to one row.

**Guard: the row records `maya_report_id`. If the stored row does not point at the filing the user
just clicked, re-ingest before serving it.** A user is never shown a document they did not click;
the cost is one re-fetch when alternating between two versions of one period.

**Corpus limitation, filed rather than fixed:** the database keeps only the most recently opened
document per period and type. That is a question for the agent chapter — which already owns the
`company_documents` publication-date column — not a user-visible problem here. **It is explicitly
not a reason to touch schema in this slice.**

---

## 5 · Verification

- Unit tests for the pure decisions: announcement exclusion, artifact selection (Hebrew → newest),
  period grouping, year windowing, the `maya_report_id` mismatch guard. Each written to **fail on
  the pre-fix behaviour first** — a guard that has never failed is not known to work
  (`testRegistry` precedent).
- The battery under `TZ=UTC` **and** locally. **Run TZ variants from PowerShell, never Git Bash**:
  a `TZ=` value containing a slash is silently dropped by MSYS path conversion, so
  `TZ=America/New_York npm test` runs in `Asia/Jerusalem` and prints a reassuring green. That
  disarmed check certified three of four runs in the previous branch's evidence. Print the resolved
  zone inside each run.
- Eyes-on in a real browser, **both locales**, every state driven rather than reasoned about: a year
  with filings · a year with none · a period with all three artifacts · a period with report only ·
  a period with no transcript (the common case — 5 attributed transcripts exist across 895 events) ·
  a fetch in flight · a fetch that fails · back-navigation restoring the open year and period.
- RTL: the year and period labels are Latin numerals inside a Hebrew page — `font-mono-num` +
  `dir="ltr"` on the numerals only, and any line mixing a Hebrew title with a Latin marker gets
  `<bdi>` per rule, never `dir` on the mixed line.

## Known risks, stated up front

1. **The rate limit is the binding constraint**, not the code. Two analysts browsing company pages
   at the same moment share 10 requests / 2 s with every other consumer. The per-company cache is
   the mitigation inside this slice; a real priority queue remains deferred.
2. **A year's coverage cannot be known without asking.** An empty year row is honest but costs a
   request to discover, and a company listed in 2021 shows clickable 2015–2020 rows that resolve to
   nothing.
3. **`toRemoteSources` keeps only the first PDF of a filing.** The 2024 annual report carries two
   (`P…-00.pdf`, `P…-01.pdf`); the second is usually the auditor's annex. Pre-existing, unchanged
   here, and recorded so it is not discovered as a surprise.
4. **The catalog reaches back further than our own labels.** `periodFor()` reads the year out of the
   filing title where the issuer states one and falls back to the publication year otherwise — best
   effort, not a promise, and it is descriptive only. Identity is always `maya_report_id`.
