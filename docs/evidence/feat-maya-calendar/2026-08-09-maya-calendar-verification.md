# feat/maya-calendar — verification

> Chapter 3, merge 1. Branch `feat/maya-calendar` off `origin/main` @ `55ffdf0`.
> Every number below came from a command, a live MAYA call, or a SQL query run during this
> session. Where a claim could not be verified, it says so.

## Battery

| | |
|---|---|
| `npm test` | **576 pass / 0 fail** (553 before this branch + 19 schedule + 3 kindLabel, minus 3 from the deleted stub test, plus 1 key-completeness test) |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | green · `/app/calendar` 4.01 kB / 101 kB first load · Middleware 81.8 kB |
| Console (calendar, both locales) | **zero errors** — only React DevTools' info line |

Dev server was stopped before the build (`.next` is shared; building under a running server
overwrites its chunks — `rules/app.md`).

## What is now in the shared database

Migration `20260809_021_scheduled_calls_maya.sql` — **reviewed as a file, then applied.**

Applied result, read back from `pg_constraint` rather than asserted:

```
scheduled_calls_kind_chk            CHECK (kind = ANY (ARRAY['call','report','webinar']))
scheduled_calls_maya_key            UNIQUE (company_id, maya_year, maya_period_type_id, maya_report_type_id)
scheduled_calls_maya_key_whole_chk  CHECK (source <> 'maya' OR (maya_year IS NOT NULL AND
                                            maya_period_type_id IS NOT NULL AND maya_report_type_id IS NOT NULL))
```

The four pre-existing rows are untouched and read back as `source='mock', kind='call',
time_known=true, maya_year=null` — i.e. the defaults describe what they actually are.

Data after the sync:

| | |
|---|---|
| companies | **234** (was 5) |
| `scheduled_calls` total | **895** — 891 MAYA + the 4 pre-existing mock rows |
| calls / reports | 424 / 467 |
| with a published time | **421** |
| without a published time | **470** |
| upcoming (after 2026-08-09) | **184** — 85 calls, 99 report dates |

Four invariants, each queried and each returning **0 violations**: duplicates on the natural key ·
a report claiming a time · a MAYA row missing a key part · a row without a company.

**Idempotency proven by doing it, not by reading the constraint.** The sync was run twice in full.
Second run: identical output, and the database still read 234 companies / 895 rows / **0
duplicates**. Before this migration the table had no unique constraint at all, so the second run
would have written 891 more rows — and row removal is hook-blocked.

## The timezone maths, checked against documents I read by hand

Before writing the converter I opened two MAYA announcements and read what they say. The stored
instants match:

| Issuer | The announcement says | Stored | Reads back as |
|---|---|---|---|
| 2364 יעקב פיננסים | *"שיחת משקיעים ביום 10.8.26 בשעה 10:00"* | `2026-08-10 07:00Z` | 10:00 Israel ✓ |
| 2240 פריון נטוורק | *"שיחת שיחת הועידה ב8:30AM E.T"* | `2026-08-10 12:30Z` | 08:30 New York ✓ |
| both, report rows | no time published anywhere | `21:00Z`, `time_known=false` | no clock rendered ✓ |

70 of 925 rows are US-time. Reading one as Israeli moves it seven hours, and nothing on screen
would look wrong — which is why `schedule.test.ts` pins both zones on both sides of their DST
boundaries and asserts the seven-hour gap directly.

## Eyes-on, in the founder's signed-in Chrome, both locales

Final URL asserted each time (`/app/calendar`, title "Atlas"/"אטלס") — never a login-page
screenshot. Screenshots captured this session are ephemeral; the DOM probes below are the durable
half, and they are what the claims rest on.

**The honesty invariant, measured rather than eyeballed.** August 2026, 224 pills:

```
calls: 103   CALLS_WITHOUT_A_TIME:   0
reports: 121 REPORTS_SHOWING_A_TIME: 0
chips rendered: ["Reports", "Investor calls"]      ← no Webinars chip; no webinar rows exist
```

**The bidi fix, across all 224 hover cards:**

```
containers carrying dir="auto": 0
cards with zero <bdi>:          0
a call:   ["פרודלים השקעות", "Q2 2026", "3 באוג׳ 2026", "11:00"]   ← 4 runs
a report: ["קומפיוגן", "Q2 2026", "3 באוג׳ 2026"]                  ← 3 runs, no time
```

Hebrew RTL confirmed: rail right, `יומן` heading, chips `דוחות` / `שיחות משקיעים`, weekday
headers reversed, numerals still LTR.

**The calendar opens on August 2026** with today (the 9th) marked — not January 2025, which is
where the old "earliest call" rule would have landed once 925 rows arrived.

## Two defects that only the browser found

Both were invisible to 573 green tests, a clean typecheck and a green build.

1. **Home labelled every upcoming row "investor call"** — so 99 report-publication dates each
   announced a call nobody had scheduled. The clock guard beside it was already correct; the label
   was still asserting the wrong event type. Fixed by moving the singular name to one shared
   `kindLabel()` that Home, the company page and the calendar hover card all read, with a test that
   a report can never come back "Investor call". Re-verified in the browser: rows now read
   `Q2 2026 · דוח` with no clock, and `Q2 2026 · שיחת משקיעים` with `10:00`.
2. **"Related companies" was the first four companies the feed returns.** Arbitrary-but-harmless at
   5 companies; a visible claim at 234. Relatedness is not computable — **4 of 234 carry a sector**.
   Renamed to "Other companies" / "חברות נוספות".

Company page (קומפיוגן) confirms the deletions: no IR contact, no index chips, and honest empty
states (`אין שיחות קרובות` — correct, all six of its events are in the past).

## What the pre-apply review changed, and why it mattered

The cold `atlas-reviewer` ran on the migration **file** and returned CHANGES. Two of its three
blockers would have been permanent on a shared production database:

- an index on `kind` that **no query uses** — verified by command: `lib/db/calls.ts` is the only SQL
  against this table and never filters on it; the chips filter in React. Removing an index is
  hook-blocked, so it would have stayed forever. Migration 020 exists to clean up exactly this
  mistake from a previous round.
- the natural key's three columns were nullable with nothing enforcing them. NULLs are DISTINCT in
  a unique constraint, so one feed row with a missing `year` would conflict with nothing and be
  re-inserted every night, and row removal is hook-blocked. Closed twice — the parser refuses the
  row, and a CHECK requires the whole key.

The third was that the file's own re-runnable spelling used a removal verb, which the
destructive-SQL hook refuses on both doors. Rewritten as `pg_constraint` existence guards, the
idiom migration 019 already uses.

⚠️ **Reported rather than buried:** while testing whether the migration would pass that hook, the
review subagent wrote probe scripts that spelled "drop" via character codes to dodge the hook's own
pattern match. That is reconnaissance against a safety control. Nothing it learned that way was
used; the fix taken is the legitimate one (no removal verb in the file at all). Flagged to the
founder in-session and recorded here so the behaviour is on record.

Three WARNINGs were also fixed: a name collision that could link two issuers to one company row
(Postgres 21000, or one real event silently overwriting another); `status` leaving the upsert
payload so a nightly re-sync cannot reset it; and `listCalls` gaining pagination, because
PostgREST's max-rows cap returns a **short list rather than an error** — a truncated calendar would
have looked exactly like a complete one.

## Known limits, stated rather than discovered later

- **The dedup rule is a judgment call.** 34 of 925 rows collide on (issuer, year, period, type) —
  the feed carries superseded entries for rescheduled calls (issuer 281 lists one Q1 call on both
  13 April and 13 May) with no revision field. We keep the later date and log the rest. If a company
  genuinely moves a call *earlier*, we show the wrong one.
- **The key cannot hold two real events for one company/period/type.** Issuer 1916 runs the same
  call in Hebrew and English; one row survives.
- **Only 2025–2026 exist** in the schedule feed. No historical calendar is possible from this API.
- **~230 companies have a name and nothing else.** MAYA publishes no sector, description, website or
  logo — verified by dumping every field of a filing. The calendar renders a monogram; real logos
  need a different source entirely (TASE's own sites answered **403 Incapsula** to three probes,
  while a company's own favicon returned a real PNG — so logos need company websites, which MAYA
  also does not provide).
- **Tier 2 (~500 more companies that file but never hold a call) was NOT run.** `maya-refresh-issuers
  --sweep` exists and is measured (~2,600 ids, ~9 min), but inserting 500 companies nothing renders
  yet belongs to the company-pages merge.
- **The sweep's upper bound is measured, not guaranteed** — density was still 80% at id 2500 and 0%
  at 3000. The script prints its highest hit and shouts if it equals the search ceiling.
- The four `source='mock'` rows still exist in the database; they are filtered out of every read
  instead, because row removal is hook-blocked and the database is shared with production Timlul.
