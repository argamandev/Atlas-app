import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toRemoteSources } from './filings'
import type { MayaFiling } from './types'

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
