import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  birthTranscript,
  birthLiveStub,
  finalizeTranscript,
  saveWordSegments,
  type BirthInput,
} from './transcripts'
import type { CorpusDb } from '@/lib/corpus/reindex'
import { UNTIMED } from '@/lib/corpus/align'
import type { Transcript } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// The birth door's laws, driven against a fake db (npm test touches no network):
//   * born attributed / keyed — missing facts THROW before any write,
//   * duplicate source → { born:false, existingId } — already-exists, not a
//     second row (the standard's duplicate-upload mechanism),
//   * completion persists ALIGNED timestamps and bumps revision only on
//     re-processing, with the atomic reindex in the same operation.
// ─────────────────────────────────────────────────────────────────────────────

type Op = { table: string; op: string; payload?: unknown; id?: string }

function makeFakeDb(opts: {
  rows?: Record<string, Record<string, unknown> | null>
  insertError?: { code?: string; message: string } | null
  sourceKeyHit?: string | null
}): { db: CorpusDb; ops: Op[] } {
  const ops: Op[] = []
  const db: CorpusDb = {
    from(table: string) {
      const q = {
        _op: '',
        _payload: undefined as unknown,
        _id: '',
        _col: '',
        insert(payload: unknown) {
          q._op = 'insert'
          q._payload = payload
          return q
        },
        upsert(payload: unknown) {
          q._op = 'upsert'
          q._payload = payload
          return q
        },
        update(payload: unknown) {
          q._op = 'update'
          q._payload = payload
          return q
        },
        select() {
          q._op = q._op || 'select'
          return q
        },
        eq(col: string, id: string) {
          q._col = col
          q._id = id
          return q
        },
        order() {
          return Promise.resolve({ data: [], error: null })
        },
        maybeSingle() {
          ops.push({ table, op: `select:${q._col}`, id: q._id })
          if (q._col === 'source_key') {
            return Promise.resolve({
              data: opts.sourceKeyHit ? { id: opts.sourceKeyHit } : null,
              error: null,
            })
          }
          return Promise.resolve({ data: opts.rows?.[`${table}:${q._id}`] ?? null, error: null })
        },
        then(resolve: (v: { error: unknown }) => void) {
          ops.push({ table, op: q._op, payload: q._payload, id: q._id })
          if (q._op === 'insert' && table === 'transcripts') {
            resolve({ error: opts.insertError ?? null })
            return
          }
          // Stateful, like the real store: an applied update is visible to the
          // next read (reindex reloads the row after finalize writes it).
          if (q._op === 'update' && opts.rows) {
            const key = `${table}:${q._id}`
            const existing = opts.rows[key]
            if (existing) opts.rows[key] = { ...existing, ...(q._payload as Record<string, unknown>) }
          }
          resolve({ error: null })
        },
      }
      return q
    },
    rpc(fn: string, args: Record<string, unknown>) {
      ops.push({ table: 'rpc', op: fn, payload: args })
      return Promise.resolve({ data: [], error: null })
    },
  }
  return { db, ops }
}

const birth: BirthInput = {
  id: 'vid123',
  sourceKey: 'vid123',
  companyId: 'c-uuid',
  userId: 'u-uuid',
  youtubeUrl: 'https://youtu.be/vid123',
}

test('birth THROWS without companyId / sourceKey / userId — before any write', async () => {
  const { db, ops } = makeFakeDb({})
  await assert.rejects(() => birthTranscript({ ...birth, companyId: '' }, db), /born attributed/)
  await assert.rejects(() => birthTranscript({ ...birth, sourceKey: '' }, db), /real-world source/)
  await assert.rejects(() => birthLiveStub({ ...birth, userId: '' }, db), /userId/)
  assert.equal(ops.filter((o) => o.op === 'insert' || o.op === 'upsert').length, 0)
})

test('a fresh birth inserts an attributed, keyed, pending row', async () => {
  const { db, ops } = makeFakeDb({})
  const res = await birthTranscript(birth, db)
  assert.deepEqual(res, { born: true, id: 'vid123' })
  const ins = ops.find((o) => o.op === 'insert')!
  const row = ins.payload as Record<string, unknown>
  assert.equal(row.company_id, 'c-uuid')
  assert.equal(row.source_key, 'vid123')
  assert.equal(row.revision, 1)
  assert.equal(row.index_status, 'pending')
})

test('duplicate source → already-exists with the existing id, never a second row', async () => {
  const { db } = makeFakeDb({
    insertError: { code: '23505', message: 'duplicate key value violates unique constraint' },
    sourceKeyHit: 'vid123',
  })
  const res = await birthTranscript(birth, db)
  assert.deepEqual(res, { born: false, existingId: 'vid123' })
})

test('a non-unique insert failure surfaces — never swallowed', async () => {
  const { db } = makeFakeDb({ insertError: { code: '23514', message: 'company check violated' } })
  await assert.rejects(() => birthTranscript(birth, db), /company check violated/)
})

const formatted = {
  id: 'vid123',
  company: 'תיגבור',
  quarter: 'Q1 2026',
  speakers: [{ id: 'sp1', name: 'דנה' }],
  sections: [
    {
      id: 'mgmt',
      title: 'סקירה',
      lines: [{ id: 'L0001', speakerId: 'sp1', timestamp: UNTIMED, text: 'שלום לכולם' }],
    },
  ],
} as unknown as Transcript

const segments = [
  {
    text: '',
    start: 12,
    words: [
      { word: 'שלום', start: 12 },
      { word: 'לכולם', start: 13 },
    ],
  },
]

const embedOk = {
  fetchImpl: (async (_u: unknown, init?: { body?: string }) => ({
    ok: true,
    json: async () => ({
      embeddings: (JSON.parse(init?.body ?? '{}') as { requests: unknown[] }).requests.map(() => ({
        values: [1, 0],
      })),
    }),
  })) as unknown as typeof fetch,
  apiKey: 'k',
}

test('first completion: revision stays 1, timestamps are ALIGNED in the persisted row, chunks rebuild', async () => {
  const { db, ops } = makeFakeDb({
    rows: {
      'transcripts:vid123': {
        id: 'vid123',
        company_id: 'c-uuid',
        source_key: 'vid123',
        revision: 1,
        formatted_data: null,
        word_segments: segments,
      },
      'companies:c-uuid': { name: 'תיגבור' },
    },
  })
  const res = await finalizeTranscript('vid123', formatted, {}, db, embedOk)
  assert.equal(res.revision, 1)
  assert.equal(res.timedLines, 1)

  const upd = ops.find((o) => o.op === 'update' && o.table === 'transcripts')!
  const payload = upd.payload as { formatted_data: Transcript; revision: number; status: string }
  assert.equal(payload.status, 'completed')
  assert.equal(payload.revision, 1)
  const line = (
    payload.formatted_data as unknown as {
      sections: Array<{ lines: Array<{ timestamp: string }> }>
    }
  ).sections[0].lines[0]
  assert.equal(line.timestamp, '00:00:12', 'the persisted line carries a REAL time, not the sentinel')
})

test('re-processing the same row bumps revision and re-chunks via the atomic RPC', async () => {
  const { db, ops } = makeFakeDb({
    rows: {
      'transcripts:vid123': {
        id: 'vid123',
        status: 'completed',
        company_id: 'c-uuid',
        source_key: 'vid123',
        revision: 1,
        formatted_data: formatted,
        word_segments: segments,
      },
      'companies:c-uuid': { name: 'תיגבור' },
    },
  })
  const res = await finalizeTranscript('vid123', formatted, {}, db, embedOk)
  assert.equal(res.revision, 2)
  const rpc = ops.find((o) => o.table === 'rpc' && o.op === 'atlas_replace_chunks')
  assert.ok(rpc, 'chunks rebuild through the atomic RPC in the same operation')
  const chunks = (rpc!.payload as { p_chunks: Array<{ revision: number }> }).p_chunks
  for (const c of chunks) assert.equal(c.revision, 2, 'rebuilt chunks carry the bumped revision')
})

test('saveWordSegments re-aligns the EXISTING formatted_data — the reprocess-audio desync is unrepresentable', async () => {
  const { db, ops } = makeFakeDb({
    rows: {
      'transcripts:vid123': {
        id: 'vid123',
        status: 'completed',
        company_id: 'c-uuid',
        source_key: 'vid123',
        revision: 1,
        formatted_data: formatted,
        word_segments: null,
      },
      'companies:c-uuid': { name: 'תיגבור' },
    },
  })
  const res = await saveWordSegments('vid123', { segments, audioUrl: 'https://a/x.mp3' }, db, embedOk)
  assert.equal(res.timedLines, 1)
  const upd = ops.find((o) => o.op === 'update' && o.table === 'transcripts')!
  const payload = upd.payload as Record<string, unknown>
  assert.equal(payload.audio_url, 'https://a/x.mp3')
  assert.ok(payload.word_segments, 'segments persisted in the same write as the re-aligned fd')
})
