import type { Dictionary } from '@/lib/i18n/dictionaries/en'

// ─────────────────────────────────────────────────────────────────────────────
// Label derivation for Projects — PURE, DOM-free, no I/O, so it is testable
// under node:test (this repo has no DOM test infrastructure).
//
// Nothing here is ever stored. The imported stub kept `updatedLabel: "2h ago"`
// and `memWhen: "Last updated 2 days ago"` as DATA, which would have frozen a
// relative label in the database forever. Facts go in columns; labels are
// computed at render from those columns.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The character ceiling actually injected into a chat inside a project.
 * `capacity` in the UI is this ratio — which is the only thing that makes
 * "14% of project capacity used" an honest sentence rather than decoration.
 */
export const PROJECT_CONTEXT_BUDGET = 8_000

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

/** Null `memoryUpdatedAt` means it genuinely never was — say so, do not invent a time. */
export function memoryLabel(
  memoryUpdatedAt: string | null,
  now: Date,
  locale: Locale,
  dict: Dictionary
): string {
  if (!memoryUpdatedAt) return dict.projects.memoryNever
  return dict.projects.memoryUpdated.replace('{when}', relativeLabel(memoryUpdatedAt, now, locale))
}

/** An empty note says it is empty rather than claiming a line count it does not have. */
export function lineMeta(body: string, dict: Dictionary): string {
  const trimmed = body.trim()
  if (!trimmed) return dict.projects.sourceEmpty
  const n = trimmed.split('\n').length
  // Both locales inflect at one: "1 lines" / "1 שורות" would ship straight to the UI.
  if (n === 1) return dict.projects.sourceLine
  return dict.projects.sourceLines.replace('{n}', String(n))
}

export function contextChars(input: { instructions: string; memory: string; bodies: string[] }): number {
  return input.instructions.length + input.memory.length + input.bodies.reduce((n, b) => n + b.length, 0)
}

/**
 * Clamped to the meter's range. Ask isOverBudget() for the fact it clamps away —
 * a bar pinned at 100% looks the same whether you are at the limit or ten times
 * past it, and only one of those is silently losing the user's instructions.
 */
export function capacityPercent(used: number): number {
  return Math.max(0, Math.min(100, Math.round((used / PROJECT_CONTEXT_BUDGET) * 100)))
}

export function isOverBudget(used: number): boolean {
  return used > PROJECT_CONTEXT_BUDGET
}
