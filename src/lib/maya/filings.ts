import type { MayaFiling } from './types'
import { docTypeFor, isDocumentEvent, periodFor } from './events'

// ─────────────────────────────────────────────────────────────────────────────
// A MAYA FILING BECOMES SOMETHING THE SHELF CAN SPEAK ABOUT.
//
// The `sourceId` is synthetic (`maya:<mayaReportId>`) and that is what lets the
// rest of the intake stay untouched: the selection model picks ids out of a
// list, `parseSelection` discards any id that was not in that list, and neither
// cares whether an id names a row we hold or a filing we would fetch. The
// honesty guard therefore keeps working for free.
//
// TWO THINGS ARE DROPPED HERE RATHER THAN SHOWN AND THEN APOLOGISED FOR:
// filings with no whitelisted event, and filings with no PDF. A source that
// cannot be opened must never reach a shelf — `.claude/rules/app.md` calls this
// the visible-degradation law, and "success UI for content the server dropped"
// is the exact shape it forbids.
// ─────────────────────────────────────────────────────────────────────────────

export type RemoteSource = {
  /** `maya:<mayaReportId>` — unique, and never collides with a uuid or a youtube id */
  sourceId: string
  mayaReportId: number
  issuerId: number
  issuerName: string
  title: string
  publishedISO: string
  docType: 'report' | 'slides'
  /** descriptive only — identity is mayaReportId, never this */
  period: string
  pdfUrl: string
  /** The ISA ת930 instance (`X{mayaReportId}.xbrl`), when the filing carries one.
   *  Its PRESENCE is the reliable marker of a real financial-statement filing
   *  (research/14); its absence is the visible "no structured facts" case. */
  xbrlUrl: string | null
}

export const MAYA_SOURCE_PREFIX = 'maya:'

export function isRemoteSourceId(id: string): boolean {
  return id.startsWith(MAYA_SOURCE_PREFIX)
}

const isPdf = (url: string) => /\.pdf(?:$|\?)/i.test(url)

export function toRemoteSources(filings: MayaFiling[]): RemoteSource[] {
  const out: RemoteSource[] = []

  for (const f of filings) {
    const eventIds = (f.events ?? []).map((e) => e.eventId)
    if (!isDocumentEvent(eventIds)) continue

    const docType = docTypeFor(eventIds)
    if (!docType) continue

    // ONLY THE FIRST PDF. The 2024 annual report carries two (`P1655039-00.pdf`
    // and `-01.pdf`), and v1 attaches the first. Recorded as a known limitation
    // in the spec rather than passed over in silence — the second is usually
    // the auditor's annex, and guessing which of two is "the report" is a
    // decision this mapping is not entitled to make.
    const pdf = (f.attachedFiles ?? []).map((a) => a.url).find(isPdf)
    if (!pdf) continue

    const xbrl = (f.attachedFiles ?? []).map((a) => a.url).find((u) => /\.xbrl(?:$|\?)/i.test(u)) ?? null

    const issuer = f.issuer?.[0]
    if (!issuer) continue

    const period = periodFor(eventIds, f.title, f.publicationDate)

    out.push({
      sourceId: `${MAYA_SOURCE_PREFIX}${f.mayaReportId}`,
      mayaReportId: f.mayaReportId,
      issuerId: issuer.issuerId,
      issuerName: issuer.issuerName,
      // A NULL TITLE IS THE en-US FEED LEAKING THROUGH. Everything should be
      // he-IL, but if a title is ever missing the label is built from facts we
      // hold rather than left blank or invented.
      title: f.title?.trim() || `${period} · ${issuer.issuerName}`,
      publishedISO: f.publicationDate,
      docType,
      period,
      pdfUrl: pdf,
      xbrlUrl: xbrl,
    })
  }

  // Newest first — the same order the corpus loader uses, so a merged candidate
  // list does not read as two lists stapled together.
  return out.sort((a, b) => (a.publishedISO < b.publishedISO ? 1 : a.publishedISO > b.publishedISO ? -1 : 0))
}
