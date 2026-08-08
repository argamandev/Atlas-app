// ─────────────────────────────────────────────────────────────────────────────
// THE REPORT SCHEDULE — MAYA's rows turned into calendar events.
//
// Pure functions over rows the caller fetched. No database, no network, no
// model: everything the calendar needs arrives structured from
// `financial-report-schedule/by-report-year`, which is why this file exists
// instead of a prose parser over announcement attachments.
//
// Measured against the live feed 2026-08-09 (925 rows, 2025+2026) — every claim
// in the comments below came from that run, not from the API guide.
// ─────────────────────────────────────────────────────────────────────────────

import type { MayaScheduleRow } from './types'

/** `financialReportTypeId` — the feed's own two-row `event-types` lookup. */
export const REPORT_TYPE_CONFERENCE_CALL = 1 // שיחת ועידה
export const REPORT_TYPE_PUBLICATION = 2 // פרסום דוחות

/** `periodTypeId` — the feed's `period-types` lookup, verified live. */
const PERIOD_LABEL: Record<number, string> = {
  1: 'Q1',
  2: 'Q2',
  3: 'Q3',
  4: 'FY',
}

/**
 * MAYA's `timeZone` is a two-letter tag, not an IANA zone.
 *
 * Distribution across 2025+2026: `IL` 380 · `US` 70 · null 475. The nulls are
 * almost entirely publications, which carry no time at all — so an unmapped tag
 * costs nothing as long as we refuse to invent a time for it (see below).
 *
 * `US` on a Tel-Aviv exchange is not a mistake: dual-listed issuers schedule
 * their call on US market hours. Reading one of those as Israeli time moves the
 * call by seven hours, and nothing on screen would look wrong.
 */
const ZONE_BY_TAG: Record<string, string> = {
  IL: 'Asia/Jerusalem',
  US: 'America/New_York',
}

export type CalendarEventKind = 'call' | 'report' | 'webinar'

export interface ScheduleEvent {
  issuerId: number
  kind: CalendarEventKind
  /** UTC instant. When `timeKnown` is false this is midnight Israel time on the date — a bucket, not a claim. */
  scheduledAtUtc: string
  /** FALSE means MAYA published a date and no time. The UI must not print a clock. */
  timeKnown: boolean
  /** Human label like `"Q2 2026"`. Empty when the period id is unknown. */
  quarter: string
  mayaYear: number
  mayaPeriodTypeId: number
  mayaReportTypeId: number
}

/**
 * Wall-clock in a named zone → a UTC instant.
 *
 * WHY NOT `new Date("2026-08-10T10:00:00")`: that is parsed in the SERVER's zone,
 * so the same row would land on a different instant depending on where the sync
 * ran. And a fixed offset (+03:00) is wrong for half the year in both zones —
 * Israel and New York each observe DST, on DIFFERENT dates.
 *
 * The method: ask `Intl` what the given UTC instant looks like in the target
 * zone, measure how far that is from the wall clock we wanted, and shift. One
 * correction pass is enough except exactly at a DST transition, so we run a
 * second — after which the result is stable (the offset can only change once).
 */
export function zonedWallClockToUtc(dateISO: string, timeHHMMSS: string, ianaZone: string): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const [hh, mm, ss] = (timeHHMMSS || '00:00:00').split(':').map(Number)
  const wanted = Date.UTC(y!, m! - 1, d!, hh ?? 0, mm ?? 0, ss ?? 0)

  let guess = wanted
  for (let i = 0; i < 2; i++) {
    const seen = wallClockOf(guess, ianaZone)
    const drift = seen - guess
    if (drift === 0) break
    guess = wanted - drift
  }
  return new Date(guess).toISOString()
}

/** What `instant` reads as on a wall clock in `zone`, expressed as a UTC-epoch of those digits. */
function wallClockOf(instant: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(instant))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  // Intl renders midnight as hour 24 in some ICU versions; normalise it.
  const hour = get('hour') % 24
  return Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
}

/**
 * One feed row → one calendar event, or `null` if the row cannot be trusted.
 *
 * Returns null rather than guessing when the date is missing or unparseable: a
 * calendar entry on the wrong day is worse than one that is absent, because the
 * analyst cannot see that it is wrong.
 */
export function toScheduleEvent(row: MayaScheduleRow): ScheduleEvent | null {
  if (!row?.scheduledDate || !/^\d{4}-\d{2}-\d{2}$/.test(row.scheduledDate)) return null
  if (typeof row.issuerId !== 'number') return null

  // THE WHOLE KEY OR NOTHING. `year` and `periodTypeId` are unvalidated wire
  // fields. A row missing either would be written with a NULL in the natural
  // key, and NULLs are DISTINCT in a unique constraint — so it would conflict
  // with nothing and be re-inserted on every nightly run, accumulating
  // duplicates that DELETE (hook-blocked) could not remove. Refusing the row
  // costs one calendar entry; accepting it costs a table nobody can clean.
  if (!Number.isFinite(row.year) || !Number.isFinite(row.periodTypeId)) return null
  if (!Number.isFinite(row.financialReportTypeId)) return null

  const isCall = row.financialReportTypeId === REPORT_TYPE_CONFERENCE_CALL

  // A TIME IS ONLY KNOWN WHEN MAYA GAVE US BOTH A CLOCK AND A ZONE. Publications
  // give neither (0 of 472). Two of 925 rows carry a time with no zone — those
  // are treated as unknown rather than assumed Israeli, because the whole point
  // of this flag is that a guess and a fact must not look alike.
  const zone = row.timeZone ? ZONE_BY_TAG[row.timeZone] : undefined
  const timeKnown = Boolean(isCall && row.scheduledTime && zone)

  const scheduledAtUtc = timeKnown
    ? zonedWallClockToUtc(row.scheduledDate, row.scheduledTime!, zone!)
    : // Midnight ISRAEL time, not UTC: the date is the fact, and bucketing it in
      // the exchange's own zone keeps it on the day MAYA published for every
      // reader west of Jerusalem.
      zonedWallClockToUtc(row.scheduledDate, '00:00:00', 'Asia/Jerusalem')

  const period = PERIOD_LABEL[row.periodTypeId] ?? ''
  return {
    issuerId: row.issuerId,
    kind: isCall ? 'call' : 'report',
    scheduledAtUtc,
    timeKnown,
    quarter: period && row.year ? `${period} ${row.year}` : '',
    mayaYear: row.year,
    mayaPeriodTypeId: row.periodTypeId,
    mayaReportTypeId: row.financialReportTypeId,
    // NOTE: `row.url` (the MAYA announcement, present on 803 of 925 rows) is
    // deliberately NOT carried. There is no column for it and no reader, and a
    // field computed into a shape nobody consumes is the "backend with zero
    // callers" this lane filed on 2026-08-07. It is a good candidate for the
    // company-pages merge, which will have somewhere to put it.
  }
}

export interface DedupeResult {
  kept: ScheduleEvent[]
  /** Rows dropped as superseded. Returned, never swallowed — a silent drop reads as complete coverage. */
  superseded: ScheduleEvent[]
}

/**
 * Collapse the feed's superseded entries.
 *
 * MEASURED: 34 of 925 rows collide on (issuer, year, period, type). Three real
 * shapes, all seen: a byte-identical duplicate (issuer 1328); the same call at
 * two times in two zones (issuer 1894 — 16:30 IL and 15:30 US); and a call that
 * MOVED, listed on both 13 April and 13 May (issuer 281, ICL, Q1 2026).
 *
 * The last one is the problem: the feed carries the old date and the new one
 * with NO revision number and NO announcement timestamp, so nothing in the data
 * says which is operative. **Keeping the latest date is a judgment call, not a
 * fact** — schedules slip later far more often than earlier. It is recorded as
 * such in the spec, and the losers are RETURNED rather than dropped so the
 * caller can log how many it set aside.
 *
 * Importing both would put one company on the calendar twice for one earnings
 * call, which is the outcome an analyst can neither explain nor ignore.
 */
export function dedupeSchedule(events: ScheduleEvent[]): DedupeResult {
  const best = new Map<string, ScheduleEvent>()
  const superseded: ScheduleEvent[] = []

  for (const e of events) {
    const key = `${e.issuerId}|${e.mayaYear}|${e.mayaPeriodTypeId}|${e.mayaReportTypeId}`
    const held = best.get(key)
    if (!held) {
      best.set(key, e)
      continue
    }
    if (e.scheduledAtUtc > held.scheduledAtUtc) {
      superseded.push(held)
      best.set(key, e)
    } else {
      superseded.push(e)
    }
  }

  return { kept: Array.from(best.values()), superseded }
}
