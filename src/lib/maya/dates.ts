import { MAYA_MAX_RANGE_DAYS } from './config'

// ─────────────────────────────────────────────────────────────────────────────
// TWO FACTS ABOUT MAYA SHAPE THIS ENTIRE FILE, and both were found by probing
// the live API rather than by reading a document.
//
// 1. THE RANGE CAP IS REAL. `by-issuer` answers a 380-day window with
//    HTTP 400 and `{"ToDate":["The date range cannot exceed 1 year."]}`. So a
//    multi-year request is several calls, never one wide one.
//
// 2. AN ANNUAL REPORT IS FILED IN THE FOLLOWING YEAR. Tigbur's 2024 periodic
//    report was published 2025-03-30. Asking MAYA for the 2024 calendar year
//    alone therefore returns the *2023* annual report — the founder's exact
//    failing case. Hence `+1`.
//
// WHAT THIS DELIBERATELY DOES NOT DO is model fiscal calendars. It widens the
// window and lets the selection step read the period out of the Hebrew title,
// which states it outright ("דוח תקופתי ושנתי לשנת 2024"). Reading years and
// quarters out of titles is already a rule that step follows, and a title the
// issuer wrote beats a rule we invented about when Israeli companies report.
// ─────────────────────────────────────────────────────────────────────────────

export type DateWindow = { from: string; to: string }

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/**
 * One window per calendar year covering `fromYear` … `toYear + 1`.
 *
 * Never wider than the API's cap, so the caller can issue each window without
 * checking. A reversed range is treated as a slip and normalised rather than
 * returning nothing — the same choice `parseRequest` already makes.
 */
export function yearWindows(fromYear: number, toYear: number): DateWindow[] {
  const lo = Math.min(fromYear, toYear)
  // `+1` is the late-filing rule above, not an off-by-one.
  const hi = Math.max(fromYear, toYear) + 1

  const out: DateWindow[] = []
  for (let y = lo; y <= hi; y++) out.push({ from: iso(y, 1, 1), to: iso(y, 12, 31) })
  return out
}

/** Guard used by the tests, and cheap enough to keep as a runtime assertion of
 *  the one API constraint that silently turns a search into a 400. */
export function windowDays(w: DateWindow): number {
  return (Date.parse(w.to) - Date.parse(w.from)) / 86_400_000
}

export function windowIsLegal(w: DateWindow): boolean {
  return windowDays(w) <= MAYA_MAX_RANGE_DAYS
}

// ─────────────────────────────────────────────────────────────────────────────
// A THIRD PROBED FACT: MAYA's `publicationDate` carries NO ZONE.
// `"publicationDate": "2026-05-27T11:27:00.52"` — a naive local datetime from
// the Tel Aviv exchange, i.e. Israel time. Handing that string to a
// `timestamptz` column makes Postgres read it in the SESSION zone, which on
// Supabase is UTC — so the stored instant is 2–3 hours off, and Atlas renders
// Israel time for every viewer (app.md, founder decision 2026-08-09), which
// means the error is visible on screen.
//
// Fixed HERE, at the door the fact enters Atlas through, so the ingest path and
// the A4 backfill cannot disagree about what a publication date means (M3.1).
// ─────────────────────────────────────────────────────────────────────────────

const ISRAEL_TZ = 'Asia/Jerusalem'

/**
 * MAYA's zone-less publication datetime → a true ISO instant.
 *
 * The offset is DERIVED per date rather than hardcoded: Israel is +02:00 in
 * winter and +03:00 under DST, and this corpus spans a decade of filings on
 * both sides of every changeover. A string that already carries a zone, or one
 * this cannot parse, is returned untouched — guessing at an unrecognised shape
 * is how a wrong instant gets stored confidently.
 */
export function israelInstant(naive: string | null | undefined): string | null {
  if (!naive) return null
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(naive)) return naive
  const m = naive.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/)
  if (!m) return naive

  const [, y, mo, d, h, mi, s = '00'] = m
  // Read the wall-clock as UTC first, then ask what that instant looks like in
  // Israel: the difference IS the offset in force on that date, DST included.
  const asUtc = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)
  const shown = new Intl.DateTimeFormat('en-US', {
    timeZone: ISRAEL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(asUtc)
  const part = (t: string) => Number(shown.find((p) => p.type === t)?.value)
  const israelAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour') % 24,
    part('minute'),
    part('second')
  )
  const offsetMs = israelAsUtc - asUtc
  const ms = m[7] ? Number(`0.${m[7]}`) * 1000 : 0
  return new Date(asUtc - offsetMs + ms).toISOString()
}
