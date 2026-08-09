import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guessLang, pickArtifact, buildPeriods, periodsForYear } from './documentCatalog'
import type { RemoteSource } from '@/lib/maya/filings'

/** Shaped like `toRemoteSources` output; every default is overridable. */
function src(over: Partial<RemoteSource> = {}): RemoteSource {
  return {
    sourceId: `maya:${over.mayaReportId ?? 1}`,
    mayaReportId: 1,
    issuerId: 1460,
    issuerName: 'תיגבור קבוצה',
    title: 'דוח רבעון 1 לשנת 2026',
    publishedISO: '2026-05-27T11:27:00.52',
    docType: 'report',
    period: 'Q1 2026',
    pdfUrl: 'https://mayafiles.tase.co.il/rpdf/1744001-1745000/P1744031-00.pdf',
    ...over,
  }
}

test('the language of a filing is read from its title', () => {
  assert.equal(guessLang('דוח רבעון 1 לשנת 2026'), 'he')
  assert.equal(guessLang('Board of Directors Report & Consolidated Financial Statements'), 'en')
  assert.equal(guessLang('20F לשנת 2025'), 'he') // mixed: one Hebrew run is enough
})

// THE REAL ROWS, not invented ones: אלוני חץ files a Hebrew and an English
// edition of the same quarterly report, and the ENGLISH one is published a week
// later. Newest-alone would hand an Israeli analyst the English statements.
test('Hebrew wins over the English edition of one report, even when English is newer', () => {
  const he = src({
    mayaReportId: 1742389,
    title: 'דוח רבעון 1 לשנת 2026',
    publishedISO: '2026-05-20T00:00:00',
  })
  const en = src({
    mayaReportId: 1744011,
    title: 'Board of Directors Report & Consolidated Financial Statements for the first quarter of 2026.',
    publishedISO: '2026-05-27T00:00:00',
  })
  assert.equal(pickArtifact([en, he])?.mayaReportId, 1742389)
  assert.equal(pickArtifact([he, en])?.mayaReportId, 1742389)
})

// סלקום #1742782 "דוח רבעון 1 לשנת 2026 - תיקון דוח"
test('a correction supersedes the report it corrects', () => {
  const original = src({
    mayaReportId: 1,
    title: 'דוח רבעון 1 לשנת 2026',
    publishedISO: '2026-05-18T00:00:00',
  })
  const fixed = src({
    mayaReportId: 2,
    title: 'דוח רבעון 1 לשנת 2026 - תיקון דוח',
    publishedISO: '2026-05-20T00:00:00',
  })
  assert.equal(pickArtifact([original, fixed])?.mayaReportId, 2)
})

test('nothing to choose from is null, never a guess', () => {
  assert.equal(pickArtifact([]), null)
})

test('a report and a deck share one period row', () => {
  const out = buildPeriods(
    [
      src({ mayaReportId: 1, docType: 'report', period: 'Q1 2026' }),
      src({ mayaReportId: 2, docType: 'slides', period: 'Q1 2026', title: 'מצגת משקיעים' }),
    ],
    []
  )
  assert.equal(out.length, 1)
  assert.equal(out[0]!.report?.mayaReportId, 1)
  assert.equal(out[0]!.slides?.mayaReportId, 2)
  assert.equal(out[0]!.transcriptId, null)
  assert.equal(out[0]!.year, '2026')
})

// 115 of 295 measured decks land here: "מצגת שוק ההון" with no reporting event,
// so `periodFor` gives it the bare year. דנאל filed four in 2023 alone — they
// are company presentations, the founder's "later" bucket, and admitting them
// would also put a year's decks on one storage row.
test('a standalone deck whose period is a bare year is not a quarterly artifact', () => {
  const out = buildPeriods(
    [src({ mayaReportId: 9, docType: 'slides', period: '2024', title: 'מצגת שוק ההון' })],
    []
  )
  assert.deepEqual(out, [])
})

test('a transcript Atlas holds is attached to its period', () => {
  const out = buildPeriods(
    [src({ mayaReportId: 1, period: 'Q2 2025' })],
    [
      { id: 't-7', quarter: 'Q2 2025' },
      { id: 't-8', quarter: 'Q3 2025' },
    ]
  )
  assert.equal(out[0]!.transcriptId, 't-7')
})

test('a period holding only a report is still a period', () => {
  const out = buildPeriods([src({ mayaReportId: 1, period: 'Q3 2025' })], [])
  assert.equal(out[0]!.report?.mayaReportId, 1)
  assert.equal(out[0]!.slides, null)
})

// There is no Q4: Q1, Q2, Q3, then an annual report covering Q4 and the year.
test('a year reads newest first — Annual, Q3, Q2, Q1', () => {
  const out = buildPeriods(
    [
      src({ mayaReportId: 1, period: 'Q1 2025' }),
      src({ mayaReportId: 2, period: 'FY 2025' }),
      src({ mayaReportId: 3, period: 'Q3 2025' }),
      src({ mayaReportId: 4, period: 'Q2 2025' }),
    ],
    []
  )
  assert.deepEqual(
    out.map((p) => p.period),
    ['FY 2025', 'Q3 2025', 'Q2 2025', 'Q1 2025']
  )
})

test('years read newest first', () => {
  const out = buildPeriods(
    [src({ mayaReportId: 1, period: 'Q1 2024' }), src({ mayaReportId: 2, period: 'Q1 2026' })],
    []
  )
  assert.deepEqual(
    out.map((p) => p.year),
    ['2026', '2024']
  )
})

// THE WINDOW THAT FETCHES A FISCAL YEAR ALSO RETURNS THE NEXT YEAR'S FILINGS,
// because an annual report for 2024 is published in March 2025. Those belong to
// the 2025 row, and showing them under 2024 would be the same class of quiet
// wrongness this slice exists to avoid.
test('a fiscal year holds its own periods, whatever year they were published in', () => {
  const periods = buildPeriods(
    [
      src({ mayaReportId: 1, period: 'FY 2024', publishedISO: '2025-03-24T00:00:00' }),
      src({ mayaReportId: 2, period: 'Q1 2025', publishedISO: '2025-05-26T00:00:00' }),
    ],
    []
  )
  assert.deepEqual(
    periodsForYear(periods, '2024').map((p) => p.period),
    ['FY 2024']
  )
  assert.deepEqual(
    periodsForYear(periods, '2025').map((p) => p.period),
    ['Q1 2025']
  )
  assert.deepEqual(periodsForYear(periods, '2023'), [])
})
