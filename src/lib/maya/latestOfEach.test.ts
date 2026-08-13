import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectLatestOfEach, PRESENTATION_WINDOW_DAYS } from './latestOfEach'
import type { RemoteSource } from './filings'

// ─────────────────────────────────────────────────────────────────────────────
// THE BACKFILL DEPTH THE FOUNDER CHOSE, as a pure function.
//
// His decision, 2026-08-13 (`docs/archive/scratch/2026-08-13-smart-layer/issues/
// 17-maya-filings-at-scale.md`, option "B"): the most recent quarterly + the most
// recent annual report + presentations from the last 12 months, per company. He
// picked it over a strict three-month window because a three-month window misses
// most companies' annual report — the most-quoted document there is.
//
// It is a pure function over an already-fetched catalog for ONE issuer, which is
// what makes the depth decision testable at all without spending a MAYA request
// or a dollar of embeddings. The selection is the expensive call; getting it wrong
// is 234 companies' worth of wrong documents.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = '2026-08-14T09:00:00.000Z'

let nextId = 1000
function src(over: Partial<RemoteSource> & Pick<RemoteSource, 'kind' | 'publishedISO'>): RemoteSource {
  const mayaReportId = over.mayaReportId ?? nextId++
  return {
    sourceId: `maya:${mayaReportId}`,
    mayaReportId,
    issuerId: 1460,
    issuerName: 'תגבור',
    title: 'דוח',
    docType: over.kind === 'presentation' ? 'slides' : 'report',
    period: 'Q1 2026',
    pdfUrl: `https://mayafiles.tase.co.il/P${mayaReportId}.pdf`,
    xbrlUrl: null,
    ...over,
  }
}

const ids = (xs: RemoteSource[]) => xs.map((x) => x.mayaReportId).sort((a, b) => a - b)

test('one quarterly, one annual, and every presentation inside the window', () => {
  const picked = selectLatestOfEach(
    [
      src({ kind: 'quarterly', publishedISO: '2026-05-27T00:00:00.000Z', mayaReportId: 1 }),
      src({ kind: 'quarterly', publishedISO: '2026-03-20T00:00:00.000Z', mayaReportId: 2 }),
      src({ kind: 'annual', publishedISO: '2026-03-19T00:00:00.000Z', mayaReportId: 3 }),
      src({ kind: 'annual', publishedISO: '2025-03-18T00:00:00.000Z', mayaReportId: 4 }),
      src({ kind: 'presentation', publishedISO: '2026-05-27T00:00:00.000Z', mayaReportId: 5 }),
      src({ kind: 'presentation', publishedISO: '2026-01-10T00:00:00.000Z', mayaReportId: 6 }),
    ],
    { now: NOW }
  )
  assert.deepEqual(ids(picked), [1, 3, 5, 6])
})

test('presentations older than the window are left out — that is the whole cost control', () => {
  // The founder's brief was "the least amount and for the shortest time possible".
  // A presentation from two years ago is exactly what option B was chosen to exclude.
  const picked = selectLatestOfEach(
    [
      src({ kind: 'presentation', publishedISO: '2026-08-13T00:00:00.000Z', mayaReportId: 7 }),
      src({ kind: 'presentation', publishedISO: '2024-08-13T00:00:00.000Z', mayaReportId: 8 }),
    ],
    { now: NOW }
  )
  assert.deepEqual(ids(picked), [7])
})

test('the window edge is inclusive, and it is counted in days for a reason', () => {
  const cutoff = new Date(Date.parse(NOW) - PRESENTATION_WINDOW_DAYS * 86_400_000).toISOString()
  const picked = selectLatestOfEach(
    [
      src({ kind: 'presentation', publishedISO: cutoff, mayaReportId: 9 }),
      src({ kind: 'presentation', publishedISO: '2025-08-13T00:00:00.000Z', mayaReportId: 10 }),
    ],
    { now: NOW }
  )
  assert.deepEqual(ids(picked), [9], 'exactly on the edge is inside it')
})

test('a company with no annual report yields what it HAS — never an error, never a substitute', () => {
  // A newly-listed issuer genuinely has no annual report yet. Returning its
  // quarterly instead, or refusing the company, would both be lies about the
  // catalog; the honest answer is "this is everything there is".
  const picked = selectLatestOfEach(
    [src({ kind: 'quarterly', publishedISO: '2026-05-27T00:00:00.000Z', mayaReportId: 11 })],
    { now: NOW }
  )
  assert.deepEqual(ids(picked), [11])
})

test('an empty catalog selects nothing', () => {
  assert.deepEqual(selectLatestOfEach([], { now: NOW }), [])
})

test('a CORRECTION republished later wins, because it is the later filing', () => {
  // MAYA re-files a corrected report under a new mayaReportId with a later
  // publication date. "Latest" is therefore already the right rule for
  // corrections — no separate handling, which is why none is written.
  const picked = selectLatestOfEach(
    [
      src({ kind: 'annual', publishedISO: '2026-03-19T00:00:00.000Z', mayaReportId: 12 }),
      src({ kind: 'annual', publishedISO: '2026-04-02T00:00:00.000Z', mayaReportId: 13 }),
    ],
    { now: NOW }
  )
  assert.deepEqual(ids(picked), [13])
})

test('two filings sharing one publication instant resolve the SAME way every run', () => {
  // MAYA stamps a batch of filings with one timestamp often enough that this is
  // not hypothetical. A selection that flips between runs would make the backfill
  // non-idempotent — a second run would ingest a different document and pay for
  // it — so the tie is broken on the identity, deterministically.
  const catalog = [
    src({ kind: 'quarterly', publishedISO: '2026-05-27T00:00:00.000Z', mayaReportId: 14 }),
    src({ kind: 'quarterly', publishedISO: '2026-05-27T00:00:00.000Z', mayaReportId: 15 }),
  ]
  assert.deepEqual(ids(selectLatestOfEach(catalog, { now: NOW })), [15])
  assert.deepEqual(ids(selectLatestOfEach([...catalog].reverse(), { now: NOW })), [15])
})

test('the result is ordered newest-first, like every other filing list in the product', () => {
  const picked = selectLatestOfEach(
    [
      src({ kind: 'annual', publishedISO: '2026-03-19T00:00:00.000Z', mayaReportId: 16 }),
      src({ kind: 'presentation', publishedISO: '2026-06-01T00:00:00.000Z', mayaReportId: 17 }),
      src({ kind: 'quarterly', publishedISO: '2026-05-27T00:00:00.000Z', mayaReportId: 18 }),
    ],
    { now: NOW }
  )
  assert.deepEqual(
    picked.map((p) => p.mayaReportId),
    [17, 18, 16]
  )
})

test('the window is measured from a caller-supplied now, never from the wall clock', () => {
  // A backfill run and its dry run must select the same set. Reading the clock
  // inside would make the function untestable at the edge and the two runs
  // silently different across midnight.
  const catalog = [src({ kind: 'presentation', publishedISO: '2025-01-01T00:00:00.000Z', mayaReportId: 19 })]
  assert.deepEqual(ids(selectLatestOfEach(catalog, { now: '2025-06-01T00:00:00.000Z' })), [19])
  assert.deepEqual(ids(selectLatestOfEach(catalog, { now: '2026-08-14T00:00:00.000Z' })), [])
})
