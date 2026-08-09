# MAYA calendar — design spec

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md +
> PROGRESS.md. Merged to main 2026-08-09 as `a94f33d`, carrying `feat/maya-calendar`,
> `feat/company-profiles` and the supervisor's `fix/calendar-empty-state` round.

> **Chapter 3, merge 1.** Founder brainstorm 2026-08-09. Every number in this document came from a
> live MAYA call or a SQL query run during the brainstorm, not from a prior document.
> Decisions filed in `agent-memory/cross-cutting.md` (2026-08-08 / 2026-08-09).

## The goal, in one line

**A clean calendar showing the upcoming investor calls and report dates of TASE companies, built
only from data MAYA actually gives us.**

## What was measured (2026-08-09, live)

| Fact | Value | How |
|---|---|---|
| A "list all companies" endpoint | **does not exist** | two directory paths → 404 / 403 |
| Companies discoverable from the report schedule | **233** | 2025: 213 · 2026: 189 · union 233 |
| Issuer-id space | **~200–2,600** | 53 hits in 240 probes; 0 at ids 1–15, 3000, 5000, 10000, 50000 |
| Estimated full reporting universe | **~700–800** | extrapolated from a 240-id sample — *the sweep produces the real number* |
| 2026 schedule rows | **557** — 267 conference calls, 290 report publications | `by-report-year` |
| 2025 schedule rows | **368** | same |
| Upcoming conference calls (after 2026-08-09) | **92** | filtered |
| Schedule years with data | **2025 and 2026 only** | 2020–24 and 2027 all return 0 rows |
| Conference calls carrying a time | **452 / 453** | across 2025+2026 |
| Report publications carrying a time | **0 / 472** | across 2025+2026 |
| Timezones | IL 380 · US 70 · null 475 | 2025+2026 |
| Company name on a schedule row | **absent** — `issuerId` only | row keys dumped |
| Sector / description / website / logo in MAYA | **none, anywhere** | every field of a filing dumped |
| Existing `scheduled_calls` rows | **4, all `source='mock'`**, dated June 2026 | SQL |
| Existing `companies` rows | **5**, 4 with a `tase_issuer_id`; `תמיס` has none | SQL |

Two consequences that drive the whole design:

1. **The schedule feed has no names**, so the company directory is a hard prerequisite for the
   calendar, not a parallel task.
2. **Conference calls have a time; report publications never do.** Storing both as plain timestamps
   would silently render 472 fabricated midnight appointments. Time-known has to be a stored fact.

## Scope

**In:**
- Delete the fabricated company-overview modules and the hardcoded quarter tags (founder: *"let's
  remove all of this mock data, and from now on start building cleanly"*).
- One additive migration on `scheduled_calls`.
- A sync script: discover companies → write the schedule.
- The calendar renders real rows, honestly, in both locales.

**Out, deliberately:**
- **Hosting or recording calls.** Founder 2026-08-09: *"showing the upcoming investor calls, and
  actually hosting them is different things."* No Recall work, no join links, no dial-in extraction.
  **Consequence: the sync never opens an attachment** — every field it needs is structured.
- **Webinars and third-party investor events** (events 233-outside-the-schedule and 271). Founder
  chose option A. Their dates live in Hebrew title prose; that becomes its own slice with its own
  verification, because it is the first place a calendar date would come from us interpreting a
  sentence.
- **The filings catalog (`maya_filings`) and `company_documents.published_at`.** They belong to the
  company-pages merge, which has the readers and writers for them. Creating them here would be a
  backend with zero callers — the exact defect this lane filed on 2026-08-07. *This means the
  chapter has two migrations rather than one; that is a deliberate departure from the chapter
  prompt's "one migration", taken because a table designed before its consumer is usually designed
  wrong.*
- Company pages themselves, chat, retrieval.

## Data model

### Migration `20260809_021_scheduled_calls_maya.sql` — additive only

*(numbered 021: the tree already holds 018–020 from the workspace chapter)*

```sql
alter table public.scheduled_calls
  add column if not exists kind text not null default 'call',
  add column if not exists time_known boolean not null default true,
  add column if not exists maya_year int,
  add column if not exists maya_period_type_id int,
  add column if not exists maya_report_type_id int;

alter table public.scheduled_calls
  add constraint scheduled_calls_kind_chk check (kind in ('call','report','webinar'));

-- IDEMPOTENCY. The schedule feed has NO row id, so the natural key is the tuple
-- below. Existing mock rows carry NULL in the maya_* columns and NULLs are
-- distinct in a unique constraint, so they neither collide with each other nor
-- with synced rows — no partial index needed, and PostgREST's on_conflict can
-- therefore name these columns.
alter table public.scheduled_calls
  add constraint scheduled_calls_maya_key
  unique (company_id, maya_year, maya_period_type_id, maya_report_type_id);

create index if not exists scheduled_calls_kind_idx on public.scheduled_calls(kind);
```

`scheduled_calls` is **shared corpus** (`docs/DATA-MODEL.md`) — no `user_id`, and this migration
adds none. Its RLS is unchanged.

Why a unique **constraint** rather than a bare unique index: either would work — Postgres infers
the arbiter from the column list — so this is a readability preference, not a requirement. *(An
earlier draft of this spec called it "verified requirement, not preference"; nobody had run that,
and the pre-apply review was right to call it out.)*

What the pre-apply review did change, and both would have been permanent: an index on `kind` that
no query uses (nothing filters on it in SQL — the calendar's chips filter in React), and a CHECK
that the `maya_*` key parts are all present on a MAYA row, without which a feed row missing one
would be re-inserted on every nightly run and could never be cleaned up.

### `companies` — no schema change

New rows are inserted with `name = display_name = issuerName`, everything else null.
`companies_tase_issuer_uniq` already exists.

**The sync never updates an existing company row.** Four of the five current companies carry
hand-curated `sector`, `description`, `website` and `logo_url` — real data, not stubs — and MAYA has
none of those fields to offer. An upsert that touched them would overwrite good data with nulls.

**Duplicate guard:** `תמיס` exists with `tase_issuer_id` NULL, so a sweep could insert a second row
for the same company. Before inserting, the sync matches on `normaliseCompanyName()` (reused from
`lib/maya/issuers.ts`); a name match links the issuer id onto the existing row instead of inserting.

## The sync — `scripts/sync-maya-calendar.ts`

Pure code. No model calls. Two passes, run sequentially through the existing
`mayaGet()` chokepoint so the shared rate limit is respected (`MAYA_MIN_REQUEST_GAP_MS`).

### Pass 1 — a company row for every known issuer

> **AS BUILT.** An earlier draft of this section described Pass 1 as walking the issuer-id space
> itself, with an `--issuers-from-schedule` flag. That is not what shipped, and the flag does not
> exist — a cold review caught the spec describing a design rather than the code. Corrected here to
> what the two scripts actually do.

Issuer **discovery** belongs to `scripts/maya-refresh-issuers.ts`, which already existed and owns
the `maya_issuers` directory table. It has two modes:

- **default** — ids come from the report schedule (~233 issuers, ≈1 minute). Tier 1, and everything
  the calendar needs.
- **`--sweep [--from N] [--to N]`** — walks the issuer-id space directly (default 1–2600,
  ~9 minutes). Tier 2: the companies that file but never schedule a call. **Not run in this merge**
  — it belongs to the company-pages merge, which will have somewhere to render them.
- The sweep's range is a **measured** bound, not a guaranteed one. The script prints the highest id
  at which it found an issuer and shouts if that equals `--to`, because the universe may continue
  past where we stopped looking.

`sync-maya-calendar.ts` Pass 1 then **reads `maya_issuers` from the database** and gives every named
issuer a `companies` row: insert unseen ones, link a name match that has no issuer id yet, and never
update an existing row (four companies carry hand-curated sector/description/website/logo that MAYA
cannot supply). An issuer whose name normalises onto a company already holding a *different* issuer
id is counted and named as **unlinkable** rather than silently skipped.

### Pass 2 — the schedule

`financial-report-schedule/by-report-year` for 2025 and 2026 (the only years with data).

For each row:
- `financialReportTypeId 1` → `kind='call'`, `time_known=true`
- `financialReportTypeId 2` → `kind='report'`, `time_known=false`
- a type-1 row with no `scheduledTime` → `time_known=false` (1 such row exists today)
- `quarter` ← `periodTypeId` → `Q1 | Q2 | Q3 | FY` + `year`
- `source='maya'`, `status='scheduled'`

**Timestamp conversion.** `scheduledDate` + `scheduledTime` are wall-clock in `timeZone`:
`IL → Asia/Jerusalem`, `US → America/New_York`, null → treat as date-only. A new tested helper
`zonedWallClockToUtc()` does the conversion via `Intl.DateTimeFormat` part extraction so DST is
handled by the platform's tz database rather than a hardcoded offset. **Unit-tested across a DST
boundary in both zones** — a wrong offset moves a call by seven hours and nothing on screen would
look broken.

When the time is unknown, `scheduled_at` is stored as **midnight Asia/Jerusalem** on that date and
`time_known=false`. The timestamp is a bucketing device only; the UI must never print a clock for it.

**Deduplication.** 34 of 925 rows collide on `(issuerId, year, periodTypeId, reportTypeId)` — the
feed carries superseded entries for rescheduled calls (verified: issuer 281 lists one Q1 call on
both 13 April and 13 May). Rule: **keep the row with the latest `scheduledDate`; the sync logs the
count and the ids it set aside.** This is a documented judgment call, not a fact MAYA gives us —
there is no revision field. Silent truncation is what makes a partial import read as complete.

**Failure behaviour.** `mayaGet` never throws; the sync distinguishes `unauthorized` / `rate_limited`
/ `bad_request` / `unavailable` and exits non-zero with a count of what it did and did not write. A
pass that reached MAYA and found nothing is reported differently from a pass that could not reach it.

## The calendar

`CalendarView.tsx` already implements the design — pills, filter chips, follow, hover cards. The
changes are about telling the truth with real data:

1. **`kind` flows through.** `ScheduledCall` gains `kind: EventKind` and `timeKnown: boolean`;
   `mapCall()` reads the new columns. `eventKind()` already reads a `kind` hint, so the existing
   filter chips start working with no change.
2. **Open on the current month.** Today it opens on the month of the *earliest* call; with 925 rows
   that is January 2025. Change to today's month.
3. **Never print a time we were not given.** The pill and the hover card render `formatTime()` only
   when `timeKnown`; otherwise the time slot is omitted. This is the honesty invariant of this merge.
4. **Only offer filters that can match.** Render a kind chip only for kinds present in the loaded
   data. With webinars out of scope there are no webinar rows, and a chip that can never match is a
   claim we did not earn.
5. **The calendar excludes `source='mock'`.** The four fabricated June-2026 rows stay in the database
   — deleting rows is destructive, hook-blocked, and the DB is shared with production Timlul — but
   they do not appear on a calendar that is meant to be clean. `/app/live/demo` is unaffected; it
   resolves its company server-side, not through this query.
6. **An empty month says so** rather than rendering a silent grid.

## The honesty deletions

- `src/lib/company/overview-stub.ts` — **deleted**, with its consumers in `CompanyOverview.tsx` and
  `CompanyView.tsx`. It invents an IR contact ("Zvika Rabin"), index memberships, a CEO quote
  attributed to a real TASE issuer, and four announcements — for *every* company, with nothing on
  screen saying so.
- Hardcoded `quarter="Q2 2026"` at `app/home/page.tsx`, `app/live/[id]/page.tsx`, `app/agents/page.tsx`.
- `isLiveCompany = company.ticker === '1097229'` in `CompanyView.tsx`.

Per the founder's decision the outcome is **deletion, not a demo badge**. Where a module loses its
only content, the module does not render. Curated real fields (`sector`, `description`, `website`,
`logo_url` — genuine for four companies) are untouched and render when present.

## Icons

MAYA has no logo field. ~750 companies will have `logo_url = null`. The calendar renders a
**monogram** — the first letters of the company's name in a tinted disc — which is a visible
placeholder, not a fake logo. Real logos need a different source and are not in this merge.

## Verification

Nothing is claimed without evidence:

1. `npm test` · `npx tsc --noEmit` · `npm run build` (dev server stopped first — same-checkout builds
   overwrite a running server's chunks).
2. **Unit:** timezone conversion across DST in both zones; dedup keeps the later date; kind/time
   mapping; the name-match duplicate guard.
3. **The migration file is reviewed BEFORE it is applied** (`rules/db.md` — the one irreversible
   class here), and `cross-cutting.md` gets its line before the apply.
4. **Live:** run the sync, then query the database — company count, call count, how many upcoming,
   how many with a known time, and zero duplicates on the natural key.
5. **Eyes-on in a real browser, both locales**, signed in: the calendar on today's month showing real
   companies and real times; a report row showing a date with **no** clock; RTL checked for bidi on
   the mixed Hebrew-name-plus-Latin-time pill (`<bdi>` per run, never `dir` on the line).
6. A cold `atlas-reviewer` pass before it is offered for merge.

**Five-strike rule:** five failed attempts at the same problem ⇒ stop, write down what was tried,
append an ALERT to `cross-cutting.md`, and hand it to the founder.

## Known risks, stated up front

- **The issuer-id upper bound is measured, not guaranteed.** Density was still 80% at 2500 and 0% at
  3000; the sweep may need widening. The script reports its highest hit so this is visible.
- **~750 companies with only a name** is thin. That is the truth of what MAYA offers, and the
  company-pages merge is where filings give them substance.
- **The dedup rule is a judgment call.** If a company genuinely moves a call *earlier*, we show the
  later date. No feed field can distinguish this.
- **Only 2025–2026 exist.** No historical calendar is possible from this API.
