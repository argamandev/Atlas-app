import { test } from 'node:test'
import assert from 'node:assert/strict'
import { downloadFiling } from './files'

/** The exact interstitial observed live: 200, text/html, 212 bytes, on a .pdf URL. */
const INTERSTITIAL = Buffer.from(
  '<html>\r\n<head><title>Request Rejected</title></head>\r\n<body>The requested URL was rejected.</body>\r\n</html>'
)
const REAL_PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(4096, 0x20)])

function stub(bodies: Buffer[], status = 200) {
  let n = 0
  const calls = { count: 0 }
  const impl = (async () => {
    const body = bodies[Math.min(n++, bodies.length - 1)]
    calls.count++
    return {
      ok: status >= 200 && status < 300,
      status,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    } as unknown as Response
  }) as unknown as typeof fetch
  return { impl, calls }
}

test('a real PDF comes back as bytes', async () => {
  const { impl, calls } = stub([REAL_PDF])
  const res = await downloadFiling('https://mayafiles.tase.co.il/rpdf/x/P1.pdf', { fetchImpl: impl })
  assert.equal(res.ok, true)
  if (res.ok) assert.equal(Buffer.from(res.data.subarray(0, 5)).toString('latin1'), '%PDF-')
  assert.equal(calls.count, 1, 'a good response must not be retried')
})

// THE BUG THIS MODULE EXISTS FOR.
test('a 200 carrying 212 bytes of HTML is not a PDF, and is retried once', async () => {
  const { impl, calls } = stub([INTERSTITIAL, REAL_PDF])
  const res = await downloadFiling('https://mayafiles.tase.co.il/rpdf/x/P1.pdf', { fetchImpl: impl })
  assert.equal(res.ok, true, 'the retry should have recovered it')
  assert.equal(calls.count, 2)
})

test('HTML twice fails — it is not having a bad moment, and must never be stored', async () => {
  const { impl, calls } = stub([INTERSTITIAL, INTERSTITIAL])
  const res = await downloadFiling('https://mayafiles.tase.co.il/rpdf/x/P1.pdf', { fetchImpl: impl })
  assert.equal(res.ok, false)
  if (!res.ok) {
    assert.equal(res.failure.kind, 'unavailable')
    assert.match(String(res.failure.detail), /not a PDF/)
  }
  assert.equal(calls.count, 2, 'retries once, not forever')
})

test('a non-200 fails without pretending', async () => {
  const { impl } = stub([Buffer.alloc(0)], 404)
  const res = await downloadFiling('https://mayafiles.tase.co.il/rpdf/x/missing.pdf', { fetchImpl: impl })
  assert.equal(res.ok, false)
  if (!res.ok) assert.match(String(res.failure.detail), /404/)
})

test('a thrown network error is data, not an exception', async () => {
  const boom = (async () => {
    throw new Error('ECONNRESET')
  }) as unknown as typeof fetch
  const res = await downloadFiling('https://mayafiles.tase.co.il/x.pdf', { fetchImpl: boom })
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.failure.kind, 'unavailable')
})
