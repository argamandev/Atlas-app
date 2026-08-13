import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reindexTranscript, reindexDocument, isDemoTranscriptId, NO_PAGES, type CorpusDb } from './reindex'
import { toVectorLiteral } from './embed'

// ─────────────────────────────────────────────────────────────────────────────
// The atomic re-chunk mechanism (ingestion standard §5 + §8, "mechanisms owed"):
// driving a reformat-shaped reindex against a fake db and asserting
//   * chunk/revision consistency — every chunk row carries the source revision,
//   * the swap happens ONLY through the atomic RPC (no bare delete/insert),
//   * embeddings: only what the RPC says is missing gets embedded; reuse counted,
//   * failure is VISIBLE — index_status 'failed', never a silent success,
//   * demo content is excluded, never chunked.
// npm test makes no network calls: the gemini fetch is injected.
// ─────────────────────────────────────────────────────────────────────────────

type Captured = {
  rpcs: Array<{ fn: string; args: Record<string, unknown> }>
  updates: Array<{ table: string; payload: Record<string, unknown>; id: string }>
  chunkTableOps: string[]
}

function makeFakeDb(opts: {
  rows: Record<string, Record<string, unknown> | null>
  pages?: Array<{ page_no: number; text: string }>
  rpcResult?: (args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }
}): { db: CorpusDb; captured: Captured } {
  const captured: Captured = { rpcs: [], updates: [], chunkTableOps: [] }
  const db: CorpusDb = {
    from(table: string) {
      const q = {
        _op: 'select' as string,
        _payload: {} as Record<string, unknown>,
        _id: '',
        select() {
          if (table === 'document_chunks') captured.chunkTableOps.push('select')
          return q
        },
        insert() {
          captured.chunkTableOps.push('insert')
          return q
        },
        delete() {
          captured.chunkTableOps.push('delete')
          return q
        },
        update(payload: Record<string, unknown>) {
          q._op = 'update'
          q._payload = payload
          return q
        },
        eq(_col: string, id: string) {
          q._id = id
          return q
        },
        order() {
          return Promise.resolve({ data: opts.pages ?? [], error: null })
        },
        maybeSingle() {
          const key = `${table}:${q._id}`
          return Promise.resolve({ data: opts.rows[key] ?? null, error: null })
        },
        then(resolve: (v: { error: null }) => void) {
          // awaited update — record it
          if (q._op === 'update') captured.updates.push({ table, payload: q._payload, id: q._id })
          resolve({ error: null })
        },
      }
      return q
    },
    rpc(fn: string, args: Record<string, unknown>) {
      captured.rpcs.push({ fn, args })
      const result = opts.rpcResult?.(args) ?? { data: [], error: null }
      return Promise.resolve(result)
    },
  }
  return { db, captured }
}

const okEmbedFetch = (async (_url: unknown, init?: { body?: string }) => {
  const n = (JSON.parse(init?.body ?? '{}') as { requests: unknown[] }).requests.length
  return {
    ok: true,
    json: async () => ({ embeddings: Array.from({ length: n }, () => ({ values: [3, 4] })) }),
  }
}) as unknown as typeof fetch

const failEmbedFetch = (async () => ({
  ok: false,
  status: 500,
  text: async () => 'boom',
})) as unknown as typeof fetch

const transcriptRow = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  status: 'completed',
  company_id: 'c-uuid',
  source_key: 'vid-1',
  revision: 3,
  formatted_data: {
    speakers: [{ id: 'sp1', name: 'דנה' }],
    sections: [
      {
        title: 'סקירה',
        lines: [
          { id: 'L0001', speakerId: 'sp1', text: 'ההכנסות צמחו.' },
          { id: 'L0002', speakerId: 'sp1', text: 'הרווח ירד.' },
        ],
      },
    ],
  },
  ...over,
})

test('reformat reindex: every chunk row carries the source revision, swapped only via the atomic RPC', async () => {
  const { db, captured } = makeFakeDb({
    rows: { 'transcripts:t1': transcriptRow(), 'companies:c-uuid': { name: 'תיגבור' } },
  })
  const res = await reindexTranscript(db, 't1', { fetchImpl: okEmbedFetch, apiKey: 'k' })
  assert.equal(res.status, 'indexed')

  assert.equal(captured.rpcs.length, 1)
  const { fn, args } = captured.rpcs[0]
  assert.equal(fn, 'atlas_replace_chunks')
  assert.equal(args.p_transcript_id, 't1')
  assert.equal(args.p_document_id, null)
  const rows = args.p_chunks as Array<Record<string, unknown>>
  assert.ok(rows.length >= 1)
  for (const r of rows) {
    assert.equal(r.revision, 3, 'chunk revision must equal the source revision')
    assert.equal(r.company_id, 'c-uuid')
    assert.ok((r.embedding_input as string).startsWith('תיגבור · שיחת ועידה · '))
    assert.ok(!(r.content as string).includes('שיחת ועידה ·'), 'prefix never enters content')
  }
  // Atomicity: nothing touched document_chunks except embedding updates.
  assert.deepEqual(captured.chunkTableOps, [], 'no bare select/insert/delete on document_chunks')
})

test('only chunks the RPC reports missing get embedded; the rest are reused', async () => {
  let missingId = ''
  const { db, captured } = makeFakeDb({
    rows: { 'transcripts:t1': transcriptRow(), 'companies:c-uuid': { name: 'תיגבור' } },
    rpcResult: (args) => {
      const rows = args.p_chunks as Array<{ id: string }>
      missingId = rows[0].id
      return { data: [{ chunk_id: missingId }], error: null }
    },
  })
  const res = await reindexTranscript(db, 't1', { fetchImpl: okEmbedFetch, apiKey: 'k' })
  assert.equal(res.status, 'indexed')
  if (res.status !== 'indexed') return
  assert.equal(res.embedded, 1)
  assert.equal(res.reused, res.chunkCount - 1)

  const embWrites = captured.updates.filter((u) => u.table === 'document_chunks')
  assert.equal(embWrites.length, 1)
  assert.equal(embWrites[0].id, missingId)
  // normalized [3,4] → [0.6,0.8] as a pgvector literal
  assert.equal(embWrites[0].payload.embedding, '[0.6,0.8]')

  const statusWrites = captured.updates.filter((u) => u.table === 'transcripts')
  assert.deepEqual(
    statusWrites.map((u) => u.payload.index_status),
    ['indexed']
  )
})

test('embed failure is VISIBLE: index_status=failed, error carried, never a silent success', async () => {
  const { db, captured } = makeFakeDb({
    rows: { 'transcripts:t1': transcriptRow(), 'companies:c-uuid': { name: 'תיגבור' } },
    rpcResult: (args) => ({
      data: (args.p_chunks as Array<{ id: string }>).map((r) => ({ chunk_id: r.id })),
      error: null,
    }),
  })
  const res = await reindexTranscript(db, 't1', { fetchImpl: failEmbedFetch, apiKey: 'k' })
  assert.equal(res.status, 'failed')
  if (res.status !== 'failed') return
  assert.match(res.error, /gemini embed failed/)
  const statusWrites = captured.updates.filter((u) => u.table === 'transcripts')
  assert.deepEqual(
    statusWrites.map((u) => u.payload.index_status),
    ['failed']
  )
})

test('demo/test content never enters the corpus — excluded, no RPC', async () => {
  assert.ok(isDemoTranscriptId('live-finish-demo-tamis-2026-06-14'))
  const { db, captured } = makeFakeDb({ rows: {} })
  const res = await reindexTranscript(db, 'live-finish-demo-tamis-2026-06-14', { apiKey: 'k' })
  assert.equal(res.status, 'excluded')
  assert.equal(captured.rpcs.length, 0)
  const statusWrites = captured.updates.filter((u) => u.table === 'transcripts')
  assert.deepEqual(
    statusWrites.map((u) => u.payload.index_status),
    ['excluded']
  )
})

test('a not-yet-completed transcript is skipped, not half-chunked', async () => {
  const { db, captured } = makeFakeDb({
    rows: { 'transcripts:t1': transcriptRow({ status: 'processing', formatted_data: null }) },
  })
  const res = await reindexTranscript(db, 't1', { apiKey: 'k' })
  assert.equal(res.status, 'skipped')
  assert.equal(captured.rpcs.length, 0)
})

// NO IDENTITY, NO CORPUS (standard §1). The losing half of a duplicate pair holds
// no source_key — the canonical row does — so this is what keeps PyuMxe88e8g_live
// out of search without a one-time script having to remember it (eval finding 6).
test('a transcript with no source_key is not chunked — identity is the corpus door', async () => {
  const { db, captured } = makeFakeDb({
    rows: { 'transcripts:t1': transcriptRow({ source_key: null }) },
  })
  const res = await reindexTranscript(db, 't1', { apiKey: 'k' })
  assert.equal(res.status, 'skipped')
  assert.match(res.status === 'skipped' ? res.reason : '', /source_key/)
  assert.equal(captured.rpcs.length, 0)
  assert.equal(captured.chunkTableOps.length, 0)
})

test('document reindex: page anchors ride the RPC with the document id', async () => {
  const { db, captured } = makeFakeDb({
    rows: {
      'company_documents:d1': { id: 'd1', company_id: 'c-uuid', title: 'דוח שנתי' },
      'companies:c-uuid': { name: 'תיגבור' },
    },
    pages: [
      { page_no: 1, text: 'עמוד ראשון.' },
      { page_no: 2, text: 'עמוד שני.' },
    ],
  })
  const res = await reindexDocument(db, 'd1', { fetchImpl: okEmbedFetch, apiKey: 'k' })
  assert.equal(res.status, 'indexed')
  const { args } = captured.rpcs[0]
  assert.equal(args.p_document_id, 'd1')
  assert.equal(args.p_transcript_id, null)
  const rows = args.p_chunks as Array<Record<string, unknown>>
  assert.deepEqual(
    rows.map((r) => r.page_no),
    [1, 2]
  )
  for (const r of rows) {
    assert.equal(r.first_line_id, null)
    assert.ok((r.embedding_input as string).includes("עמ'"))
  }
  const statusWrites = captured.updates.filter((u) => u.table === 'company_documents')
  assert.deepEqual(
    statusWrites.map((u) => u.payload.index_status),
    ['indexed']
  )
})

test('document reindex: NO PAGES is a failure, never an indexed document with no chunks', async () => {
  // The A5 backfill's own failure mode. A NUL in the extracted text made the pages
  // insert fail AFTER the document row was upserted, leaving a row whose text does
  // not exist. Chunking that yields zero chunks, and flipping the row to 'indexed'
  // would record a document search can never return as fully searchable —
  // success-with-nothing, which this function may not express (M3.3).
  //
  // `ingestDocument` throws on a zero-page PDF, so zero rows in document_pages can
  // ONLY mean the insert failed. There is no legitimate empty document to protect.
  const { db, captured } = makeFakeDb({
    rows: {
      'company_documents:d9': { id: 'd9', company_id: 'c-uuid', title: 'דוח תקופתי' },
      'companies:c-uuid': { name: 'תיגבור' },
    },
    pages: [],
  })
  const res = await reindexDocument(db, 'd9', { fetchImpl: okEmbedFetch, apiKey: 'k' })
  assert.equal(res.status, 'failed')
  assert.equal(res.status === 'failed' ? res.error : '', NO_PAGES)
  assert.equal(captured.rpcs.length, 0, 'it never reached the chunk swap')
  assert.deepEqual(
    captured.updates.filter((u) => u.table === 'company_documents').map((u) => u.payload.index_status),
    ['failed'],
    'and the row says so — queryable and retryable, per the standard'
  )
})

test('every chunk gets ITS OWN embedding, across the concurrency boundary', async () => {
  // The one way the batched write can be catastrophically wrong and look fine:
  // an off-by-one between the vector list and the row slice would hand chunks
  // each other's embeddings. Nothing downstream could detect it — search would
  // simply return the wrong passages forever, confidently. So the pairing gets a
  // test with MORE chunks than WRITE_CONCURRENCY (12), and a distinct vector per
  // input rather than the shared [3,4] the other cases use.
  const N = 29
  const pages = Array.from({ length: N }, (_, i) => ({ page_no: i + 1, text: `עמוד ${i + 1}.` }))
  const { db, captured } = makeFakeDb({
    rows: {
      'company_documents:dN': { id: 'dN', company_id: 'c-uuid', title: 'דוח' },
      'companies:c-uuid': { name: 'תיגבור' },
    },
    pages,
    // every chunk the RPC hands back needs embedding
    rpcResult: (args) => ({
      data: (args.p_chunks as Array<{ id: string }>).map((c) => ({ chunk_id: c.id })),
      error: null,
    }),
  })

  // A distinct, order-revealing vector per request, numbered globally across the
  // 100-per-request API batches.
  let issued = 0
  const countingFetch = (async (_url: unknown, init?: { body?: string }) => {
    const n = (JSON.parse(init?.body ?? '{}') as { requests: unknown[] }).requests.length
    const values = Array.from({ length: n }, () => {
      issued += 1
      return { values: [issued, 1] }
    })
    return { ok: true, json: async () => ({ embeddings: values }) }
  }) as unknown as typeof fetch

  const res = await reindexDocument(db, 'dN', { fetchImpl: countingFetch, apiKey: 'k' })
  assert.equal(res.status, 'indexed')

  const writes = captured.updates.filter((u) => u.table === 'document_chunks')
  assert.equal(writes.length, N, 'every chunk was written')
  // The nth chunk must carry the nth vector — [n,0] normalised is [1,0].
  const chunkIds = (captured.rpcs[0].args.p_chunks as Array<{ id: string }>).map((c) => c.id)
  assert.deepEqual(writes.map((w) => w.id), chunkIds, 'one write per chunk, none repeated')

  // THE PAIRING ITSELF, checked by RATIO so it does not depend on how many digits
  // the normaliser keeps. The kth chunk was embedded from the kth vector the API
  // issued, [k+1, 1]; normalising scales both components equally, so the ratio
  // survives it up to the digits the normaliser keeps — hence the round, which is
  // ample: an off-by-one shifts a ratio by a WHOLE integer. That matters because nothing
  // downstream could ever detect chunks wearing each other's embeddings.
  for (let k = 0; k < N; k++) {
    const [a, b] = (writes[k].payload.embedding as string).slice(1, -1).split(',').map(Number)
    assert.ok(
      Math.round(a / b) === k + 1,
      `chunk ${k} carries vector ${(a / b).toFixed(2)}, expected ${k + 1} — the pairing is off`
    )
  }
})
