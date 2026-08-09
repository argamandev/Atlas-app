# fix/israel-time — the production hotfix, recorded after the fact

⚠ **THIS FILE IS A RECONSTRUCTION, NOT A CONTEMPORANEOUS RECORD.** The hotfix
(`796fdbd`, merged 2026-08-09 ~16:45 by the supervisor) shipped with **no `docs/evidence/`
folder**, and the merge gate filed that as owed. It is written here by Lane M on
`fix/israel-time-residue`, the branch that closes the hotfix's residue.

**Every claim below is sourced from an artefact, not from memory**, and the source is named
inline. Nothing in this file was observed live by its author — the one thing a reconstruction can
honestly offer is traceability, so where the original record would have had a screenshot, this
says so instead of describing one.

---

## What was wrong, in production

`www.timlul-ai.com` listed **every investor call three hours early** on Home. יעקב פיננסים's call
read `07:00` for a row the database puts at `10:00` Israel time, while the **calendar rendered the
same event as `10:00`** — two surfaces, one event, three hours apart.

*Source: the `[2026-08-09 16:45]` MERGE entry in `agent-memory/cross-cutting.md`, and the board's
`[supervisor 2026-08-09 16:45]` note.*

## Cause

The formatters in `src/lib/i18n/format.ts` pinned **no `timeZone`**, so each used whatever runtime
called it.

- **Home is a Server Component.** It formatted on Railway — UTC — and handed the browser a
  **finished string** the browser never re-formats. Three hours early, for everyone.
- **The calendar is a client component.** It formatted in the browser and was correct.

**It could not be seen on any machine in Israel, which is every machine this was developed on.**

*Source: the docstring on `ISRAEL_TZ` in `src/lib/i18n/format.ts`, written at the fix, and the
header comment of `src/lib/i18n/format.test.ts`.*

## The fix

`796fdbd`, 5 files, +192 / −18 (`git show --stat`):

```
package.json                             |  2 +-
src/components/calendar/CalendarView.tsx | 31 +++++----
src/lib/i18n/format.test.ts              | 91 ++++++++++++++++++++++++++
src/lib/i18n/format.ts                   | 77 +++++++++++++++++++---
src/lib/utils.ts                         |  9 ++++
```

- `ISRAEL_TZ = 'Asia/Jerusalem'` introduced and pinned into `formatTime`, `formatDate`,
  `greetingKey`, `formatRelativeDays`.
- `israelDayKey()` and `israelMonthParts()` added as the bucketing primitives, so a day or month
  window is never taken from local date parts.
- `formatDate` places `timeZone` **last** in its options object so a caller's `opts` cannot
  override it.
- `CalendarView` moved to `israelDayKey` / `israelMonthParts` for day bucketing and month
  membership.

## Founder decision behind it

**Call times are always Israel time, for every viewer in every timezone** — a 10:00 call reads
10:00 in Tel Aviv, New York and London. Asked directly with both options and their consequences in
front of him; the viewer-local alternative was rejected and must not be reintroduced per-surface.

Rationale taken with the choice: it matches how TASE and Israeli issuers publish, and it means
Home, the calendar and the company page **cannot disagree** about the same event.

*Source: the `[2026-08-09 16:05] DECISION` entry in `agent-memory/cross-cutting.md`, quoting him.*

## Gates at the time

Battery green in **both** timezones — **618/618** under `TZ=UTC` and under `Asia/Jerusalem`.

*Source: the `[2026-08-09 16:45]` cross-cutting MERGE entry. The count differs from today's 625
because `fix/israel-time-residue` adds seven tests.*

⚠ **The gate that mattered was not a gate.** The whole battery, `tsc` and the build were green
**while production was wrong** — the bug was found by looking at the deployed site. That is the
lesson the fleet took, and it is why the rule filed in `.claude/rules/app.md` is *never format an
instant without a timeZone*, and why every formatter must now be tested under `TZ=UTC` and not only
on a laptop that happens to sit in Israel.

## What it did not close

Three date **comparisons** were left reading the runtime's midnight, all filed by the merge gate as
open and none affecting an Israeli viewer — which is exactly why the wrong time shipped first:

1. the calendar today-pill,
2. `CompanyOverview.isFuture`,
3. `lib/db/calls.ts` `scope:'upcoming'`, which floored at UTC midnight.

**All three are closed by `fix/israel-time-residue`** — see
`docs/evidence/fix-israel-time-residue/2026-08-09-israel-time-residue.md`, which also records that
(3) was silently hiding **every report due today** from the upcoming feed.
