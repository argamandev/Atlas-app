// ─────────────────────────────────────────────────────────────────────────────
// Relative time labels — PURE, DOM-free, no I/O.
//
// Lived in src/lib/projects/derive.ts until 2026-08-03, when Workspace needed
// the identical rule. Importing a time helper *from Projects* is a boundary
// that should not exist, so it moved here; `projects/derive` re-exports it and
// no caller changed.
//
// Nothing that uses this is ever stored. Facts go in columns (`updated_at`);
// labels are computed at render. The imported stubs kept `updatedLabel: "2h
// ago"` as DATA, which would have frozen a relative label in the database
// forever — the first thing every backend chapter here has had to undo.
// ─────────────────────────────────────────────────────────────────────────────

export type Locale = 'en' | 'he'

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3_600_000],
  ['month', 30 * 24 * 3_600_000],
  ['day', 24 * 3_600_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

/**
 * "2 hours ago" / "לפני שעתיים". Intl does the localisation, so Hebrew is
 * correct without a dictionary key per unit per plural form.
 */
export function relativeLabel(iso: string, now: Date, locale: Locale): string {
  const diff = now.getTime() - new Date(iso).getTime()
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(-Math.round(diff / ms), unit)
  }
  return rtf.format(0, 'minute')
}
