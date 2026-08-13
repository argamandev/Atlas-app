import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCorpusIndexHealth } from './indexHealth'

const t = (id: string, index_status: string | null, title = id) => ({ id, title, index_status })
const d = (id: string, index_status: string | null, facts_status: string | null = 'facts') => ({
  id,
  title: id,
  index_status,
  facts_status,
})

test('every state migration 028 defines is counted in its own bucket', () => {
  const h = buildCorpusIndexHealth({
    transcripts: [t('a', 'indexed'), t('b', 'excluded'), t('c', 'failed'), t('d', 'pending')],
    documents: [],
    chunks: 0,
  })
  assert.deepEqual(h.transcripts, {
    indexed: 1,
    excluded: 1,
    failed: 1,
    pending: 1,
    other: 0,
    total: 4,
  })
})

test('an UNRECOGNISED status is counted as other — never quietly read as indexed', () => {
  // The one mistake that would make this screen lie in the reassuring direction.
  // A status the column grows later must show up as something a human notices.
  const h = buildCorpusIndexHealth({
    transcripts: [t('a', 'reticulating')],
    documents: [d('x', 'indexed')],
    chunks: 1,
  })
  assert.equal(h.transcripts.other, 1)
  assert.equal(h.transcripts.indexed, 0)
  assert.equal(h.settled, false, 'an unknown state is not a settled one')
})

test('a NULL index_status reads as pending, which is what the column defaults to', () => {
  const h = buildCorpusIndexHealth({ transcripts: [t('a', null)], documents: [], chunks: 0 })
  assert.equal(h.transcripts.pending, 1)
})

test('facts_status NULL is UNKNOWN, not "no structured facts"', () => {
  // Standard §6: 'none' is a settled answer — this filing carries no XBRL, or its
  // instance held no numeric set. NULL means nobody has looked. Collapsing them
  // would report a corpus as fully examined when part of it never was, and would
  // hide exactly the rows a retry should pick up.
  const h = buildCorpusIndexHealth({
    transcripts: [],
    documents: [
      d('a', 'indexed', 'facts'),
      d('b', 'indexed', 'none'),
      d('c', 'indexed', 'failed'),
      d('e', 'indexed', null),
    ],
    chunks: 0,
  })
  assert.deepEqual(h.facts, { facts: 1, none: 1, failed: 1, unknown: 1 })
})

test('the troubled list puts FAILED first — a failure is a thing to act on', () => {
  const h = buildCorpusIndexHealth({
    transcripts: [t('t1', 'pending', 'שיחת ועידה')],
    documents: [d('d1', 'failed'), d('d2', 'indexed'), d('d3', 'excluded')],
    chunks: 12,
  })
  assert.deepEqual(
    h.troubled.map((x) => `${x.status}:${x.kind}:${x.id}`),
    ['failed:document:d1', 'pending:transcript:t1']
  )
})

test('EXCLUDED is settled and deliberate — it is not trouble', () => {
  // The demo row and the known duplicate are excluded BY LAW (standard §1). A
  // screen that flagged them would train whoever reads it to ignore the flag.
  const h = buildCorpusIndexHealth({
    transcripts: [t('demo', 'excluded'), t('dup', 'excluded'), t('real', 'indexed')],
    documents: [],
    chunks: 100,
  })
  assert.deepEqual(h.troubled, [])
  assert.equal(h.settled, true)
})

test('a fully indexed corpus is settled; one pending row is not', () => {
  const rows = [t('a', 'indexed'), t('b', 'indexed')]
  assert.equal(buildCorpusIndexHealth({ transcripts: rows, documents: [], chunks: 9 }).settled, true)
  assert.equal(
    buildCorpusIndexHealth({ transcripts: [...rows, t('c', 'pending')], documents: [], chunks: 9 }).settled,
    false
  )
})

test('an empty corpus is settled and says zero — not an error, and not a blank', () => {
  const h = buildCorpusIndexHealth({ transcripts: [], documents: [], chunks: 0 })
  assert.equal(h.settled, true)
  assert.equal(h.transcripts.total, 0)
  assert.equal(h.documents.total, 0)
  assert.deepEqual(h.troubled, [])
})
