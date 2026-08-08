import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listDisclosures } from './disclosures'

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
