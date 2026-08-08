import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mayaGet } from './client'
import { MAYA_KEY_HEADER, MAYA_LANGUAGE } from './config'

/** A stub `fetch` that records what it was asked for. No network in `npm test`. */
function stubFetch(reply: { status: number; body?: unknown; text?: string }) {
  const calls: { url: string; headers: Record<string, string> }[] = []
  const impl = (async (url: unknown, init?: RequestInit) => {
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v
    }
    calls.push({ url: String(url), headers })
    const text = reply.text ?? JSON.stringify(reply.body ?? {})
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      text: async () => text,
    } as unknown as Response
  }) as unknown as typeof fetch
  return { impl, calls }
}

test('a 200 returns the envelope, and the call carried the key and Hebrew', async () => {
  process.env.MAYA_API_KEY = 'test-key'
  const { impl, calls } = stubFetch({ status: 200, body: { data: [{ mayaReportId: 1 }] } })

  const res = await mayaGet<{ data: { mayaReportId: number }[] }>(
    '/api/v2/thing',
    { IssuerId: 1460, FromDate: '2026-01-01' },
    { fetchImpl: impl }
  )

  assert.equal(res.ok, true)
  if (res.ok) assert.deepEqual(res.data.data, [{ mayaReportId: 1 }])

  // THE TWO HEADERS THAT DECIDE WHETHER THIS WORKS AT ALL.
  assert.equal(calls[0].headers[MAYA_KEY_HEADER], 'test-key')
  assert.equal(calls[0].headers['accept-language'], MAYA_LANGUAGE)
  assert.match(calls[0].url, /^https:\/\/datawise\.tase\.co\.il\/api\/v2\/thing\?/)
  assert.match(calls[0].url, /IssuerId=1460/)
  assert.match(calls[0].url, /FromDate=2026-01-01/)
})

test('401 and 429 are told apart', async () => {
  process.env.MAYA_API_KEY = 'test-key'

  const a = await mayaGet(
    '/x',
    {},
    { fetchImpl: stubFetch({ status: 401, body: { message: 'Unauthorized' } }).impl }
  )
  assert.equal(a.ok, false)
  if (!a.ok) assert.equal(a.failure.kind, 'unauthorized')

  const b = await mayaGet('/x', {}, { fetchImpl: stubFetch({ status: 429 }).impl })
  assert.equal(b.ok, false)
  if (!b.ok) assert.equal(b.failure.kind, 'rate_limited')
})

// THE 400 THAT SHAPED THE WHOLE DESIGN. Its field errors are the API telling us
// our own bug — losing them would leave "the range cannot exceed 1 year"
// looking like "this company has no filings".
test('a 400 keeps the field errors that explain it', async () => {
  process.env.MAYA_API_KEY = 'test-key'
  const { impl } = stubFetch({
    status: 400,
    body: {
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: { ToDate: ['The date range cannot exceed 1 year.'] },
    },
  })

  const res = await mayaGet('/x', {}, { fetchImpl: impl })
  assert.equal(res.ok, false)
  if (!res.ok && res.failure.kind === 'bad_request') {
    assert.deepEqual(res.failure.fields.ToDate, ['The date range cannot exceed 1 year.'])
  } else {
    assert.fail('expected bad_request with fields')
  }
})

test('5xx, unparseable bodies and thrown network errors are all "unavailable", and none of them throw', async () => {
  process.env.MAYA_API_KEY = 'test-key'

  const a = await mayaGet('/x', {}, { fetchImpl: stubFetch({ status: 503, text: '<html>WAF</html>' }).impl })
  assert.equal(a.ok, false)
  if (!a.ok) assert.equal(a.failure.kind, 'unavailable')

  // a 200 whose body is not JSON — the Imperva page shape
  const b = await mayaGet('/x', {}, { fetchImpl: stubFetch({ status: 200, text: '<html>nope</html>' }).impl })
  assert.equal(b.ok, false)
  if (!b.ok) assert.equal(b.failure.kind, 'unavailable')

  const boom = (async () => {
    throw new Error('ECONNRESET')
  }) as unknown as typeof fetch
  const c = await mayaGet('/x', {}, { fetchImpl: boom })
  assert.equal(c.ok, false)
  if (!c.ok) assert.equal(c.failure.kind, 'unavailable')
})

test('a missing key is a plain unauthorized rather than a request with no credentials', async () => {
  delete process.env.MAYA_API_KEY
  const { impl, calls } = stubFetch({ status: 200, body: { data: [] } })
  const res = await mayaGet('/x', {}, { fetchImpl: impl })
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.failure.kind, 'unauthorized')
  assert.equal(calls.length, 0, 'must not spend a request it cannot authenticate')
  process.env.MAYA_API_KEY = 'test-key'
})
