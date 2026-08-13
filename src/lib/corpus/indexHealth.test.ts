import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assembleCorpusIndexHealth } from './indexHealth'
import type { HealthInput, StatusCounts, TroubledSource } from './indexHealth'

const NONE: StatusCounts = { total: 0, pending: 0, indexed: 0, failed: 0, excluded: 0 }

function input(over: Partial<HealthInput> = {}): HealthInput {
  return {
    transcripts: NONE,
    documents: NONE,
    facts: { total: 0, facts: 0, none: 0, failed: 0 },
    chunks: 0,
    troubled: [],
    troubledTotal: 0,
    ...over,
  }
}

const troubled = (over: Partial<TroubledSource>): TroubledSource => ({
  kind: 'document',
  id: 'd1',
  title: 'd1',
  status: 'failed',
  ...over,
})

test('every state migration 028 defines is counted in its own bucket', () => {
  const h = assembleCorpusIndexHealth(
    input({ transcripts: { total: 4, indexed: 1, excluded: 1, failed: 1, pending: 1 } })
  )
  assert.deepEqual(h.transcripts, { indexed: 1, excluded: 1, failed: 1, pending: 1, other: 0, total: 4 })
})

test('an UNRECOGNISED status shows up as other — never quietly read as indexed', () => {
  // THE ONE MISTAKE that would make this screen lie in the reassuring direction.
  // `other` is a SUBTRACTION (total minus the four known states) precisely because
  // an unknown state cannot be enumerated: whatever the column grows later lands
  // here and stays visible instead of being folded into a bucket we recognise.
  const h = assembleCorpusIndexHealth(
    input({ transcripts: { total: 3, indexed: 2, pending: 0, failed: 0, excluded: 0 } })
  )
  assert.equal(h.transcripts.other, 1)
  assert.equal(h.transcripts.indexed, 2)
  assert.equal(h.settled, false, 'an unknown state is not a settled one')
})

test('a count taken across a concurrent write never reports a negative', () => {
  // Three unattended writers touch these tables at this slice — a backfill, a
  // ten-minute poller and a nightly sweep — and the per-state counts are separate
  // statements from the total. A negative `other` would read as a bug in the
  // screen rather than as the racing write it is.
  const h = assembleCorpusIndexHealth(
    input({ documents: { total: 10, indexed: 11, pending: 0, failed: 0, excluded: 0 } })
  )
  assert.equal(h.documents.other, 0)
})

test('facts_status NULL is UNKNOWN, not "no structured facts"', () => {
  // Standard §6: 'none' is a settled answer — this filing carries no XBRL, or its
  // instance held no numeric set. NULL means nobody has looked. Collapsing them
  // reports an unexamined corpus as fully examined, and hides exactly the rows a
  // retry should pick up.
  const h = assembleCorpusIndexHealth(input({ facts: { total: 4, facts: 1, none: 1, failed: 1 } }))
  assert.deepEqual(h.facts, { facts: 1, none: 1, failed: 1, unknown: 1 })
})

test('the troubled list puts FAILED first — a failure is a thing to act on', () => {
  const h = assembleCorpusIndexHealth(
    input({
      troubled: [
        troubled({ kind: 'transcript', id: 't1', title: 'שיחת ועידה', status: 'pending' }),
        troubled({ id: 'd1', title: 'דוח', status: 'failed' }),
      ],
      troubledTotal: 2,
    })
  )
  assert.deepEqual(
    h.troubled.map((x) => `${x.status}:${x.kind}:${x.id}`),
    ['failed:document:d1', 'pending:transcript:t1']
  )
})

test('a CUT troubled list reports its true total, not the length it happens to hold', () => {
  // The list is bounded at 200. A screen showing 200 of 900 without saying so is
  // the same lie this whole module exists to prevent, one level down.
  const h = assembleCorpusIndexHealth(
    input({
      troubled: [troubled({})],
      troubledTotal: 900,
      documents: { total: 900, pending: 900, indexed: 0, failed: 0, excluded: 0 },
    })
  )
  assert.equal(h.troubled.length, 1)
  assert.equal(h.troubledTotal, 900, 'the caller can tell it is looking at a fraction')
})

test('EXCLUDED is settled and deliberate — it is not trouble', () => {
  // The demo row and the known duplicate are excluded BY LAW (standard §1). A
  // screen that flagged them would train whoever reads it to ignore the flag.
  const h = assembleCorpusIndexHealth(
    input({ transcripts: { total: 3, excluded: 2, indexed: 1, pending: 0, failed: 0 }, chunks: 100 })
  )
  assert.deepEqual(h.troubled, [])
  assert.equal(h.settled, true)
})

test('a fully indexed corpus is settled; one pending row is not', () => {
  const settled = assembleCorpusIndexHealth(
    input({ transcripts: { total: 2, indexed: 2, pending: 0, failed: 0, excluded: 0 } })
  )
  assert.equal(settled.settled, true)
  const not = assembleCorpusIndexHealth(
    input({ transcripts: { total: 3, indexed: 2, pending: 1, failed: 0, excluded: 0 } })
  )
  assert.equal(not.settled, false)
})

test('an empty corpus is settled and says zero — not an error, and not a blank', () => {
  const h = assembleCorpusIndexHealth(input())
  assert.equal(h.settled, true)
  assert.equal(h.transcripts.total, 0)
  assert.equal(h.documents.total, 0)
  assert.deepEqual(h.troubled, [])
  assert.equal(h.troubledTotal, 0)
})
