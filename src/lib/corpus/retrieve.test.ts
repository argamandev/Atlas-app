import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retrieveChunks } from './retrieve'
import type { CorpusDb } from './reindex'

// A CorpusDb whose rpc() records the arguments and replays a canned result.
function fakeDb(opts: { rows?: unknown[]; error?: string } = {}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const db = {
    from() {
      throw new Error('retrieveChunks must not query tables directly')
    },
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args })
      return Promise.resolve({
        data: opts.rows ?? [],
        error: opts.error ? { message: opts.error } : null,
      })
    },
  } as unknown as CorpusDb
  return { db, calls }
}

const fetchImpl = (async () => ({
  ok: true,
  json: async () => ({ embeddings: [{ values: [3, 0, 4] }] }),
})) as unknown as typeof fetch

const embed = { fetchImpl, apiKey: 'k' }

const ROW = {
  id: 'c1',
  source_type: 'transcript',
  transcript_id: 't1',
  document_id: null,
  company_id: 'co1',
  revision: 2,
  first_line_id: 'L0010',
  last_line_id: 'L0014',
  page_no: null,
  part_no: null,
  section: 'שאלות ותשובות',
  speakers: ['מנכ"ל'],
  content: 'ההכנסות ברבעון היו 100 מיליון ש"ח',
  dense_rank: 3,
  lexical_rank: 1,
  score: 0.0384,
}

test('hybrid sends BOTH channels: a RETRIEVAL_QUERY embedding and the query text', async () => {
  const bodies: Array<{ requests: Array<{ taskType: string }> }> = []
  const spyFetch = (async (_u: unknown, init?: { body?: string }) => {
    bodies.push(JSON.parse(init?.body ?? '{}'))
    return { ok: true, json: async () => ({ embeddings: [{ values: [3, 0, 4] }] }) }
  }) as unknown as typeof fetch

  const { db, calls } = fakeDb()
  await retrieveChunks(db, { query: 'מה היו ההכנסות?', embed: { fetchImpl: spyFetch, apiKey: 'k' } })

  assert.equal(bodies[0].requests[0].taskType, 'RETRIEVAL_QUERY')
  assert.equal(calls[0].fn, 'atlas_search_chunks')
  assert.equal(calls[0].args.p_query_embedding, '[0.6,0,0.8]')
  assert.equal(calls[0].args.p_query_text, 'מה היו ההכנסות?')
})

test('lexical-only makes NO embedding call; dense-only sends no query text', async () => {
  const noNetwork = (async () => {
    throw new Error('must not embed')
  }) as unknown as typeof fetch

  const lex = fakeDb()
  await retrieveChunks(lex.db, {
    query: 'כושר זיקוק',
    channels: 'lexical',
    embed: { fetchImpl: noNetwork, apiKey: 'k' },
  })
  assert.equal(lex.calls[0].args.p_query_embedding, null)
  assert.equal(lex.calls[0].args.p_query_text, 'כושר זיקוק')

  const dense = fakeDb()
  await retrieveChunks(dense.db, { query: 'כושר זיקוק', channels: 'dense', embed })
  assert.equal(dense.calls[0].args.p_query_embedding, '[0.6,0,0.8]')
  assert.equal(dense.calls[0].args.p_query_text, null)
})

test('the company scope is passed as a PRE-filter argument, not applied after the fact', async () => {
  const { db, calls } = fakeDb({ rows: [ROW] })
  await retrieveChunks(db, { query: 'המרווח האחרון', companyId: 'co-bza', limit: 5, candidates: 500, embed })
  assert.equal(calls[0].args.p_company_id, 'co-bza')
  assert.equal(calls[0].args.p_limit, 5)
  assert.equal(calls[0].args.p_candidates, 500)
})

test('rows come back with their anchors and per-channel ranks intact', async () => {
  const { db } = fakeDb({ rows: [ROW] })
  const [hit] = await retrieveChunks(db, { query: 'הכנסות', embed })
  assert.equal(hit.sourceType, 'transcript')
  assert.equal(hit.transcriptId, 't1')
  assert.equal(hit.firstLineId, 'L0010')
  assert.equal(hit.lastLineId, 'L0014')
  assert.equal(hit.revision, 2)
  assert.equal(hit.denseRank, 3)
  assert.equal(hit.lexicalRank, 1)
  assert.equal(hit.content, 'ההכנסות ברבעון היו 100 מיליון ש"ח')
})

test('an RPC error THROWS — a failed search must never look like an empty corpus', async () => {
  const { db } = fakeDb({ error: 'relation "document_chunks" does not exist' })
  await assert.rejects(() => retrieveChunks(db, { query: 'הכנסות', embed }), /does not exist/)
})

test('an empty result is returned as empty — the honest cannot-ground signal, not an error', async () => {
  const { db } = fakeDb({ rows: [] })
  assert.deepEqual(await retrieveChunks(db, { query: 'הרווח של טבע', embed }), [])
})

test('a blank query throws before any embedding spend', async () => {
  const noNetwork = (async () => {
    throw new Error('must not embed')
  }) as unknown as typeof fetch
  const { db } = fakeDb()
  await assert.rejects(
    () => retrieveChunks(db, { query: '   ', embed: { fetchImpl: noNetwork, apiKey: 'k' } }),
    /empty query/
  )
})
