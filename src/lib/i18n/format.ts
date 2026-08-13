import type { Locale } from './config'

// Locale-aware formatting. Numbers, dates and times must read naturally in both
// languages (brief §2). Intl is available on both server and client.

const localeTag: Record<Locale, string> = { en: 'en-US', he: 'he-IL' }

/**
 * ⚠ ATLAS RENDERS ISRAEL TIME, ALWAYS, FOR EVERY VIEWER.
 *
 * Founder decision 2026-08-09 (filed in `DECISIONS.md`): a call
 * at 10:00 Israel time reads 10:00 in Tel Aviv, New York and London. TASE and
 * Israeli issuers publish in Israel time, and a per-viewer value would let Home,
 * the calendar and the company page disagree about the same event.
 *
 * ⚠ THIS CONSTANT EXISTS BECAUSE ITS ABSENCE SHIPPED TO PRODUCTION. These
 * formatters pinned no `timeZone`, so they used whatever runtime called them.
 * Home is a SERVER Component: it formatted on Railway (UTC) and passed the
 * client a finished string the browser never re-formats — so
 * `www.timlul-ai.com` listed **every investor call three hours early**
 * (יעקב פיננסים's 10:00 call read 07:00) while the calendar, a client
 * component, rendered the same row correctly from the browser's clock. Two
 * surfaces, one event, three hours apart, found by looking at the deployed site
 * on 2026-08-09.
 *
 * ⇒ NEVER format an instant without a timeZone. "It works locally" means only
 * that your laptop is in Israel; the server is not.
 */
export const ISRAEL_TZ = 'Asia/Jerusalem'

/** The Israel-time parts of an instant, as numbers. One place doing the lookup. */
function israelParts(d: Date): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ISRAEL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const out: Record<string, number> = {}
  for (const p of parts) if (p.type !== 'literal') out[p.type] = Number(p.value)
  // `hour12:false` yields hour 24 for midnight in some ICU versions.
  if (out.hour === 24) out.hour = 0
  return out
}

const asDate = (d: Date | string): Date => (typeof d === 'string' ? new Date(d) : d)

/** `YYYY-MM-DD` of the ISRAEL day an instant falls in — the calendar's bucket key. */
export function israelDayKey(d: Date | string): string {
  const p = israelParts(asDate(d))
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** The Israel year and 0-based month of an instant, for month-window filtering. */
export function israelMonthParts(d: Date | string): { year: number; month: number } {
  const p = israelParts(asDate(d))
  return { year: p.year, month: p.month - 1 }
}

/**
 * Wall-clock in a named zone → a UTC instant. THE one conversion in this repo.
 *
 * WHY NOT `new Date("2026-08-10T10:00:00")`: that is parsed in the SERVER's zone,
 * so the same row would land on a different instant depending on where the code
 * ran. And a fixed offset (+03:00) is wrong for half the year in every zone that
 * observes DST — Israel and New York do, on DIFFERENT dates.
 *
 * The method: ask `Intl` what a given UTC instant looks like in the target zone,
 * measure how far that is from the wall clock we wanted, and shift. One
 * correction pass is enough except exactly at a DST transition, so we run a
 * second — after which the result is stable (the offset can only change once).
 *
 * It lives HERE, zone-parameterised, rather than beside either caller: it was
 * written in `lib/maya/schedule.ts` for the IL/US calendar feed, and slice A4
 * then grew a SECOND two-pass probe in `lib/i18n` for MAYA publication dates
 * whose author did not know this one existed — and the copy dropped a pass. Two
 * implementations of "what time is it really" is the defect; one file naming the
 * zone does not prevent it, so the conversion itself is what got unified.
 * `schedule.ts` imports this.
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
 * The instant at which an Israel calendar day BEGINS, as a real timestamp.
 *
 * The inverse of `israelDayKey`, and it exists for the one caller that needs a
 * genuine instant rather than a key: `listCalls({scope:'upcoming'})` filters in
 * SQL, and Postgres compares timestamps, not `YYYY-MM-DD` strings. Everywhere
 * that can compare day KEYS should keep doing that — it needs no offset at all.
 *
 * ⚠ THE OFFSET IS PROBED, NEVER HARDCODED — see `zonedWallClockToUtc`, which is
 * where the probing and its two passes live. Israel is UTC+2 in winter and UTC+3
 * under DST, and the transition dates move each year.
 */
export function israelDayStart(dayKey: string): Date {
  return new Date(zonedWallClockToUtc(dayKey, '00:00:00', ISRAEL_TZ))
}

/**
 * A zone-less Israel wall clock → the real instant it names.
 *
 * `israelDayStart` generalised past midnight — same conversion, any time of day.
 *
 * ITS CALLER: MAYA's `publicationDate` (`lib/maya/filings.ts`) arrives as
 * `2026-05-27T11:27:00.52` with no zone — the Tel Aviv exchange's local time.
 * Handed to a `timestamptz` column it would be read in the session zone (UTC on
 * Supabase) and stored 2–3 hours wrong, on a product that renders Israel time to
 * every viewer.
 *
 * A string that already carries a zone, or one this cannot parse, is returned
 * untouched — guessing at an unrecognised shape is how a wrong instant gets
 * stored confidently.
 */
export function israelInstant(wallClock: string | null | undefined): string | null {
  if (!wallClock) return null
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(wallClock)) return wallClock
  const m = wallClock.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/)
  if (!m) return wallClock

  const [, y, mo, d, h, mi, s = '00'] = m
  const iso = zonedWallClockToUtc(`${y}-${mo}-${d}`, `${h}:${mi}:${s}`, ISRAEL_TZ)
  // Sub-second precision rides along untouched: zone offsets are whole minutes.
  const ms = m[7] ? Math.round(Number(`0.${m[7]}`) * 1000) : 0
  return ms ? new Date(Date.parse(iso) + ms).toISOString() : iso
}

export type GreetingKey = 'morning' | 'afternoon' | 'evening'

export function greetingKey(date = new Date()): GreetingKey {
  // Israel hours, not the runtime's: this renders on the server, where
  // `getHours()` is UTC and would greet the founder three hours out of step.
  const h = israelParts(date).hour
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

/**
 * AN INSTANT WE DO NOT HAVE FORMATS AS NOTHING, NOT AS A CRASH.
 *
 * `Intl.DateTimeFormat().format(new Date(''))` throws `RangeError: Invalid time
 * value`, which takes down whatever is rendering — and a missing date is
 * ordinary: a period reached from the documents catalog with no transcript has
 * no call date at all. Found 2026-08-09 when that route 500'd behind 649
 * passing tests, a clean tsc and a green build.
 *
 * Empty is also what the call sites were already written for: both read
 * `[a, formatDate(...)].filter(Boolean)`. Returning '' is not hiding a failure —
 * it is the honest rendering of "no date", and the alternative of inventing one
 * (today, the epoch) is the fabrication class this codebase refuses.
 */
function isRealDate(d: Date): boolean {
  return !Number.isNaN(d.getTime())
}

export function formatTime(d: Date | string, locale: Locale): string {
  const date = asDate(d)
  if (!isRealDate(date)) return ''
  // V2 (Claude Design): times are mono data — always 24h ("14:00"), both locales.
  return new Intl.DateTimeFormat(localeTag[locale], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ISRAEL_TZ,
  }).format(date)
}

export function formatDate(
  d: Date | string,
  locale: Locale,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
): string {
  const date = asDate(d)
  if (!isRealDate(date)) return '' // see isRealDate — a missing date is not a crash
  // `timeZone` last so it cannot be overridden by a caller's opts — a report
  // stored at Israel midnight reads as the PREVIOUS day in UTC.
  return new Intl.DateTimeFormat(localeTag[locale], { ...opts, timeZone: ISRAEL_TZ }).format(date)
}

export function formatMonthYear(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag[locale], { month: 'long', year: 'numeric' }).format(d)
}

export function formatWeekday(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTag[locale], { weekday: 'short' }).format(d)
}

// Compact relative time for the activity feed ("2h", "1d"). Numbers stay LTR.
export function relativeShort(d: Date | string, now = new Date()): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const diffMs = now.getTime() - date.getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.round(hr / 24)
  return `${day}d`
}

// Locale-aware "starts in N days" pill for upcoming calls. numeric:'auto' gives the
// natural "tomorrow"/"מחר", "today"/"היום" forms; otherwise "in 4 days"/"בעוד 4 ימים".
export function formatRelativeDays(d: Date | string, locale: Locale, now = new Date()): string {
  // ISRAEL DAYS, not the runtime's. "Tomorrow" has to mean the next Israel
  // trading day for everyone — otherwise a viewer west of Israel is told a call
  // is tomorrow on the morning it is actually happening. Comparing the day KEYS
  // (not local midnights) is what makes this independent of where it runs.
  const toUTCNoon = (key: string) => Date.parse(`${key}T12:00:00Z`)
  const days = Math.round((toUTCNoon(israelDayKey(d)) - toUTCNoon(israelDayKey(now))) / 86400000)
  return new Intl.RelativeTimeFormat(localeTag[locale], { numeric: 'auto' }).format(days, 'day')
}

// mm:ss / h:mm:ss for the media player + transcript timestamps.
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hrs = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = s % 60
  const mm = String(mins).padStart(hrs > 0 ? 2 : 1, '0')
  const ss = String(secs).padStart(2, '0')
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`
}
