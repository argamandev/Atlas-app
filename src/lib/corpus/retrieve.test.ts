import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retrieveChunks } from './retrieve'
import type { CorpusDb } from './reindex'

// ─────────────────────────────────────────────────────────────────────────────
// WHAT THESE TESTS DO AND DO NOT CERTIFY.
//
// They cover the TypeScript half: which channels a call switches on, what
// reaches the RPC, how rows and per-channel completeness come back, and that a
// failed search never looks like an empty corpus. Every RANKING claim — that
// the scope really pre-filters, that RRF reproduces the measured order — lives
// in SQL and is measured by the harness re-run (`run.mjs --real`), never here.
// An earlier version of this file carried a test called "the company scope is
// passed as a PRE-FILTER", which asserted only that an argument was forwarded:
// a green test standing for a premise nothing had measured (M2). Renamed to
// what it actually checks.
// ─────────────────────────────────────────────────────────────────────────────

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

const noNetwork = (async () => {
  throw new Error('must not embed')
}) as unknown as typeof fetch

const row = (over: Record<string, unknown> = {}) => ({
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
  dense_candidates: 12,
  lexical_candidates: 7,
  ...over,
})

// THE SHIPPED DESIGN IS DENSE-ONLY (founder 2026-08-14, DECISIONS.md). This is
// the mechanism under that decision: A4 measured that the lexical channel does
// not reproduce the eval on real Postgres, and a default that quietly drifts
// back to hybrid would put every surface on an unmeasured design without anyone
// choosing it.
test('the DEFAULT is semantic search — dense only, no query text sent', async () => {
  const { db, calls } = fakeDb()
  await retrieveChunks(db, { query: 'מה היו ההכנסות?', embed })
  assert.equal(calls[0].fn, 'atlas_search_chunks')
  assert.equal(calls[0].args.p_query_embedding, '[0.6,0,0.8]')
  assert.equal(
    calls[0].args.p_query_text,
    null,
    'the lexical channel is off by default — turning it back on is a design change that re-runs the eval gate'
  )
})

test('hybrid, asked for explicitly, sends BOTH channels', async () => {
  const bodies: Array<{ requests: Array<{ taskType: string }> }> = []
  const spyFetch = (async (_u: unknown, init?: { body?: string }) => {
    bodies.push(JSON.parse(init?.body ?? '{}'))
    return { ok: true, json: async () => ({ embeddings: [{ values: [3, 0, 4] }] }) }
  }) as unknown as typeof fetch

  const { db, calls } = fakeDb()
  await retrieveChunks(db, {
    query: 'מה היו ההכנסות?',
    channels: 'hybrid',
    embed: { fetchImpl: spyFetch, apiKey: 'k' },
  })

  assert.equal(bodies[0].requests[0].taskType, 'RETRIEVAL_QUERY')
  assert.equal(calls[0].args.p_query_embedding, '[0.6,0,0.8]')
  assert.equal(calls[0].args.p_query_text, 'מה היו ההכנסות?')
})

test('lexical-only makes NO embedding call; dense-only sends no query text', async () => {
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

test('the resolved company reaches the RPC as its own argument (the SQL does the filtering)', async () => {
  const { db, calls } = fakeDb({ rows: [row()] })
  await retrieveChunks(db, { query: 'המרווח האחרון', companyId: 'co-bza', limit: 5, embed })
  assert.equal(calls[0].args.p_company_id, 'co-bza')
  assert.equal(calls[0].args.p_limit, 5)
})

test('a pool bigger than 1000 passes through — only the DENSE channel is capped, in SQL', async () => {
  // The 1000 ceiling is `hnsw.ef_search`'s, so it binds the dense channel alone.
  // Clamping the request here would have silently shrunk the lexical pool too.
  const { db, calls } = fakeDb()
  await retrieveChunks(db, { query: 'הכנסות', candidates: 4000, embed })
  assert.equal(calls[0].args.p_candidates, 4000)
})

test('the ef_search ceiling is NOT a truncation — a channel under its pool saw everything', async () => {
  // Measured on the live corpus: an unscoped dense channel returns all 3,181
  // rows even though `hnsw.ef_search` clamps at 1000, because that GUC bounds
  // the index scan's effort, not the answer. Treating the ceiling as a row cap
  // reported five designs × nineteen cases as truncated when none was.
  const { db } = fakeDb({ rows: [row({ dense_candidates: 3181, lexical_candidates: 2500 })] })
  const res = await retrieveChunks(db, { query: 'הכנסות', candidates: 5000, embed })
  assert.equal(res.dense.truncated, false, '3181 of a 5000 pool — nothing was cut off')
  assert.equal(res.lexical.truncated, false, '2500 of a 5000 pool — complete')
})

test('rows come back with their anchors and per-channel ranks intact', async () => {
  const { db } = fakeDb({ rows: [row()] })
  const { chunks } = await retrieveChunks(db, { query: 'הכנסות', embed })
  const hit = chunks[0]
  assert.equal(hit.sourceType, 'transcript')
  assert.equal(hit.transcriptId, 't1')
  assert.equal(hit.firstLineId, 'L0010')
  assert.equal(hit.lastLineId, 'L0014')
  assert.equal(hit.revision, 2)
  assert.equal(hit.denseRank, 3)
  assert.equal(hit.lexicalRank, 1)
  assert.equal(hit.content, 'ההכנסות ברבעון היו 100 מיליון ש"ח')
})

// ── completeness: a thin answer must not look like a complete one ────────────

test('a channel that filled its candidate pool is reported TRUNCATED', async () => {
  const { db } = fakeDb({ rows: [row({ dense_candidates: 200, lexical_candidates: 7 })] })
  const res = await retrieveChunks(db, { query: 'הכנסות', candidates: 200, embed })
  assert.equal(res.dense.truncated, true, 'saw exactly the pool size — it may have been cut off')
  assert.equal(res.dense.saw, 200)
  assert.equal(res.lexical.truncated, false, 'saw fewer than the pool — that is everything there was')
})

test('a switched-off channel reports ran:false, which is not the same as found-nothing', async () => {
  const { db } = fakeDb({ rows: [row({ dense_candidates: 0, lexical_candidates: 9 })] })
  const res = await retrieveChunks(db, {
    query: 'כושר זיקוק',
    channels: 'lexical',
    embed: { fetchImpl: noNetwork, apiKey: 'k' },
  })
  assert.equal(res.dense.ran, false)
  assert.equal(res.dense.truncated, false, 'a channel that never ran cannot have been truncated')
  assert.equal(res.lexical.ran, true)
  assert.equal(res.lexical.saw, 9)
})

test('an empty result is returned as empty — the honest cannot-ground signal, not an error', async () => {
  const { db } = fakeDb({ rows: [] })
  const res = await retrieveChunks(db, { query: 'הרווח של טבע', embed })
  assert.deepEqual(res.chunks, [])
  assert.equal(res.dense.saw, 0)
  assert.equal(res.dense.truncated, false, 'nothing found is complete information, not a truncation')
})

test('an RPC error THROWS — a failed search must never look like an empty corpus', async () => {
  const { db } = fakeDb({ error: 'relation "document_chunks" does not exist' })
  await assert.rejects(() => retrieveChunks(db, { query: 'הכנסות', embed }), /does not exist/)
})

test('a blank query throws before any embedding spend', async () => {
  const { db } = fakeDb()
  await assert.rejects(
    () => retrieveChunks(db, { query: '   ', embed: { fetchImpl: noNetwork, apiKey: 'k' } }),
    /empty query/
  )
})
