import type { WsFileKind } from './data'

// ─────────────────────────────────────────────────────────────────────────────
// WHAT A TAB IS CALLED.
//
// Founder, 2026-08-05: *"documents names in the upper tab area needs to be
// viewed in a more fast and easy to understand way. It needs to be Q1 2024
// report and Q1 2026 transcript … calling it 'group to group investor calls'
// and piling three of those in the tabs makes it very confusing for the
// investor to toggle between the documents."*
//
// He is right and the reason is arithmetic: a shelf holds one company's filings
// across quarters, so every corpus title starts with the SAME forty characters
// ("קבוצת תיגבור - שיחת משקיעים - רבעון …") and the one part that differs — the
// quarter — is at the END, which is exactly what a truncated tab chip throws
// away. Three tabs then read as three copies of one word.
//
// So the tab shows what DISTINGUISHES the file: its quarter and its kind. The
// full corpus title is still the truth and still on the row — it moves to the
// tooltip and stays whole in the pane header and the file list.
//
// NOTHING IS INVENTED. `quarterOf` returns null when it cannot read a quarter,
// and the caller falls back to the stored name. A tab that confidently said
// "Q1 2026" about a file whose quarter we guessed would be worse than a long one.
// ─────────────────────────────────────────────────────────────────────────────

/** Hebrew ordinals as they appear in TASE call titles ("רבעון ראשון לשנת 2026"). */
const HE_ORDINAL: Record<string, number> = {
  ראשון: 1,
  שני: 2,
  שלישי: 3,
  רביעי: 4,
}

/**
 * The quarter this file is about — "Q1 2026", "FY 2025" — or null.
 *
 * Reads BOTH the Latin form the documents use and the Hebrew sentence the call
 * titles use. Deliberately conservative: a year with no quarter is only called
 * a full year when the title says so ("שנתי"/"annual"/"ושנת"), because a call
 * titled with a bare year is more often a mislabelled quarter than an annual.
 */
export function quarterOf(name: string): string | null {
  const s = name.trim()

  // "Q1 2026", "q1/2026", "Q1 FY2026" — the form the filings already use.
  const latin = s.match(/\bQ([1-4])\D{0,6}(20\d{2})\b/i)
  if (latin) return `Q${latin[1]} ${latin[2]}`

  // "רבעון רביעי ושנת 2025" — the ordinal and the year, in that order, with
  // anything between them. The Hebrew titles put ~10 characters in between.
  const he = s.match(/רבעון\s+(ראשון|שני|שלישי|רביעי)[\s\S]{0,20}?(20\d{2})/)
  if (he) {
    const q = HE_ORDINAL[he[1]]
    // "רבעון רביעי ושנת 2025" is the Q4 call AND the annual results — it is
    // filed as Q4, which is what an analyst looks for.
    if (q) return `Q${q} ${he[2]}`
  }

  // Annual only when it says annual. "דוח שנתי 2025", "Annual 2025".
  const annual = s.match(/(?:שנתי|annual|full[-\s]?year|FY)\D{0,6}(20\d{2})/i)
  if (annual) return `FY ${annual[1]}`

  return null
}

export type TabKind = 'transcript' | 'document'

/** Which word follows the quarter. Everything that is not a call reads as a document. */
export function kindOf(kind: WsFileKind): TabKind {
  return kind === 'transcript' ? 'transcript' : 'document'
}

/**
 * The chip's text.
 *
 * `labels` comes from the dictionary so this stays pure and both locales get
 * the same shape: "Q1 2026 · Transcript" / "‎Q1 2026 · תמליל".
 */
export function tabLabel(
  name: string,
  kind: WsFileKind,
  labels: { transcript: string; document: string }
): string {
  const quarter = quarterOf(name)
  // No quarter read ⇒ the stored name, untouched. Truncation is the tab bar's
  // job; guessing is nobody's.
  if (!quarter) return name
  return `${quarter} · ${labels[kindOf(kind)]}`
}
