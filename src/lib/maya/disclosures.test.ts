import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listDisclosures, latestDisclosures } from './disclosures'
import { toRemoteSources } from './filings'

function stub(perCall: { status: number; body: unknown }[]) {
  const urls: string[] = []
  let n = 0
  const impl = (async (url: unknown) => {
    urls.push(String(url))
    const r = perCall[Math.min(n++, perCall.length - 1)]
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => JSON.stringify(r.body),
    } as unknown as Response
  }) as unknown as typeof fetch
  return { impl, urls }
}

const filing = (id: number, date: string) => ({
  publicationDate: date,
  mayaReportId: id,
  title: `t${id}`,
  url: null,
  issuer: [{ issuerId: 1460, issuerName: 'תיגבור קבוצה' }],
  events: [{ eventId: 101, eventName: 'דוח תקופתי ושנתי' }],
  attachedFiles: [],
})

test('a single year issues two windowed calls and merges them', async () => {
  process.env.MAYA_API_KEY = 'k'
  const { impl, urls } = stub([
    { status: 200, body: { data: [filing(1, '2024-05-01T00:00:00')] } },
    { status: 200, body: { data: [filing(2, '2025-03-30T00:00:00')] } },
  ])

  const res = await listDisclosures({ issuerId: 1460, fromYear: 2024, toYear: 2024 }, { fetchImpl: impl })
  assert.equal(res.ok, true)
  if (res.ok) {
    // newest first, both years present
    assert.deepEqual(
      res.data.map((f) => f.mayaReportId),
      [2, 1]
    )
  }
  assert.equal(urls.length, 2)
  assert.match(urls[0], /FromDate=2024-01-01/)
  assert.match(urls[0], /ToDate=2024-12-31/)
  assert.match(urls[1], /FromDate=2025-01-01/)
})

test('the same filing seen in two windows appears once', async () => {
  process.env.MAYA_API_KEY = 'k'
  const dup = filing(7, '2025-01-01T00:00:00')
  const { impl } = stub([
    { status: 200, body: { data: [dup] } },
    { status: 200, body: { data: [dup] } },
  ])
  const res = await listDisclosures({ issuerId: 1460, fromYear: 2024, toYear: 2024 }, { fetchImpl: impl })
  assert.equal(res.ok, true)
  if (res.ok) assert.equal(res.data.length, 1)
})

// PARTIAL COVERAGE PRESENTED AS COMPLETE IS THE FAILURE THIS PREVENTS. If the
// 2025 window fails, "no 2024 annual report exists" would be stated with total
// confidence out of a network blip.
test('one failing window fails the whole catalog', async () => {
  process.env.MAYA_API_KEY = 'k'
  const { impl } = stub([
    { status: 200, body: { data: [filing(1, '2024-05-01T00:00:00')] } },
    { status: 503, body: {} },
  ])
  const res = await listDisclosures({ issuerId: 1460, fromYear: 2024, toYear: 2024 }, { fetchImpl: impl })
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.failure.kind, 'unavailable')
})

test('a 400 from the API is surfaced as bad_request, never as an empty company', async () => {
  process.env.MAYA_API_KEY = 'k'
  const { impl } = stub([
    { status: 400, body: { errors: { ToDate: ['The date range cannot exceed 1 year.'] } } },
  ])
  const res = await listDisclosures({ issuerId: 1460, fromYear: 2024, toYear: 2024 }, { fetchImpl: impl })
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.failure.kind, 'bad_request')
})

// ── the live feed, and the dialect difference that would have silenced it ─────
//
// Every row below is the shape MAYA really returned on 2026-08-14, trimmed. The
// keys are the point: `mayaReports.result` rather than `data`, `attachedfiles`
// rather than `attachedFiles`, `associated` rather than v2's `assosiated`. All
// three were measured against the live endpoints, not read from a document.

const LATEST_ROW = {
  publicationDate: '2026-08-13T20:11:04.583',
  mayaReportId: 1763415,
  isPriorityReport: false,
  isCorrection: false,
  title: 'מצגת משקיעים',
  url: 'https://maya.tase.co.il/he/reports/1763415',
  issuer: [{ issuerId: 1968, associated: false, issuerName: 'ווטר אי או' }],
  events: [{ eventId: 270, eventName: 'מצגת' }],
  attachedfiles: [
    { url: 'https://mayafiles.tase.co.il/rhtm/1763001-1764000/H1763415.htm' },
    { url: 'https://mayafiles.tase.co.il/rpdf/1763001-1764000/P1763415-00.pdf' },
  ],
}

const feedFetch = (payload: unknown): typeof fetch =>
  (async () => ({ ok: true, status: 200, text: async () => JSON.stringify(payload) })) as unknown as typeof fetch

test('the live feed reaches the corpus pipeline as an ordinary filing', async () => {
  // THE WHOLE POINT: the normalised row survives toRemoteSources. Before this
  // translation existed, `attachedFiles` was undefined on every feed row, no PDF
  // was found, and the poller would have run every ten minutes forever, reported
  // success, and ingested nothing at all.
  process.env.MAYA_API_KEY = 'k'
  const res = await latestDisclosures({ fetchImpl: feedFetch({ mayaReports: { result: [LATEST_ROW] } }) })
  assert.equal(res.ok, true)
  if (!res.ok) return

  assert.equal(res.data[0].attachedFiles.length, 2, 'attachedfiles → attachedFiles')
  assert.equal(res.data[0].issuer[0].assosiated, false, 'associated → TASE’s own assosiated')

  const sources = toRemoteSources(res.data)
  assert.equal(sources.length, 1)
  assert.equal(sources[0].kind, 'presentation')
  assert.match(sources[0].pdfUrl, /P1763415-00\.pdf$/)
})

test('a feed row whose attachments only came under the v2 spelling finds nothing', async () => {
  // The negative half, so the test above cannot pass for the wrong reason: if
  // normalisation were dropped, this is exactly what every real row would look
  // like, and toRemoteSources would return an empty list without complaining.
  const wrongCase = { ...LATEST_ROW, attachedfiles: undefined, attachedFiles: LATEST_ROW.attachedfiles }
  process.env.MAYA_API_KEY = 'k'
  const res = await latestDisclosures({ fetchImpl: feedFetch({ mayaReports: { result: [wrongCase] } }) })
  assert.equal(res.ok, true)
  if (!res.ok) return
  assert.deepEqual(res.data[0].attachedFiles, [], 'we read attachedfiles, and this row has none')
  assert.deepEqual(toRemoteSources(res.data), [], 'so the filing is dropped — silently, which is the danger')
})

test('an empty or malformed wrapper is an empty feed, not a crash', async () => {
  process.env.MAYA_API_KEY = 'k'
  for (const payload of [{}, { mayaReports: null }, { mayaReports: { result: null } }]) {
    const res = await latestDisclosures({ fetchImpl: feedFetch(payload) })
    assert.equal(res.ok, true)
    if (res.ok) assert.deepEqual(res.data, [])
  }
})

test('a failed feed read stays a failure — never an empty market', async () => {
  process.env.MAYA_API_KEY = 'k'
  const failing = (async () => ({ ok: false, status: 503, text: async () => '' })) as unknown as typeof fetch
  const res = await latestDisclosures({ fetchImpl: failing })
  assert.equal(res.ok, false)
})
