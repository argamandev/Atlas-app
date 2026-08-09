# The documents catalog — verification

**Branch:** `feat/documents-catalog` off main `9fbd475` · **Date:** 2026-08-09 · **Lane M**
Spec: `docs/superpowers/specs/2026-08-09-documents-catalog-design.md` ·
Plan: `docs/superpowers/plans/2026-08-09-documents-catalog.md`

This file states what each check DOES and does NOT prove. Where a check was run and then found to
have proved nothing, that is recorded too — twice below, and both are the useful part.

---

## Gates

| gate | result |
|---|---|
| battery, local zone (`Asia/Jerusalem`) | **652 / 652** |
| battery, `TZ=UTC` **run from PowerShell**, zone printed inside the run (`ZONE: UTC`) | **652 / 652** |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` (dev server stopped, `.next` cleared first) | green · `/app/company/[id]/period/[period]` compiled · Middleware **81.8 kB** unchanged |
| console, both locales | clean — only React's "Download the React DevTools" notice |

**Why the TZ run goes through PowerShell:** in Git Bash a `TZ=` value containing a slash is silently
dropped by MSYS path conversion, so `TZ=America/New_York npm test` runs in `Asia/Jerusalem` and
prints a reassuring green. That disarmed check certified three of four runs in the previous
branch's evidence. Every TZ run here printed its resolved zone from inside the run.

---

## What was driven in a real browser (authenticated, both locales)

The founder's Chrome profile, `localhost:3003`. Final URL asserted on every step, not just pixels.

| # | state | result |
|---|---|---|
| 1 | Documents tab reached by URL (`?tab=reports`) | ✅ after a fix — see FOUND-1 |
| 2 | newest year auto-opened | ✅ 2026 open on arrival |
| 3 | a year with filings | ✅ 2023 → Annual · Q3 · Q2 · Q1, newest first |
| 4 | a year with **no** filings | ✅ דוראל 2016 → "לא נמצאו דוחות לשנה זו" |
| 5 | a period with all three artifacts | ✅ תיגבור Q1 2026 → transcript + report + deck, with admin rename/delete |
| 6 | a period with **no transcript** | ✅ תיגבור FY 2023 → **two panes**, two facet chips, no audio bar |
| 7 | a document being fetched | ✅ both panes read "Fetching the document from TASE…" |
| 8 | a fetch that **fails** | ✅ report pane "לא הצלחנו להביא את המסמך" while the deck pane says "אין מסמך לתקופה זו" — two conditions, two messages |
| 9 | back-navigation | ✅ returns to `?tab=reports&year=2026&period=Q1%202026` with that year AND period still open |
| 10 | the same URL cold (deep link) | ✅ opens the drill-down at that year and period |
| 11 | Hebrew RTL | ⚠ after a fix — see FOUND-4, **and see the merge addendum: this row was earned on a screen that did not include the header the feature feeds** |

**What the screenshots prove and do not:** they were all taken on a machine in Israel, so they show
no-regression for timezone behaviour, **not** the timezone fix. The `TZ=UTC` battery is what covers
that.

### The loop, closed

`/app/company/<תיגבור>/period/Q1%202026` opens the **same `LiveTranscriptView`** a live call uses:
real Hebrew transcript, the company's **actual 41-page investor deck**, and its **real 31-page
quarterly report**, with Ask Atlas, the snipping scissors, page navigation, zoom, and Single/Multi.
Where the deck now renders, the previous code rendered four invented Hebrew slides about אפגלו and
Gulf sovereign wealth funds — for every call of every company, on the live host.

### The ingestion path, proved on real data

Opening those two documents wrote to the shared database, and the rows say what the design claimed:

- **A new `slides` row** — תיגבור `Q1 2026`, `maya_report_id 1744031`, 41 pages, stored at
  `<company-uuid>/maya/1744031.pdf`. **The first presentation Atlas has ever stored** (the corpus
  held 12 documents, all reports, zero decks).
- **The `report` row was RE-INGESTED, and that is the `needsIngest` guard working in production
  data rather than only in a unit test.** The row was created 2026-07-16 with `source='manual'` and
  a NULL `maya_report_id`; unknown identity is not matching identity, so it was re-fetched and now
  carries `maya_report_id 1744027` and `source='maya'`.

---

## Two checks that proved nothing, and what they cost

**FOUND-1 — a scripted edit silently did not apply, and I committed a message saying it had.**
The `initialTab` fix in Task 8 was made with a multi-line `node -e` `.replace()`. The working tree
is CRLF and the search string used `\n`, so the replace was a no-op. `tsc` passed (both versions
typecheck), the battery passed (no test covered it), and the commit message asserted the fix.
It was caught only by opening `?tab=reports` in a browser and seeing **Overview** selected.
⇒ Every other scripted edit on this branch was then audited by grepping for its result; one had
failed, four had applied. **A scripted edit is not done until its result is grepped for.**

**FOUND-2 — the first mutation test of `documentCatalog` mutated nothing.** A `perl` substitution
meant to admit bare-year periods did not match, and the run printed a comfortable "11 pass · 0
fail" — which reads exactly like "the mutation was survived by a good test". The line was re-read,
the mutation re-applied through the editor, and it then failed 1 test as it should.
⇒ Same lesson one level down: **confirm the mutation landed before believing the result.**

---

## FOUND-3 — a runtime crash in the state this feature exists to create

Opening a period with **no transcript** — the common case, since 5 of 895 events have an attributed
transcript — threw `RangeError: Invalid time value` and 500'd the route.

`formatDate('')` → `Intl.DateTimeFormat().format(new Date(''))` **throws**. The synthesized
period-without-transcript has no call date, and the viewer header formats one.

It was invisible to 652 passing tests, a clean `tsc` and a green build, because it lived in a state
nobody had ever rendered — the fourth time this repo has filed that exact sentence.

Fixed at the choke point rather than at the call site: `formatDate` and `formatTime` return `''`
for an instant we do not have. That is what the call sites were already written for — both read
`[a, formatDate(...)].filter(Boolean)` — so the formatter simply never returned the empty string
they were prepared for. Inventing a date (today, the epoch) would have been the fabrication class
this codebase refuses; crashing is not better than empty. The period page separately now passes the
filing's real **publication date**, so the header reads `Tigbur Group — FY 2023 · Mar 31, 2024`.

The test written for it asserts the OLD throwing behaviour is gone AND that a real instant is
unaffected, and it was confirmed RED before the fix (2 failures, both `RangeError: Invalid time
value`).

## FOUND-4 — the `<bdi>` rule, 4th occurrence, broken by me in the same branch that quotes it

The Hebrew publication date rendered **"במרץ 31 2024"** instead of **"31 במרץ 2024"** — day and
month transposed. Cause: `dir="ltr"` on a span holding `31 במרץ 2024`, which is a MIXED run, not a
bare numeral. `rules/app.md` says a mixed line gets `<bdi>` per run and direction goes on the
container; iron rule 5 scopes `dir="ltr"` to numerals and tickers only.

Caught by looking at the Hebrew locale, not by any gate. Fixed to `<bdi>` and re-verified by zoom:
now reads `31 במרץ 2024`. The year count chip beside it had the same defect (`· 4 רבעונים` forced
LTR) and was fixed in the same pass — and now renders only for 2+ periods, so the English no longer
reads "1 quarters".

---

## Known limitations, carried deliberately

1. **The year list runs to a 2015 floor** (the oldest period label Atlas holds). A company listed
   later shows clickable earlier years that resolve to "no filings" — honest, and each costs one
   MAYA request to discover. There is no cheaper way: MAYA refuses any window wider than a year,
   confirmed four ways including with an `EventId` filter.
2. **The database keeps one row per (company, period, type)**, so the corpus cannot hold the Hebrew
   and the English edition of one report. The USER is never shown the wrong one (`needsIngest`
   re-fetches on identity mismatch), but the corpus keeps only the most recently opened. Filed for
   the agent chapter; not a reason to touch schema here.
3. **Out of scope by founder decision:** announcements, webinars, standalone company presentations
   with no period (115 of 295 measured decks), English duplicate editions, dual-listed extras such
   as a 20-F.
4. **`toRemoteSources` keeps only the first PDF of a filing** — pre-existing, unchanged here.
5. **Rate limit — CORRECTED AT MERGE, because "unchanged in kind" was not accurate.** This
   sentence originally read *"rate limit unchanged in kind"*. It is not: **before this branch a
   MAYA listing was spent only on an explicit Workspace intake — a deliberate, occasional act.
   Now every view of a company's Documents tab costs ~2 requests and every year click ~2 more**,
   against a 10-per-2-seconds budget shared by the whole product and every user. That is a change
   in kind, not degree: the spend moved from user-initiated-and-rare to browsing-driven. A
   five-minute per-company-year cache is in this slice and absorbs re-opens, but the priority
   queue this lane's own cross-cutting entry named as the trigger is now genuinely due. Filed by
   the merge reviewer.

---

## Merge addendum (supervisor, 2026-08-09) — what the cold gate found, and what it changes here

Merged as `47bf674` with fixes in `227edd5`. Verdict: **CHANGES, no blockers.** Three corrections
to this document are made in place above (two wrong FOUND- cross-references, and limitation 5,
which claimed the rate-limit profile was unchanged when the spend moved from occasional to
browsing-driven). What follows is what the gate added.

**FOUND-5 — the `<bdi>` rule's 5th, 6th and 7th occurrences, and the 5th was twenty lines from
the branch's own fix for the 4th.** `DocumentsTab` was fixed and given a careful comment; the
identical `dir="ltr"` sat on `LiveTranscriptView`'s identity header — **the header this feature's
period page feeds a filing's publication date into** — so the catalog's headline screen rendered
`ביולי 2026 16` in Hebrew. Row 11 above ("Hebrew RTL ✅") was earned on a screen that does not
include it.

Grepping the **construct** rather than the component then found two more of the same shape, both
pre-existing and both user-visible: `LiveBroadcastView`'s live-call header and `CompanyOverview`'s
latest-call date. All four sites now use `<bdi>`; `TranscriptSidePanel`'s prop had to change shape
(`sub: string` → `subParts: string[]`) because runs cannot be wrapped after being concatenated,
and the compiler enforced the caller update.

**The fix was proved by mutation IN THE BROWSER, not by reasoning.** On the live page, the runs'
x-positions were measured, `dir="ltr"` was set back on the element, and they were measured again:

```
with <bdi>      visual order L→R:  2026 · ביולי · 16     reads "16 ביולי 2026"   ✅
with dir="ltr"  visual order L→R:  16 · 2026 · ביולי     reads "ביולי 2026 16"   ✗
restored        visual order L→R:  2026 · ביולי · 16                              ✅
```

This control matters more than the screenshot: **a `<bdi>` that changes nothing looks exactly like
a `<bdi>` that fixes everything.** Without it, "I replaced dir with bdi" is an assertion.

**Line endings.** Both i18n dictionaries were committed CRLF into an LF repo, each carrying one
bare `\r` that welded `quartersLabel` and `viewAll` onto a single physical line — residue of the
scripted edit that removed `liveTase`, in the commit made *after* the handoff, on the branch that
filed "a scripted edit is not done until its result is grepped for". Cosmetic to the parser
(TypeScript treats a bare CR as a line terminator, so tsc and 652 tests passed), but it turned a
30-line change into 2774 lines of diff. Normalized to LF; the dictionary diff is now 15 lines.
Confirmed against raw blobs via `git cat-file` with an untouched control file, because "my tool
invented this" was the likelier explanation and had to be ruled out first.

### Gates re-run on the real merge result

| gate | result |
|---|---|
| battery, `Asia/Jerusalem` (zone printed inside the run) | **652 / 652** |
| battery, `TZ=UTC` from PowerShell (`ZONE INSIDE RUN: UTC`) | **652 / 652** |
| battery, `TZ=America/New_York` from PowerShell (zone confirmed) | **652 / 652** |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | green · `/app/company/[id]/period/[period]` compiled · Middleware **81.8 kB** |
| eyes-on, Hebrew, signed in, real company (תיגבור Q1 2026) | transcript + real 41-page deck + real 31-page report; console clean |

### What the supervisor did NOT verify, stated plainly

- **`TranscriptSidePanel`'s sub-line was never seen rendering.** The panel is `lg:flex` and the
  automation viewport would not exceed 490px CSS width across three attempts, so the `<aside>`
  never entered the DOM. The change is typechecked, battery-green, and compile-enforced at its
  single call site — but it is *reasoned*, not *seen*, and it is the one item here carried on that
  weaker footing. The header fix beside it was seen and mutation-proved.
- **Every MAYA measurement** (80 of 814 event-113 filings, 115 of 295 standalone decks, 5 of 895
  events with an attributed transcript). No network call was made to audit a number, since
  spending the shared 10-req/2s budget to re-count is worse than reporting it unverified. The
  *mechanism* of the 113 change was verified by the reviewer, which is the part that could break.
- **The live-DB evidence** (the re-ingested Q1 2026 row now carrying `maya_report_id 1744027`, the
  first stored deck at 1744031). Not re-queried at merge.
