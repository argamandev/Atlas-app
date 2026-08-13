import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reindexTranscript, reindexDocument, isDemoTranscriptId, type CorpusDb } from './reindex'

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
