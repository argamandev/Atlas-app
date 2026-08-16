import { israelDayKey, israelInstant } from '@/lib/i18n/format'

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

/**
 * THE CODES A FILING CARRIES, in a fixed order rather than the feed's.
 *
 * This reader used to take whatever MAYA happened to list FIRST (`.find(Boolean)`
 * over the raw array), so a filing carrying two codes could be labelled `FY` or
 * `Q2` depending on transport order — a fact about the feed, not the document.
 * NO SUCH FILING WAS FOUND in the live data (issuer 314, 2025-2026, both years),
 * so this closes a fragility rather than a sighting.
 *
 * THE ORDER IS `filingKind`'s, deliberately (events.ts, annual before quarters).
 * An earlier pass here put quarters first and was caught at review: the catalog
 * would have shelved a `[101,105]` filing under `Q2` while the backfill selected
 * it as that company's ANNUAL, which is two readers of one field disagreeing.
 * `periodFor` does not get to invent a third precedence.
 */
const PERIOD_CODE_ORDER: readonly number[] = [EVENT_ANNUAL, EVENT_Q1, EVENT_Q2, EVENT_Q3]

/** The last day the period named by `code` covers, as an Israel day key. */
function periodEndDay(code: string, year: string): string {
  if (code === 'Q1') return `${year}-03-31`
  if (code === 'Q2') return `${year}-06-30`
  if (code === 'Q3') return `${year}-09-30`
  return `${year}-12-31` // FY
}

/**
 * A NOTICE THAT SOMETHING WILL BE PUBLISHED IS NOT THE THING.
 *
 * `113 מועד פרסום דוחות` announces a FUTURE filing, and it always carries the
 * event id of the report it is announcing — that is how it says WHICH report.
 * Which is exactly why it was being admitted as that report: the rule below is
 * "any whitelisted event", and `[104, 113]` has one.
 *
 * Measured 2026-08-09, 20 issuers over 2022-2026: **80 of the 814 filings
 * `toRemoteSources` offered carried 113, and every one was a scheduling
 * notice** — "מועד פרסום דוח רבעון 1 לשנת 2026 ושיחת ועידה ביום 27.5.26". None
 * was a presentation. A user browsing a company's Q1 2026 could therefore open
 * "the report" and get a one-page announcement of when the report was due.
 *
 * The header of this file has always said these belong to the calendar rather
 * than to a shelf, and `SCHEDULE_EVENT_IDS` has always held 113. This is the
 * line that makes the code agree with the sentence.
 */
export function isAnnouncement(eventIds: number[]): boolean {
  return eventIds.includes(EVENT_RELEASE_DATE)
}

export function isDocumentEvent(eventIds: number[]): boolean {
  if (isAnnouncement(eventIds)) return false
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
 * WHICH OF THE THREE APPROVED CLASSES a filing belongs to — the fact the backfill
 * selector decides "latest of each" on.
 *
 * READ OFF THE EVENT IDS, NEVER OFF THE `.xbrl` ATTACHMENT. That is a measured
 * rule, not a preference: the 2026-08-13 volume probe found ICL — a dual-listed
 * issuer — filing 61 disclosures with ZERO xbrl attachments, because foreign-track
 * issuers have no ISA XBRL at all. Detecting "this is a real financial statement"
 * by the presence of an instance would have silently dropped every one of them
 * from the corpus while looking like it worked.
 *
 * `null` for anything else, including a `113` scheduling notice — which carries the
 * event id of the report it ANNOUNCES, and would otherwise be selected as that
 * report (the defect `isAnnouncement` exists for).
 *
 * PRESENTATION WINS over a report code, exactly as `docTypeFor` resolves it: a
 * filing tagged `104 + 270` is the Q1 deck, and counting it as the Q1 report would
 * let a slide deck displace the actual statements as "the latest quarterly".
 */
export function filingKind(eventIds: number[]): 'annual' | 'quarterly' | 'presentation' | null {
  if (isAnnouncement(eventIds)) return null
  if (eventIds.includes(EVENT_PRESENTATION)) return 'presentation'
  if (eventIds.includes(EVENT_ANNUAL)) return 'annual'
  if (eventIds.some((id) => id === EVENT_Q1 || id === EVENT_Q2 || id === EVENT_Q3)) return 'quarterly'
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
  const codes = PERIOD_CODE_ORDER.filter((id) => eventIds.includes(id)).map((id) => PERIOD_BY_EVENT[id]!)
  const period = codes[0] ?? ''
  // Israel time, from the one file allowed to know what that means (app.md's Time
  // laws). This also closes a listed UTC leak: the previous `getUTCFullYear` put a
  // filing published in the first hours of 1 January into the wrong fiscal year.
  // GUARDED, because this now runs on a RAW MAYA field on a live request path.
  // israelDayKey throws RangeError on an unparseable string, and toRemoteSources feeds
  // it whatever the feed sent — so one malformed publicationDate would 500
  // GET /api/companies/[id]/filings, where the old getUTCFullYear merely produced a
  // harmless NaN. A label is descriptive by contract; it is never worth an outage.
  let day = ''
  try {
    day = israelDayKey(israelInstant(publishedISO) ?? publishedISO)
  } catch {
    day = ''
  }

  const titleYear = title?.match(/\b(19|20)\d{2}\b/)?.[0]

  // ── A PERIOD THAT HAD NOT ENDED YET IS NOT A PERIOD THIS FILING CAN BE ABOUT ──
  //
  // The code and the year come from two INDEPENDENT sources — the code off the
  // event ids, the year off a regex on the title — and nothing made them agree.
  // Measured on דנאל (issuer 314), live feed: `מצגת שוק ההון- מאי 2026` is tagged
  // `[101 דוח תקופתי ושנתי, 270 מצגת]` and published 2026-05-19, so the annual
  // code met the "2026" of a MONTH NAME and produced `FY 2026` — an annual report
  // for a year that was seven months from ending. `parsePeriod` accepts it, `FY`
  // ranks top of its year, and the documents tab led with **שנתי 2026**. The same
  // filing is already stored that way in `company_documents`.
  //
  // The honest test is a fact, not a vocabulary: a filing cannot report on a period
  // that had not finished when it was published.
  //
  // ⚠ IT IS ASKED OF DECKS ONLY, AND ONLY AGAINST A YEAR THE ISSUER STATED. Both
  // restrictions were bought by measuring, after a cold review called the first
  // version a BLOCKER for refusing far more than it fixed.
  //
  // WHY DECKS ONLY — the two titles say different KINDS of thing. `מצגת שוק ההון -
  // מרץ 2026` names WHEN THE DECK WAS MADE; `דוח רבעון 1 לשנת 2026` names WHAT
  // PERIOD IT COVERS. Only in the first does the title's year mean something other
  // than a fiscal period, so only there can it disagree with the event code. Asking
  // it of reports assumes fiscal quarters are calendar quarters, and they are not:
  // measured across all 233 issuers and 8,804 filings, that assumption threw out
  // פרוספקט's real results — a foreign-track issuer whose fiscal Q3 2026 genuinely
  // ended 31.3.26 — while every other report it refused was a FORECAST wearing the
  // annual code (בזק's `תחזית לשנת 2025`, filed in 2025). Those are a separate
  // defect, filed in `docs/open-findings.md`, not this one.
  //
  // WHY A STATED YEAR ONLY — with no year in the title the year is INFERRED from the
  // publication date, and the test would compare the label against its own input.
  // For `FY` that can never pass: an annual filed in 2025 asked whether 2025 had
  // ended by 2025. A guess is not evidence, so a guessed year buys no refusal.
  // → M3.2: decide on the fact, never on a proxy for it.
  //
  // A deck carrying SEVERAL codes tries each, so an impossible one costs it a label
  // rather than its place.
  //
  // NOT A GUESS AT THE RIGHT PERIOD. Deciding the דנאל deck is "really" FY 2025
  // would invent a fact neither source states; declining to claim a period does not
  // — it falls to the publication-date label below, which is what `documentCatalog`
  // already wants for a standalone `מצגת שוק ההון` (it names דנאל on that point).
  if (period) {
    // Undatable filing, or a year we inferred ⇒ the check cannot be run honestly,
    // so the label is exactly what it was before this rule existed.
    if (!day || !titleYear || !eventIds.includes(EVENT_PRESENTATION)) {
      return `${period} ${titleYear ?? day.slice(0, 4)}`.trim()
    }
    const possible = codes.find((c) => day > periodEndDay(c, titleYear))
    if (possible) return `${possible} ${titleYear}`
  }

  // ── NO PERIOD CODE: A DECK, AND ITS PUBLICATION DATE IS WHAT TELLS TWO APART ──
  //
  // Filings with no quarter/annual event id are presentations tagged only
  // `270 מצגת`. This used to return the bare YEAR, which meant every deck a
  // company filed in one year got the same period — and `company_documents` is
  // unique on (company_id, quarter, doc_type), so they all landed on ONE row and
  // silently overwrote each other.
  //
  // Measured, all 233 companies: the bare year collided on 207 of 1,385 selected
  // filings (22% of decks, 91 companies). Month-only took that to 119 — the rest
  // were decks published in the SAME month, mostly a results deck and its investor
  // deck. The full DATE takes it to near zero. Founder-approved, 2026-08-14.
  //
  // THE PUBLICATION MONTH, NOT THE TITLE'S. A title year is a fact the issuer
  // stated and the month is not, so pairing "אוגוסט" from one and 2025 from the
  // other would invent a date neither source gives. The publication instant is the
  // one structured fact every deck carries, and `period` is descriptive by
  // contract — identity is `mayaReportId`, never this string.
  // An undatable deck falls back to the title year, then to the bare label — a weaker
  // period than a date, and better than an exception.
  if (!day) return titleYear ?? ''
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`
}
