# fix/israel-time-residue — the three date comparisons the hotfix left behind

**Lane M (multiview) · branch `fix/israel-time-residue` off merged main `b9a5159` · 2026-08-09**

`fix/israel-time` (merged `796fdbd`) pinned every **formatter** to `Asia/Jerusalem` after the live
site listed every investor call three hours early. It did not touch the places that **compare**
dates, and the merge gate filed three of them as open. This branch closes all three, plus the
evidence folder that hotfix owed (`docs/evidence/fix-israel-time/`).

**None of these are visible to a viewer in Israel.** That is the whole point, and it is why the
verification below is built around timezone-varied test runs rather than screenshots.

---

## The three sites

| # | Site | Was | Now |
|---|---|---|---|
| 1 | `CalendarView.tsx` today-pill | compared the viewer's local `getFullYear/getMonth/getDate` | compares the cell's `YYYY-MM-DD` against `israelDayKey(new Date())` — the **same key `byDay` buckets events by** |
| 2 | `CompanyOverview.tsx` `isFuture` | `startOfToday.setHours(0,0,0,0)` = viewer's local midnight | extracted to `isFutureEvent()` in `lib/calendar/event-meta.ts`, unit tested |
| 3 | `lib/db/calls.ts` `scope:'upcoming'` | `setHours(0,0,0,0)` on the **server** = UTC midnight on Railway | `israelDayStart(israelDayKey(new Date()))` |

A fourth was found while in there and fixed: `CalendarView`'s `initialMonth` opened on the
**viewer's** current month, so a viewer east of Israel at 01:00 on the 1st would open on a month
Israel had not reached yet.

### Why #3 was the one with teeth

Report rows carry no clock and are stored **at Israel midnight** — `21:00Z` or `22:00Z` the
previous day. UTC midnight is therefore **2–3 hours after** the Israel day begins, so a report due
today sorted *below* the cut-off. **Every report due today was excluded from `scope:'upcoming'`,
on the live host, for every viewer.**

Measured against the live DB for today (2026-08-09 Israel):

```
recovered_by_fix   : 1     -- rows in [Israel midnight, UTC midnight) that the old floor dropped
israel_today_total : 1
recovered_reports  : 1
```

That row is **מגה אור**, Q2 2026 report, `2026-08-08T21:00:00Z`, `time_known=false`.

⚠ **Scope of that claim, stated precisely:** Home calls `listCalls({scope:'upcoming', kind:'call'})`,
so this report was *already* excluded there by the `kind` filter and Home shows no visible change.
The recovered row reaches `GET /api/calls?scope=upcoming`, which is the other consumer. I checked
the callers before writing this rather than assuming the fix was visible on Home.

## New primitive

`israelDayStart(dayKey)` in `src/lib/i18n/format.ts` — the inverse of `israelDayKey`, returning the
real instant an Israel calendar day begins. It exists for exactly one caller (#3), because Postgres
compares timestamps and not `YYYY-MM-DD` strings. **Everywhere that can compare day keys still
does**, which needs no offset arithmetic at all.

The offset is **probed, never hardcoded** (Israel is UTC+2 in winter, UTC+3 under DST, and the
transition dates move), with a second pass to settle the case where the first guess lands on the
far side of a transition.

---

## Verification

### The battery, in five timezones

> ⚠ **CORRECTED AT MERGE, 2026-08-09, and the correction is worth more than the table.**
> This section originally listed four zones run as `TZ=Asia/Jerusalem npm test` and friends from
> Git Bash. **Three of those four never happened.** MSYS path conversion silently DROPS a `TZ=`
> value containing a `/`, so `TZ=America/New_York` and `TZ=Australia/Sydney` both executed in
> `Asia/Jerusalem`; only `UTC` (no slash) survived. The supervisor's own merge check repeated the
> same mistake an hour later with New York and Tokyo, which is how it was caught — by a cold
> reviewer who checked the *environment*, not the command.
> The numbers below are the RE-RUN, from PowerShell (`$env:TZ=…`, which passes the value intact),
> with the resolved zone printed inside each run and confirmed to match. **The original result was
> true; the method proved nothing.** A green certified by a disarmed check is worse than no check,
> because it is the thing that is supposed to notice.

| TZ (verified via `Intl.DateTimeFormat().resolvedOptions().timeZone`) | result |
|---|---|
| `UTC` | **625 / 625**, 0 fail |
| `America/New_York` (west) | **625 / 625**, 0 fail |
| `Asia/Tokyo` (east) | **625 / 625**, 0 fail |
| `Australia/Sydney` (east) | **625 / 625**, 0 fail |
| `Pacific/Honolulu` (far west) | **625 / 625**, 0 fail |

`npx tsc --noEmit` exit 0 · `npm run build` green · Middleware 81.8 kB.

**`israelDayStart` probed independently of the battery** (supervisor, at merge): every day of 2026
and 2027 — **730 / 730** — begins at exactly `00:00` Israel when formatted back in `Asia/Jerusalem`,
the minute after belongs to that day and the minute before does not. That range crosses all four
DST transitions. The probe carried a control whose answer was already known (offset 120 in January,
180 in August) so that a probe measuring nothing could not print the same reassuring result.

### The guards were proven to FAIL on the bug first

The last chapter's lesson was that a green battery certified an untrue sentence. So both new guards
were run against the **pre-fix implementations**, restored immediately after:

```
mutated  TZ=UTC             → 625 tests, 620 pass, 5 FAIL
mutated  TZ=Asia/Jerusalem  → 625 tests, 622 pass, 3 FAIL
```

Failing under **UTC** but not under **Israel**:
- `isFutureEvent: a report due TODAY in Israel is still upcoming all day`
- `isFutureEvent: a report LATER today counts, one 24h earlier does not`

**That two-test gap is the production shape reproduced in the battery** — the defect is invisible
on any machine in Israel, which is every machine this product is developed on. The three
`israelDayStart` tests fail in both timezones, as they should: that primitive is timezone-
independent by construction.

One of the three is a **property**, not a table of dates I believe in — for all 365 days of 2026,
`israelDayStart(k)` must land inside day `k` while one millisecond earlier does not. It covers both
DST transitions without the test needing to know when they are.

### Eyes-on, both locales, signed in

Driven through the founder's authenticated Chrome on `localhost:3003`. Final URLs asserted, not
just pixels.

- **`/app/calendar` (HE, RTL)** — today-pill on **9**, in the יום א column. Zoomed: the `9` is the
  filled ink pill, and the cell holds exactly one green (report) event — מגה אור's Q2 2026.
- **`/app/calendar` (EN, LTR)** — today-pill on **9**, SUN column. Layout flips cleanly.
- **`/app/company/af4cbe50…` (HE)** — `הבאה בתור` → **דוח · Q2 2026 · 9 באוג׳ 2026**, pill
  `בקרוב · היום`. No clock rendered, which is correct: `time_known=false`.
- **`/app/company/af4cbe50…` (EN)** — `NEXT SCHEDULED` → **Q2 2026 · Report · Aug 9, 2026**,
  `Upcoming · today`.
- **Console: zero errors** across the session.

### ⚠ What the eyes-on does NOT prove, said plainly

Every screenshot above was taken **from Israel**, so it demonstrates *no regression* for an Israeli
viewer — it does **not** show the bug being fixed. #1, #2 and #4 are client-side, so the browser's
clock is what matters, and this harness has no way to override Chrome's timezone.

**The evidence that the fix works for a viewer outside Israel is the mutation run above**, where two
tests fail under `TZ=UTC` and pass under `TZ=Asia/Jerusalem`. Anyone re-verifying should re-run
that, not re-take these screenshots. Stated here rather than left for a reviewer to discover,
because "a screenshot of a real page" that proves something else is this repo's filed
false-certification class.

## Housekeeping

- `npm run build` was run in this checkout with **no dev server up** — the two share one `.next`
  (`rules/app.md`). The dev server on :3003 was started only afterwards, for the eyes-on pass.
- The throwaway MAYA probe written during this session (`scripts/tmp-probe-presentations.ts`) was
  deleted; `git status` confirms no residue.
