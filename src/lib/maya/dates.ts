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
