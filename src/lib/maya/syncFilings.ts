import type { RemoteSource } from './filings'
import type { CorpusDb, ReindexResult } from '@/lib/corpus/reindex'

// ─────────────────────────────────────────────────────────────────────────────
// ONE DOOR FOR EVERY WAY A MAYA FILING JOINS THE CORPUS.
//
// Three callers, one sequence: the A5 backfill (234 companies, once), the
// ~10-minute poller (a filing published at 09:00 searchable by ~09:15), and the
// nightly per-company sweep (the coverage guarantee, because an earnings-season
// burst can outrun a 30-row feed). The ingestion standard §7 requires exactly
// this — "they invoke the SAME birth sequence per document; idempotency comes
// from the identity keys, so a sweep and a user click racing on one filing
// converge on one row" — and the cheapest way to obey it is for there to be only
// one place the sequence is written down.
//
// IT DECIDES WHAT TO SPEND, WHICH IS THE POINT. Everything expensive is
// downstream: a MAYA download, pdf.js extraction over a 300-page annual report,
// an embedding call per chunk. So this module's whole job is to answer "which of
// these filings do we not already have" correctly, and to say out loud what it
// skipped and why. A skip that is right saves the run; a skip that is silent is
// how a corpus ends up incomplete while every log line reads "ok".
//
// WHAT IT DOES NOT DO: fetch catalogs (that is `listDisclosures`), choose depth
// (`selectLatestOfEach`), or resolve companies. It is handed a company and a set
// of filings and it reconciles them against what Atlas holds.
// ─────────────────────────────────────────────────────────────────────────────

/** The side effects, injected — so every rule above is testable without a
 *  request, a PDF or a cent of embedding spend. `realSyncDeps` builds the
 *  production pair. */
export interface SyncDeps {
  db: CorpusDb
  /** `ingestFiling` — download, extract, upsert the row, chunk and embed. */
  ingest: (source: RemoteSource) => Promise<{ documentId: string; pageCount: number }>
  /** `reindexDocument` — chunks + embeddings only, for a row we already hold. */
  reindex: (documentId: string) => Promise<ReindexResult>
}

export type FilingOutcome =
  /** Downloaded, extracted, chunked, embedded. The one that costs money. */
  | { status: 'ingested'; source: RemoteSource; documentId: string; pageCount: number }
  /** Held, but its chunks were missing or failed — rebuilt without re-downloading. */
  | { status: 'reindexed'; source: RemoteSource; documentId: string; index: ReindexResult }
  /** Held and indexed. Nothing to do, nothing spent. */
  | { status: 'held'; source: RemoteSource; documentId: string }
  /** Held under a DIFFERENT company — said out loud, never silently re-ingested. */
  | { status: 'held-elsewhere'; source: RemoteSource; documentId: string; companyId: string }
  /** Not fetched: another filing in this same selection owns its upsert row. */
  | { status: 'displaced'; source: RemoteSource; by: number }
  /** What a dry run would have ingested. */
  | { status: 'would-ingest'; source: RemoteSource }
  | { status: 'failed'; source: RemoteSource; error: string }

export interface FilingSyncReport {
  companyId: string
  outcomes: FilingOutcome[]
  /** Documents this run added (or would add, in a dry run) — the cost line. */
  ingested: number
  reindexed: number
  failed: number
  displaced: number
  pages: number
}

export type SyncArgs = {
  companyId: string
  sources: RemoteSource[]
  dryRun?: boolean
}

/**
 * The row key `company_documents` actually upserts on, minus the company.
 *
 * `unique (company_id, quarter, doc_type)` — migration 012, and still the upsert
 * target because removing it is hook-blocked (migration 019's header says so in
 * as many words). Spelled out here, in one function, so the collision check below
 * and the constraint cannot drift apart: a paraphrase that drifts goes quietly
 * blind, which is worse than not checking at all.
 */
/** ASCII unit separator, spelled as an escape and never typed raw: an invisible
 *  control character sitting in a source file is the CRLF trap in a new hat. */
const KEY_SEP = '\u001f'

export function upsertKeyOf(source: RemoteSource): string {
  // A unit separator, not a space: `period` is free-form (read out of the
  // issuer's Hebrew title by regex), so a space could join two different
  // (period, type) pairs into one key — hiding a collision from the check whose
  // only job is to find them.
  return `${source.period}${KEY_SEP}${source.docType}`
}

/** Newest first, ties on identity — the same total order the selector uses. */
function newestFirst(a: RemoteSource, b: RemoteSource): number {
  if (a.publishedISO !== b.publishedISO) return a.publishedISO < b.publishedISO ? 1 : -1
  return b.mayaReportId - a.mayaReportId
}

const UNIQUE_VIOLATION = /duplicate key value|23505/i

type HeldRow = { id: string; maya_report_id: number; company_id: string; index_status: string }

/**
 * TWO FILINGS THAT WOULD LAND ON ONE ROW, resolved before anything is downloaded.
 *
 * `company_documents` is unique on (company_id, quarter, doc_type), and `period`
 * is only as specific as the filing's event ids allow: a deck carrying nothing but
 * `270 מצגת` gets the bare publication year, so a company's two investor decks
 * from one year both key on `2026 slides`. Ingest both and the second one's upsert
 * UPDATES the first one's row — a document we downloaded, extracted and paid to
 * embed, replaced by another, with nothing anywhere saying it happened. That is
 * "success UI for content the server dropped", one layer down (app.md).
 *
 * The constraint cannot be removed here, so this does the next honest thing: keeps
 * the newest, spends nothing on the rest, and NAMES them in the report. How often
 * it actually fires is a measurement the backfill's dry run makes, not a guess
 * this comment is entitled to.
 */
function resolveCollisions(sources: RemoteSource[]): {
  keep: RemoteSource[]
  displaced: Array<{ source: RemoteSource; by: number }>
} {
  const groups = new Map<string, RemoteSource[]>()
  for (const s of sources) {
    const key = upsertKeyOf(s)
    groups.set(key, [...(groups.get(key) ?? []), s])
  }

  const keep: RemoteSource[] = []
  const displaced: Array<{ source: RemoteSource; by: number }> = []
  // Array.from rather than iterating the Map: this repo's tsconfig target predates it.
  for (const group of Array.from(groups.values())) {
    const [winner, ...rest] = [...group].sort(newestFirst)
    keep.push(winner)
    for (const loser of rest) displaced.push({ source: loser, by: winner.mayaReportId })
  }
  return { keep, displaced }
}

export async function syncCompanyFilings(deps: SyncDeps, args: SyncArgs): Promise<FilingSyncReport> {
  const outcomes: FilingOutcome[] = []
  const report = (): FilingSyncReport => ({
    companyId: args.companyId,
    outcomes,
    // COUNTED OFF THE OUTCOMES, never tallied as we go. A run's own belief about
    // what it did is the thing that turns out to be wrong (M1); the outcome list
    // is the record, so the totals are derived from it.
    ingested: outcomes.filter((o) => o.status === 'ingested' || o.status === 'would-ingest').length,
    reindexed: outcomes.filter((o) => o.status === 'reindexed').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
    displaced: outcomes.filter((o) => o.status === 'displaced').length,
    pages: outcomes.reduce((n, o) => n + (o.status === 'ingested' ? o.pageCount : 0), 0),
  })

  if (!args.sources.length) return report()

  const { keep, displaced } = resolveCollisions(args.sources)
  for (const d of displaced) outcomes.push({ status: 'displaced', source: d.source, by: d.by })

  // ONE READ FOR THE WHOLE COMPANY, not one per filing. `maya_report_id` is
  // globally unique (019), so this is asked WITHOUT a company filter on purpose:
  // a filing held under another issuer must come back and be reported, not fall
  // through the filter and hit the unique index as a surprise 23505.
  const { data, error } = await deps.db
    .from('company_documents')
    .select('id, maya_report_id, company_id, index_status')
    .in(
      'maya_report_id',
      keep.map((s) => s.mayaReportId)
    )
  if (error) throw new Error(`syncCompanyFilings: reading held filings failed — ${error.message}`)
  const held = new Map<number, HeldRow>(((data as HeldRow[] | null) ?? []).map((r) => [r.maya_report_id, r]))

  for (const source of keep) {
    const row = held.get(source.mayaReportId)

    if (row && row.company_id !== args.companyId) {
      outcomes.push({
        status: 'held-elsewhere',
        source,
        documentId: row.id,
        companyId: row.company_id,
      })
      continue
    }

    if (row) {
      // 'indexed' is the only settled state. 'pending' and 'failed' both mean the
      // derived chunks are missing, and by law 'failed' is retryable (standard §5)
      // — but the DOCUMENT and its extracted pages are real, so rebuilding them
      // costs an embedding call and not another trip to MAYA.
      if (row.index_status === 'indexed') {
        outcomes.push({ status: 'held', source, documentId: row.id })
        continue
      }
      if (args.dryRun) {
        outcomes.push({ status: 'held', source, documentId: row.id })
        continue
      }
      try {
        const index = await deps.reindex(row.id)
        outcomes.push({ status: 'reindexed', source, documentId: row.id, index })
      } catch (e) {
        outcomes.push({ status: 'failed', source, error: (e as Error).message })
      }
      continue
    }

    if (args.dryRun) {
      outcomes.push({ status: 'would-ingest', source })
      continue
    }

    try {
      const { documentId, pageCount } = await deps.ingest(source)
      outcomes.push({ status: 'ingested', source, documentId, pageCount })
    } catch (e) {
      const message = (e as Error).message
      // THE RACE THE STANDARD NAMES. The read above and this write are separate
      // statements, so the poller and the sweep — or a sweep and a user's click —
      // can both pass the read. `company_documents_maya_report_uniq` is the
      // guarantee; catching it and re-reading is the from-maya route's established
      // pattern. Not a failure: the filing IS in the corpus, put there by whoever
      // won, and one run of 234 companies must not end on a race it survived.
      if (UNIQUE_VIOLATION.test(message)) {
        const { data: after } = await deps.db
          .from('company_documents')
          .select('id, maya_report_id, company_id, index_status')
          .in('maya_report_id', [source.mayaReportId])
        const winner = ((after as HeldRow[] | null) ?? [])[0]
        outcomes.push({ status: 'held', source, documentId: winner?.id ?? '' })
        continue
      }
      // One bad PDF must not end a 234-company pass. The failure lands on the
      // filing it belongs to and the run's exit status counts it.
      outcomes.push({ status: 'failed', source, error: message })
    }
  }

  return report()
}

/**
 * The production wiring, in one place, so the backfill, the poller and the sweep
 * cannot drift into three slightly different birth sequences.
 *
 * `ingestFiling` is the whole of steps 3–6 of the standard (download, extract,
 * upsert with `publication_date`, XBRL facts with a visible `facts_status`, chunk
 * and embed); `reindexDocument` is steps 5–6 alone, for a row we already hold.
 */
export function realSyncDeps(a: {
  db: CorpusDb
  companyId: string
  supabaseUrl: string
  serviceRoleKey: string
  ingestFiling: typeof import('./ingestFiling').ingestFiling
  reindexDocument: typeof import('@/lib/corpus/reindex').reindexDocument
}): SyncDeps {
  return {
    db: a.db,
    ingest: (source) =>
      a.ingestFiling({
        source,
        companyId: a.companyId,
        supabaseUrl: a.supabaseUrl,
        serviceRoleKey: a.serviceRoleKey,
      }),
    reindex: (documentId) => a.reindexDocument(a.db, documentId),
  }
}

/** A one-line rendering for a run's log. Never for the UI — the UI says it in the
 *  user's own language, from a dictionary key. */
export function describeOutcome(o: FilingOutcome): string {
  switch (o.status) {
    case 'ingested':
      return `ingested ${o.pageCount}p — ${o.source.title}`
    case 'reindexed':
      return `re-indexed (held, chunks missing) — ${o.source.title}`
    case 'held':
      return `already held — ${o.source.title}`
    case 'held-elsewhere':
      return `HELD UNDER ANOTHER COMPANY (${o.companyId}) — ${o.source.title}`
    case 'displaced':
      return `NOT fetched, would overwrite maya:${o.by} on (period, type) — ${o.source.title}`
    case 'would-ingest':
      return `would ingest — ${o.source.title}`
    case 'failed':
      return `FAILED — ${o.source.title}: ${o.error}`
  }
}
