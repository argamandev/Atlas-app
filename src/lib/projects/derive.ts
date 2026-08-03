import type { Dictionary } from '@/lib/i18n/dictionaries/en'
import {
  buildProjectContext,
  PROJECT_CONTEXT_BUDGET,
  type ProjectContextInput,
} from '@/lib/chat/projectContext'

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
 * The character ceiling actually injected into a chat inside a project — owned
 * by the injector (`@/lib/chat/projectContext`) and re-exported here so the
 * projects modules keep one import. `capacity` in the UI is this ratio, which is
 * the only thing that makes "14% of project capacity used" an honest sentence
 * rather than decoration.
 */
export { PROJECT_CONTEXT_BUDGET }

// Moved to @/lib/time/relative on 2026-08-03 when Workspace needed the same
// rule — a shared time helper should not live inside one feature. Re-exported
// so every existing caller and test keeps working unchanged.
export { relativeLabel, type Locale } from '@/lib/time/relative'
import { relativeLabel } from '@/lib/time/relative'
import type { Locale } from '@/lib/time/relative'

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

/**
 * What the meter measures is EXACTLY what the injector builds — same function,
 * so the two cannot disagree. Summing the raw fields instead (the old shape) was
 * an undercount: it missed the framing header, the label line per section and
 * every source NAME, so a project could show 97% while the server truncated it,
 * and the "Over capacity" warning never fired for the people who needed it.
 */
export function contextChars(input: ProjectContextInput): number {
  return buildProjectContext(input).fullLength
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
