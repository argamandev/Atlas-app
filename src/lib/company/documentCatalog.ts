import type { RemoteSource } from '@/lib/maya/filings'

// ─────────────────────────────────────────────────────────────────────────────
// A COMPANY'S FILINGS, AS A DRILL-DOWN.
//
// Pure. The screen shows years → periods → artifacts, and every decision about
// WHICH filing fills a slot is made here so it can be tested without a network.
//
// A period legitimately offers more than one candidate about a quarter of the
// time — measured 2026-08-09 across 20 issuers over 2022-2026, 137 of 551
// (period, type) keys, once scheduling announcements are excluded. Every case
// is a second VERSION of one document rather than a second document: a Hebrew
// and an English edition, or a correction superseding its original. So one is
// chosen; the rule is `pickArtifact` and it is tested against the real rows.
// ─────────────────────────────────────────────────────────────────────────────

export type CatalogArtifact = {
  mayaReportId: number
  title: string
  publishedISO: string
  lang: 'he' | 'en'
}

export type CatalogPeriod = {
  /** `"Q1 2026"` · `"FY 2025"` — descriptive; identity is always mayaReportId. */
  period: string
  year: string
  report: CatalogArtifact | null
  slides: CatalogArtifact | null
  /** A transcript Atlas already holds for this period, if any. */
  transcriptId: string | null
}

/** Hebrew if the title contains a Hebrew letter — the only language signal MAYA gives. */
export function guessLang(title: string): 'he' | 'en' {
  return /[֐-׿]/.test(title) ? 'he' : 'en'
}

/**
 * HEBREW FIRST, THEN NEWEST.
 *
 * Hebrew first because Atlas reads Hebrew and the English edition is the SAME
 * document — nothing the user cannot otherwise reach is being hidden. (אלוני חץ
 * files both, and the English one is published a week LATER, so newest-only
 * would have shown an Israeli analyst the English statements.)
 *
 * Newest second because a correction — "דוח רבעון 1 לשנת 2026 - תיקון דוח" —
 * supersedes what it corrects and is published after it.
 *
 * Deliberately NOT MAYA's `isCorrection` flag: that marks the filing being
 * corrected, while publication order settles every ordering case including this
 * one, with no second rule to keep true.
 */
export function pickArtifact(candidates: RemoteSource[]): RemoteSource | null {
  if (candidates.length === 0) return null
  const sorted = [...candidates].sort((a, b) => {
    const la = guessLang(a.title) === 'he' ? 0 : 1
    const lb = guessLang(b.title) === 'he' ? 0 : 1
    if (la !== lb) return la - lb
    return a.publishedISO < b.publishedISO ? 1 : a.publishedISO > b.publishedISO ? -1 : 0
  })
  return sorted[0] ?? null
}

const toArtifact = (s: RemoteSource): CatalogArtifact => ({
  mayaReportId: s.mayaReportId,
  title: s.title,
  publishedISO: s.publishedISO,
  lang: guessLang(s.title),
})

/** `"Q1 2026"` → rank + year. A bare year (`"2025"`) is NOT a period — see below. */
function parsePeriod(period: string): { rank: number; year: string } | null {
  const m = period.match(/^(FY|Q1|Q2|Q3)\s+((?:19|20)\d{2})$/)
  if (!m) return null
  const rank = { Q1: 1, Q2: 2, Q3: 3, FY: 4 }[m[1] as 'FY' | 'Q1' | 'Q2' | 'Q3']
  return { rank, year: m[2]! }
}

/**
 * THERE IS NO Q4, and that is a property of the data rather than a design
 * choice: Israeli issuers file Q1, Q2, Q3 and then an annual report covering
 * the fourth quarter and the full year. `PERIOD_BY_EVENT` is built that way.
 *
 * A STANDALONE COMPANY DECK IS NOT A QUARTERLY ONE, and this is where that is
 * enforced. `periodFor` gives a filing tagged only `270 מצגת` a PUBLICATION-DATE
 * label (not a period code), so `parsePeriod` drops it here exactly as it dropped
 * the bare year before it — the "מצגת שוק ההון" filings published outside a
 * reporting cycle (דנאל filed four in 2023 alone). The founder placed those in the
 * same later bucket as announcements and webinars.
 *
 * Dropping them here has a second effect worth stating, because it is what
 * keeps this slice free of schema: every deck that can now be STORED carries a
 * real period label, so a year's decks can no longer collapse onto one
 * `(company_id, quarter, doc_type)` row.
 */
export function buildPeriods(
  sources: RemoteSource[],
  transcripts: { id: string; quarter: string }[]
): CatalogPeriod[] {
  const byPeriod = new Map<string, RemoteSource[]>()
  for (const s of sources) {
    if (!parsePeriod(s.period)) continue
    byPeriod.set(s.period, [...(byPeriod.get(s.period) ?? []), s])
  }

  const out: CatalogPeriod[] = []
  for (const [period, list] of Array.from(byPeriod.entries())) {
    const parsed = parsePeriod(period)!
    const report = pickArtifact(list.filter((s) => s.docType === 'report'))
    const slides = pickArtifact(list.filter((s) => s.docType === 'slides'))
    out.push({
      period,
      year: parsed.year,
      report: report ? toArtifact(report) : null,
      slides: slides ? toArtifact(slides) : null,
      transcriptId: transcripts.find((t) => t.quarter === period)?.id ?? null,
    })
  }

  // Newest year first, and within a year: Annual, Q3, Q2, Q1.
  return out.sort((a, b) => {
    if (a.year !== b.year) return a.year < b.year ? 1 : -1
    return parsePeriod(b.period)!.rank - parsePeriod(a.period)!.rank
  })
}

/**
 * The periods of one FISCAL year — not one publication year. A 2024 annual
 * report is published in March 2025, so the window that fetched it also
 * returned 2025's own periods; those belong to the 2025 row and are filtered
 * out here rather than shown under 2024.
 */
export function periodsForYear(periods: CatalogPeriod[], year: string): CatalogPeriod[] {
  return periods.filter((p) => p.year === year)
}
