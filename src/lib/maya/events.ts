// ─────────────────────────────────────────────────────────────────────────────
// WHAT COUNTS AS A DOCUMENT, AND WHAT IS MERELY SCHEDULE NEWS.
//
// Founder's choice, 2026-08-06: analyst-relevant kinds only. Tigbur filed 45
// things to MAYA in 2026 — shareholder registries, capital balances,
// interested-party holdings — and a list of 45 is not "easy and accessible",
// it is the "6 files that don't make sense" complaint at eight times the size.
//
// THE SPLIT BETWEEN document AND schedule IS THE LINE THE OTHER CONSUMERS READ.
// A conference-call announcement is not something to put on a shelf and read;
// it is how the calendar and the live-call engine learn a call is happening.
// Same vocabulary, two audiences, one file.
//
// Ids observed live on 2026-08-06. Treat this as a SAMPLE, not the complete
// table: MAYA publishes no endpoint for the full disclosure-event vocabulary
// (the `event-types` lookup is the *schedule* vocabulary, two rows, and a
// different thing). Anything unrecognised is therefore excluded rather than
// guessed at — a filing we cannot classify is not offered.
// ─────────────────────────────────────────────────────────────────────────────

export const EVENT_ANNUAL = 101 // דוח תקופתי ושנתי
export const EVENT_Q1 = 104 // דוח רבעון 1
export const EVENT_Q2 = 105 // דוח רבעון 2/חצי שנתי
export const EVENT_Q3 = 106 // דוח רבעון 3
export const EVENT_PRESENTATION = 270 // מצגת
export const EVENT_CONFERENCE_CALL = 233 // שיחת ועידה
export const EVENT_RELEASE_DATE = 113 // מועד פרסום דוחות

/** Things worth putting on a shelf and reading. */
export const DOCUMENT_EVENT_IDS: ReadonlySet<number> = new Set([
  EVENT_ANNUAL,
  EVENT_Q1,
  EVENT_Q2,
  EVENT_Q3,
  EVENT_PRESENTATION,
])

/** Things that tell us WHEN something happens — consumers ③ calendar, ④ live calls. */
export const SCHEDULE_EVENT_IDS: ReadonlySet<number> = new Set([EVENT_CONFERENCE_CALL, EVENT_RELEASE_DATE])

/** The period a report covers, from its event id. */
const PERIOD_BY_EVENT: Record<number, string> = {
  [EVENT_ANNUAL]: 'FY',
  [EVENT_Q1]: 'Q1',
  [EVENT_Q2]: 'Q2',
  [EVENT_Q3]: 'Q3',
}

export function isDocumentEvent(eventIds: number[]): boolean {
  return eventIds.some((id) => DOCUMENT_EVENT_IDS.has(id))
}

export function isScheduleEvent(eventIds: number[]): boolean {
  return eventIds.some((id) => SCHEDULE_EVENT_IDS.has(id))
}

/**
 * `slides` when the filing is a presentation, `report` for a financial report,
 * `null` when it is neither and therefore must not be offered.
 *
 * PRESENTATION WINS when both are present, and that is deliberate: a filing
 * tagged `104 + 270` is the Q1 *deck*, and calling it a report would put it in
 * the same slot as the actual Q1 statements.
 */
export function docTypeFor(eventIds: number[]): 'report' | 'slides' | null {
  if (eventIds.includes(EVENT_PRESENTATION)) return 'slides'
  if (eventIds.some((id) => PERIOD_BY_EVENT[id])) return 'report'
  return null
}

/**
 * A human label like `"Q1 2026"` or `"FY 2024"`.
 *
 * DESCRIPTIVE ONLY — identity is `maya_report_id`, never this string. That
 * matters: the year is read out of the title when the issuer stated one, and
 * they state it for exactly the case where the publication year is wrong (an
 * annual report for 2024 published in 2025). Falling back to the publication
 * year is a best effort, not a promise.
 */
export function periodFor(eventIds: number[], title: string | null, publishedISO: string): string {
  const period = eventIds.map((id) => PERIOD_BY_EVENT[id]).find(Boolean) ?? ''
  const fromTitle = title?.match(/\b(19|20)\d{2}\b/)?.[0]
  const year = fromTitle ?? String(new Date(publishedISO).getUTCFullYear())
  return period ? `${period} ${year}` : year
}
