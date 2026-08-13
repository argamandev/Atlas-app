import { test } from 'node:test'
import assert from 'node:assert/strict'
import { syncCompanyFilings, upsertKeyOf } from './syncFilings'
import type { SyncDeps } from './syncFilings'
import type { RemoteSource } from './filings'
import type { CorpusDb } from '@/lib/corpus/reindex'

/** The ASCII unit separator upsertKeyOf joins on. Spelled as an escape here
 *  for the same reason it is spelled as one there: a raw control character in
 *  a source file is invisible in every diff that would catch it changing. */
const SEP = '\u001f'

// ─────────────────────────────────────────────────────────────────────────────
// ONE DOOR FOR THE THREE WAYS A FILING CAN ARRIVE — the backfill, the 10-minute
// poller and the nightly sweep. The ingestion standard §7 requires exactly that:
// "they invoke the SAME birth sequence per document; idempotency comes from the
// identity keys, so a sweep and a user click racing on one filing converge on one
// row."
//
// Everything below is the TypeScript half — which filings are downloaded, which
// are skipped, what a race resolves to, and what the caller is told. The PDF
// extraction and the embedding spend are behind `deps`, so none of this costs a
// request or a cent.
// ─────────────────────────────────────────────────────────────────────────────

let nextId = 500
function src(over: Partial<RemoteSource> = {}): RemoteSource {
  const mayaReportId = over.mayaReportId ?? nextId++
  return {
    sourceId: `maya:${mayaReportId}`,
    mayaReportId,
    issuerId: 1460,
    issuerName: 'תגבור',
    title: 'דוח רבעון 1 לשנת 2026',
    publishedISO: '2026-05-27T06:00:00.000Z',
    docType: 'report',
    kind: 'quarterly',
    period: 'Q1 2026',
    pdfUrl: `https://mayafiles.tase.co.il/P${mayaReportId}.pdf`,
    xbrlUrl: null,
    ...over,
  }
}

/** The `company_documents` rows the DB is pretending to hold. */
function fakeDb(
  held: Array<{ id: string; maya_report_id: number; company_id: string; index_status: string }>
) {
  const queries: number[][] = []
  const db = {
    from(table: string) {
      assert.equal(table, 'company_documents')
      return {
        select() {
          return {
            in(_col: string, ids: number[]) {
              queries.push(ids)
              return Promise.resolve({
                data: held.filter((h) => ids.includes(h.maya_report_id)),
                error: null,
              })
            },
          }
        },
      }
    },
    rpc() {
      throw new Error('syncCompanyFilings must not call an RPC directly')
    },
  } as unknown as CorpusDb
  return { db, queries }
}

function deps(over: Partial<SyncDeps> = {}): SyncDeps & { ingested: number[]; reindexed: string[] } {
  const ingested: number[] = []
  const reindexed: string[] = []
  return {
    ingested,
    reindexed,
    ingest: async (s: RemoteSource) => {
      ingested.push(s.mayaReportId)
      return { documentId: `doc-${s.mayaReportId}`, pageCount: 12 }
    },
    reindex: async (id: string) => {
      reindexed.push(id)
      return { status: 'indexed' as const, chunkCount: 12, embedded: 12, reused: 0 }
    },
    ...over,
  } as SyncDeps & { ingested: number[]; reindexed: string[] }
}

const CO = 'co-tigbur'

test('a filing Atlas does not hold is ingested, and the report says so', async () => {
  const { db } = fakeDb([])
  const d = deps()
  const report = await syncCompanyFilings(
    { db, ...d },
    { companyId: CO, sources: [src({ mayaReportId: 1 })] }
  )
  assert.deepEqual(d.ingested, [1])
  assert.equal(report.outcomes[0].status, 'ingested')
  assert.equal(report.ingested, 1)
})

test('a filing already held AND indexed costs nothing — no download, no embedding', async () => {
  // This is what makes the nightly sweep affordable: it re-reads 234 catalogs and
  // ingests only what is new. If "already held" were not free, the sweep would
  // re-pay for the whole corpus every night.
  const { db } = fakeDb([{ id: 'doc-1', maya_report_id: 1, company_id: CO, index_status: 'indexed' }])
  const d = deps()
  const report = await syncCompanyFilings(
    { db, ...d },
    { companyId: CO, sources: [src({ mayaReportId: 1 })] }
  )
  assert.deepEqual(d.ingested, [])
  assert.deepEqual(d.reindexed, [])
  assert.equal(report.outcomes[0].status, 'held')
})

test('a filing held but NOT indexed is re-indexed, not re-downloaded', async () => {
  // index_status 'failed' is a retryable state by law (standard §5). The document
  // row and its extracted pages are real; only the derived chunks are missing, and
  // re-fetching the PDF to rebuild them would pay MAYA for bytes we already have.
  const { db } = fakeDb([{ id: 'doc-9', maya_report_id: 9, company_id: CO, index_status: 'failed' }])
  const d = deps()
  const report = await syncCompanyFilings(
    { db, ...d },
    { companyId: CO, sources: [src({ mayaReportId: 9 })] }
  )
  assert.deepEqual(d.ingested, [])
  assert.deepEqual(d.reindexed, ['doc-9'])
  assert.equal(report.outcomes[0].status, 'reindexed')
})

test('a filing held under a DIFFERENT company is reported, never silently re-ingested', async () => {
  // company_documents_maya_report_uniq (migration 019) is GLOBALLY unique — its
  // own header names joint filings by two issuers as the known case. Ingesting
  // would hit that index and 23505; skipping quietly would leave the operator
  // believing the company's corpus is complete. So it is said out loud.
  const { db } = fakeDb([{ id: 'doc-7', maya_report_id: 7, company_id: 'co-other', index_status: 'indexed' }])
  const d = deps()
  const report = await syncCompanyFilings(
    { db, ...d },
    { companyId: CO, sources: [src({ mayaReportId: 7 })] }
  )
  assert.deepEqual(d.ingested, [])
  assert.equal(report.outcomes[0].status, 'held-elsewhere')
})

test('an ingest failure is recorded per filing and the rest of the company still runs', async () => {
  // 234 companies in one pass: one bad PDF must not end the run. The failure is on
  // the row it belongs to, and the run's exit status counts it.
  const { db } = fakeDb([])
  const d = deps({
    ingest: async (s: RemoteSource) => {
      if (s.mayaReportId === 2) throw new Error('not a PDF (212 bytes)')
      return { documentId: `doc-${s.mayaReportId}`, pageCount: 3 }
    },
  })
  const report = await syncCompanyFilings(
    { db, ...d },
    { companyId: CO, sources: [src({ mayaReportId: 2 }), src({ mayaReportId: 3, period: 'FY 2025' })] }
  )
  assert.equal(report.outcomes[0].status, 'failed')
  assert.match((report.outcomes[0] as { error: string }).error, /not a PDF/)
  assert.equal(report.outcomes[1].status, 'ingested')
  assert.equal(report.failed, 1)
  assert.equal(report.ingested, 1)
})

test('a 23505 race resolves to the row that won — the sweep and the click converge', async () => {
  // Standard §7's requirement, verbatim. The dedupe read is a separate statement
  // from the write, so two callers can both pass it; the unique index is the
  // guarantee and this is the catch-and-reread the from-maya route established.
  const { db } = fakeDb([])
  const d = deps({
    ingest: async () => {
      throw new Error('duplicate key value violates unique constraint "company_documents_maya_report_uniq"')
    },
  })
  const report = await syncCompanyFilings(
    { db, ...d },
    { companyId: CO, sources: [src({ mayaReportId: 4 })] }
  )
  assert.equal(report.outcomes[0].status, 'held', 'the other caller got there first — not a failure')
  assert.equal(report.failed, 0)
})

// ── the (company, quarter, doc_type) collision, which only bites at this scale ──

test('two selected filings that would land on ONE row: the newest wins, VISIBLY', async () => {
  // company_documents has unique (company_id, quarter, doc_type) — migration 012,
  // still the upsert target, and removing it is hook-blocked (019's header says so
  // explicitly). Two investor decks published in the same year both carry
  // period "2026" and doc_type 'slides', so the second one's upsert UPDATES the
  // first one's row: one document silently replaces another that we downloaded,
  // extracted and paid to embed.
  //
  // Ingesting both and letting the loser vanish is the "success UI for content the
  // server dropped" shape app.md forbids. So the collision is resolved BEFORE any
  // download, the newest is kept, and the displaced filing is named in the report.
  const { db } = fakeDb([])
  const d = deps()
  const report = await syncCompanyFilings(
    { db, ...d },
    {
      companyId: CO,
      sources: [
        src({
          mayaReportId: 20,
          kind: 'presentation',
          docType: 'slides',
          period: '2026',
          publishedISO: '2026-02-01T00:00:00.000Z',
        }),
        src({
          mayaReportId: 21,
          kind: 'presentation',
          docType: 'slides',
          period: '2026',
          publishedISO: '2026-06-01T00:00:00.000Z',
        }),
      ],
    }
  )
  assert.deepEqual(d.ingested, [21], 'only the newest is downloaded — the other would be overwritten')
  const displaced = report.outcomes.find((o) => o.status === 'displaced')
  assert.equal(displaced?.source.mayaReportId, 20)
  assert.equal((displaced as { by: number }).by, 21)
  assert.equal(report.displaced, 1)
})

test('filings that differ in period or type do NOT collide', async () => {
  const { db } = fakeDb([])
  const d = deps()
  const report = await syncCompanyFilings(
    { db, ...d },
    {
      companyId: CO,
      sources: [
        src({ mayaReportId: 30, period: 'Q1 2026', docType: 'report' }),
        src({ mayaReportId: 31, period: 'Q1 2026', docType: 'slides', kind: 'presentation' }),
        src({ mayaReportId: 32, period: 'FY 2025', docType: 'report', kind: 'annual' }),
      ],
    }
  )
  assert.deepEqual(
    d.ingested.sort((a, b) => a - b),
    [30, 31, 32]
  )
  assert.equal(report.displaced, 0)
})

test('the upsert key is the DB’s, not a paraphrase of it', () => {
  // If this drifts from `unique (company_id, quarter, doc_type)` the collision
  // detector goes quietly blind, which is worse than not having one.
  assert.equal(upsertKeyOf(src({ period: 'Q1 2026', docType: 'report' })), `Q1 2026${SEP}report`)
  assert.notEqual(
    upsertKeyOf(src({ period: 'Q1 2026', docType: 'report' })),
    upsertKeyOf(src({ period: 'Q1 2026', docType: 'slides' }))
  )
  // The separator is a character `period` cannot contain. `period` is free-form —
  // built from a regex match on the issuer's own Hebrew title — so joining on a
  // space would let two different (period, type) pairs produce one key and hide a
  // collision from the very check that exists to find them.
  assert.notEqual(
    upsertKeyOf(src({ period: 'Q1', docType: 'report' })),
    upsertKeyOf(src({ period: `Q1${SEP}report`, docType: 'report' }))
  )
})

test('a dry run reads the database but downloads, extracts and embeds nothing', async () => {
  const { db } = fakeDb([{ id: 'doc-40', maya_report_id: 40, company_id: CO, index_status: 'indexed' }])
  const d = deps()
  const report = await syncCompanyFilings(
    { db, ...d },
    {
      companyId: CO,
      sources: [src({ mayaReportId: 40 }), src({ mayaReportId: 41, period: 'FY 2025' })],
      dryRun: true,
    }
  )
  assert.deepEqual(d.ingested, [])
  assert.deepEqual(d.reindexed, [])
  assert.equal(report.outcomes[0].status, 'held')
  assert.equal(report.outcomes[1].status, 'would-ingest')
  // The dry run's count is what the founder is quoted a price from, so it counts
  // the same thing the real run would do — not "every source we looked at".
  assert.equal(report.ingested, 1)
})

test('an empty selection is an empty report, not an error', async () => {
  const { db, queries } = fakeDb([])
  const d = deps()
  const report = await syncCompanyFilings({ db, ...d }, { companyId: CO, sources: [] })
  assert.deepEqual(report.outcomes, [])
  assert.deepEqual(queries, [], 'and it does not spend a query asking about nothing')
})
