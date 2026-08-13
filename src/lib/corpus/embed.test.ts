import { test } from 'node:test'
import assert from 'node:assert/strict'
import { embedDocuments, toVectorLiteral } from './embed'

test('embeds in batches of 100 with RETRIEVAL_DOCUMENT and re-normalizes to unit vectors', async () => {
  const bodies: Array<{ requests: Array<{ taskType: string; outputDimensionality: number }> }> = []
  const fetchImpl = (async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}')
    bodies.push(body)
    return {
      ok: true,
      json: async () => ({
        embeddings: body.requests.map(() => ({ values: [3, 0, 4] })),
      }),
    }
  }) as unknown as typeof fetch

  const texts = Array.from({ length: 150 }, (_, i) => `chunk ${i}`)
  const out = await embedDocuments(texts, { fetchImpl, apiKey: 'k' })
  assert.equal(out.length, 150)
  assert.deepEqual(out[0], [0.6, 0, 0.8]) // [3,0,4] normalized
  assert.equal(bodies.length, 2) // 100 + 50
  assert.equal(bodies[0].requests.length, 100)
  assert.equal(bodies[1].requests.length, 50)
  assert.equal(bodies[0].requests[0].taskType, 'RETRIEVAL_DOCUMENT')
  assert.equal(bodies[0].requests[0].outputDimensionality, 1536)
})

test('a non-OK response throws with the status — never a silent empty', async () => {
  const fetchImpl = (async () => ({
    ok: false,
    status: 429,
    text: async () => 'quota',
  })) as unknown as typeof fetch
  await assert.rejects(() => embedDocuments(['x'], { fetchImpl, apiKey: 'k' }), /HTTP 429/)
})

test('a count mismatch throws — success with the wrong shape is not success (M3)', async () => {
  const fetchImpl = (async () => ({
    ok: true,
    json: async () => ({ embeddings: [] }),
  })) as unknown as typeof fetch
  await assert.rejects(() => embedDocuments(['x'], { fetchImpl, apiKey: 'k' }), /expected 1 embeddings/)
})

test('missing key throws before any network call', async () => {
  const fetchImpl = (async () => {
    throw new Error('must not be called')
  }) as unknown as typeof fetch
  const saved = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY
  try {
    await assert.rejects(() => embedDocuments(['x'], { fetchImpl }), /GEMINI_API_KEY/)
  } finally {
    if (saved !== undefined) process.env.GEMINI_API_KEY = saved
  }
})

test('toVectorLiteral renders the pgvector form', () => {
  assert.equal(toVectorLiteral([0.5, -1, 2]), '[0.5,-1,2]')
})
