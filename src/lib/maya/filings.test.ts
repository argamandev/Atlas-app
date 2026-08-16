import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toRemoteSources } from './filings'
import type { MayaFiling } from './types'
import { buildPeriods } from '@/lib/company/documentCatalog'

/** Shaped like the live rows read on 2026-08-06. */
function filing(over: Partial<MayaFiling> = {}): MayaFiling {
  return {
    publicationDate: '2026-05-27T11:27:00.52',
    mayaReportId: 1744031,
    title: 'מצגת משקיעים  - דוחות כספיים לרבעון הראשון של שנת 2026',
    url: 'https://maya.tase.co.il/he/reports/1744031',
    issuer: [{ issuerId: 1460, issuerName: 'תיגבור קבוצה' }],
    events: [
      { eventId: 104, eventName: 'דוח רבעון 1' },
      { eventId: 270, eventName: 'מצגת' },
    ],
    attachedFiles: [
      { url: 'https://mayafiles.tase.co.il/rhtm/1744001-1745000/H1744031.htm' },
      { url: 'https://mayafiles.tase.co.il/rpdf/1744001-1745000/P1744031-00.pdf' },
    ],
    ...over,
  }
}

test('a presentation becomes a source the shelf can name', () => {
  const [s] = toRemoteSources([filing()])
  assert.equal(s.sourceId, 'maya:1744031')
  assert.equal(s.mayaReportId, 1744031)
  assert.equal(s.issuerId, 1460)
  assert.equal(s.docType, 'slides')
  assert.equal(s.period, 'Q1 2026')
  assert.equal(s.pdfUrl, 'https://mayafiles.tase.co.il/rpdf/1744001-1745000/P1744031-00.pdf')
  assert.equal(s.xbrlUrl, null, 'no .xbrl attachment → visibly null, the "no structured facts" case')
})

test('a financial report carries its ת930 XBRL attachment through (standard §6)', () => {
  const [s] = toRemoteSources([
    filing({
      attachedFiles: [
        { url: 'https://mayafiles.tase.co.il/rpdf/1744001-1745000/P1744027-00.pdf' },
        { url: 'https://mayafiles.tase.co.il/xbrl/1744001-1745000/X1744027.xbrl' },
      ],
    }),
  ])
  assert.equal(s.xbrlUrl, 'https://mayafiles.tase.co.il/xbrl/1744001-1745000/X1744027.xbrl')
})

// A SOURCE THAT CANNOT BE OPENED MUST NEVER REACH A SHELF.
test('a filing whose only attachment is HTML is dropped', () => {
  const only_htm = filing({
    attachedFiles: [{ url: 'https://mayafiles.tase.co.il/rhtm/1757001-1758000/H1757499.htm' }],
  })
  assert.deepEqual(toRemoteSources([only_htm]), [])
})

test('a filing with no attachments at all is dropped', () => {
  assert.deepEqual(toRemoteSources([filing({ attachedFiles: [] })]), [])
})

test('a conference-call announcement is not a document', () => {
  const call = filing({ events: [{ eventId: 233, eventName: 'שיחת ועידה' }] })
  assert.deepEqual(toRemoteSources([call]), [])
})

test('an unrecognised event is excluded rather than guessed at', () => {
  const registry = filing({ events: [{ eventId: 114, eventName: 'מצבת התחיבויות ומועדי פרעון' }] })
  assert.deepEqual(toRemoteSources([registry]), [])
})

// The 2024 annual report really does carry two PDFs.
test('only the first PDF of a multi-PDF filing is taken', () => {
  const annual = filing({
    mayaReportId: 1655039,
    title: 'דוח תקופתי ושנתי לשנת 2024',
    publicationDate: '2025-03-30T00:00:00',
    events: [{ eventId: 101, eventName: 'דוח תקופתי ושנתי' }],
    attachedFiles: [
      { url: 'https://mayafiles.tase.co.il/rpdf/1655001-1656000/P1655039-00.pdf' },
      { url: 'https://mayafiles.tase.co.il/rpdf/1655001-1656000/P1655039-01.pdf' },
    ],
  })
  const [s] = toRemoteSources([annual])
  assert.equal(s.docType, 'report')
  assert.equal(s.period, 'FY 2024') // the TITLE's year, not the 2025 publication year
  assert.match(s.pdfUrl, /P1655039-00\.pdf$/)
})

test('a missing title falls back to facts we hold, never to blank or invented', () => {
  const [s] = toRemoteSources([filing({ title: null })])
  assert.equal(s.title, 'Q1 2026 · תיגבור קבוצה')
})

test('sources come back newest first', () => {
  const older = filing({ mayaReportId: 1, publicationDate: '2025-03-30T00:00:00' })
  const newer = filing({ mayaReportId: 2, publicationDate: '2026-05-27T00:00:00' })
  assert.deepEqual(
    toRemoteSources([older, newer]).map((s) => s.mayaReportId),
    [2, 1]
  )
})

// THE CATALOG'S BIGGEST SOURCE OF FALSE DOCUMENTS, and it was invisible because
// the announcement carries the report's own event id and a real PDF. Measured
// 2026-08-09: 80 of 814 offered filings across 20 issuers.
test('a scheduling announcement never reaches the shelf', () => {
  const out = toRemoteSources([
    filing({
      mayaReportId: 1741205,
      title: 'מועד פרסום דוח רבעון 1 לשנת 2026 ושיחת ועידה ביום 27.5.26, שעת השיחה: 10:00',
      publicationDate: '2026-05-14T09:00:00',
      events: [
        { eventId: 104, eventName: 'דוח רבעון 1' },
        { eventId: 113, eventName: 'מועד פרסום דוחות' },
        { eventId: 233, eventName: 'שיחת ועידה' },
      ],
    }),
    filing({
      mayaReportId: 1743923,
      title: 'דוח רבעון 1 לשנת 2026',
      publicationDate: '2026-05-27T09:00:00',
      events: [{ eventId: 104, eventName: 'דוח רבעון 1' }],
    }),
  ])
  assert.deepEqual(
    out.map((s) => s.mayaReportId),
    [1743923]
  )
})

// EVERY ADMITTED SOURCE CARRIES ITS CLASS. The A5 backfill selects "latest of
// each" on `kind`, so a source reaching the shelf without one would be a filing
// the selector silently cannot see — invisible in exactly the direction that
// looks like success (a company simply appearing to have no annual report).
test('every source that reaches the shelf carries the class the backfill selects on', () => {
  const out = toRemoteSources([
    filing({
      mayaReportId: 1,
      title: 'דוח תקופתי ושנתי לשנת 2025',
      publicationDate: '2026-03-19T09:00:00',
      events: [{ eventId: 101, eventName: 'דוח תקופתי ושנתי' }],
    }),
    filing({
      mayaReportId: 2,
      title: 'דוח רבעון 1 לשנת 2026',
      publicationDate: '2026-05-27T09:00:00',
      events: [{ eventId: 104, eventName: 'דוח רבעון 1' }],
    }),
    filing({
      mayaReportId: 3,
      title: 'מצגת משקיעים',
      publicationDate: '2026-05-27T10:00:00',
      events: [
        { eventId: 104, eventName: 'דוח רבעון 1' },
        { eventId: 270, eventName: 'מצגת' },
      ],
    }),
  ])
  assert.deepEqual(
    out.map((s) => `${s.mayaReportId}:${s.kind}`),
    ['3:presentation', '2:quarterly', '1:annual']
  )
  // and the deck is a deck by BOTH readings — never the Q1 report
  assert.equal(out.find((s) => s.mayaReportId === 3)?.docType, 'slides')
})

// ── the founder's דנאל sighting, end to end (2026-08-16) ─────────────────────
//
// STATED AS THE FOUNDER STATED IT: open a company's documents and 2026 must not
// offer an ANNUAL report, because 2026 is not over. The three rows below are the
// real document-eligible filings the live MAYA feed returned for issuer 314.
test('a year still in progress offers no annual period — the דנאל rows, end to end', () => {
  const danel2026 = [
    filing({
      mayaReportId: 1742284,
      title: 'דוח רבעון 1 לשנת 2026',
      publicationDate: '2026-05-19T16:22:05.31',
      issuer: [{ issuerId: 314, issuerName: 'דנאל' }],
      events: [{ eventId: 104, eventName: 'דוח רבעון 1' }],
    }),
    // The row that produced **שנתי 2026**: a capital-markets deck MAYA tagged with
    // the ANNUAL event, whose title states a month, not a fiscal year.
    filing({
      mayaReportId: 1742288,
      title: 'מצגת שוק ההון- מאי 2026',
      publicationDate: '2026-05-19T16:47:08.093',
      issuer: [{ issuerId: 314, issuerName: 'דנאל' }],
      events: [
        { eventId: 101, eventName: 'דוח תקופתי ושנתי' },
        { eventId: 270, eventName: 'מצגת' },
      ],
    }),
  ]

  const sources = toRemoteSources(danel2026)
  assert.equal(sources.length, 2, 'both filings still reach the corpus — neither was dropped')

  const periods = buildPeriods(sources, []).map((p) => p.period)
  assert.deepEqual(periods, ['Q1 2026'])
  assert.ok(!periods.includes('FY 2026'), 'no annual period for a year that has not ended')

  // SAID PLAINLY, because the first version of this comment claimed the deck was
  // "still reachable" and that is not true of the tab: `buildPeriods` refuses a
  // date label, so the deck LEAVES the documents tab. That is the intended
  // outcome, not a side effect — `documentCatalog` puts a standalone company deck
  // in the same later bucket as announcements and webinars, and it names דנאל on
  // exactly this point. What it stops doing is standing at the top of 2026 calling
  // itself the annual report. It remains a `RemoteSource` for the corpus.
  const deck = sources.find((s) => s.mayaReportId === 1742288)
  assert.equal(deck?.docType, 'slides')
  assert.equal(deck?.kind, 'presentation')
  assert.equal(deck?.period, '19.05.2026')
})
