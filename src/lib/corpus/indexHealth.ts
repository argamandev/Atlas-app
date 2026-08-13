// ─────────────────────────────────────────────────────────────────────────────
// WHAT THE CORPUS IS ACTUALLY CARRYING — the admin view model.
//
// The ingestion standard §5 makes indexing failure VISIBLE by law: every corpus
// source carries `index_status` (pending / indexed / failed / excluded), a failed
// embed retries, and "search never pretends an unindexed document doesn't exist".
// Slice A3 landed the column and said the rest out loud in its own accounting
// table — *"Admin surface: NOT YET BUILT — the status is queryable; a screen shows
// it when A5's admin view lands (owed there)"*. This is that screen's arithmetic.
//
// IT MATTERS MOST AT THIS SLICE. Through A4 the corpus was 26 documents, and
// "queryable" was a fair substitute for visible because one person could read all
// 26 rows. After A5's backfill it is ~1,200 documents ingested by three unattended
// callers — a backfill, a ten-minute poller and a nightly sweep. A status nobody
// can see is a status nobody checks, and a corpus quietly 8% unindexed answers
// questions confidently out of the 92% it happens to hold.
//
// PURE, taking rows in and giving a view model out, for the usual reason: this is
// the part that can be wrong in a way that looks right, and a Server Component
// cannot be unit-tested.
// ─────────────────────────────────────────────────────────────────────────────

/** The four states migration 028 defines, plus a bucket for anything else the
 *  column ever holds — an unknown state must be COUNTED, not dropped into the
 *  nearest familiar one. */
export interface StatusTally {
  pending: number
  indexed: number
  failed: number
  excluded: number
  other: number
  total: number
}

export interface FactsTally {
  facts: number
  none: number
  failed: number
  /** NULL — predates migration 028, or not yet examined. A different fact from
   *  'none', which is a settled answer ("this filing has no structured facts"). */
  unknown: number
}

/** A source that is NOT in a settled state — what the screen exists to show. */
export interface TroubledSource {
  kind: 'transcript' | 'document'
  id: string
  title: string
  status: string
}

export interface CorpusIndexHealth {
  transcripts: StatusTally
  documents: StatusTally
  facts: FactsTally
  chunks: number
  /** `failed` first, then `pending` — a failure is a thing to act on, a pending
   *  row is usually a thing in flight. */
  troubled: TroubledSource[]
  /** True when every corpus source has reached a settled state. NOT the same as
   *  "nothing is wrong": an `excluded` row is settled and deliberate. */
  settled: boolean
}

export interface StatusRow {
  id: string
  title: string
  index_status: string | null
}

export interface DocumentStatusRow extends StatusRow {
  facts_status: string | null
}

const EMPTY: StatusTally = { pending: 0, indexed: 0, failed: 0, excluded: 0, other: 0, total: 0 }

function tally(rows: Array<{ index_status: string | null }>): StatusTally {
  const out: StatusTally = { ...EMPTY }
  for (const r of rows) {
    out.total++
    // A NULL index_status is 'pending' at the database (028 declares the column
    // NOT NULL DEFAULT 'pending'), but this reads a query result, not the schema.
    // Treating an unexpected value as 'indexed' is the one mistake that would
    // make this screen lie in the reassuring direction, so anything unrecognised
    // goes to `other` and stays visible.
    const s = r.index_status ?? 'pending'
    if (s === 'pending' || s === 'indexed' || s === 'failed' || s === 'excluded') out[s]++
    else out.other++
  }
  return out
}

const TROUBLED_ORDER: Record<string, number> = { failed: 0, pending: 1 }
const isTroubled = (s: string) => s === 'failed' || s === 'pending'

export function buildCorpusIndexHealth(input: {
  transcripts: StatusRow[]
  documents: DocumentStatusRow[]
  chunks: number
}): CorpusIndexHealth {
  const transcripts = tally(input.transcripts)
  const documents = tally(input.documents)

  const facts: FactsTally = { facts: 0, none: 0, failed: 0, unknown: 0 }
  for (const d of input.documents) {
    if (d.facts_status === 'facts') facts.facts++
    else if (d.facts_status === 'none') facts.none++
    else if (d.facts_status === 'failed') facts.failed++
    else facts.unknown++
  }

  const troubled: TroubledSource[] = [
    ...input.transcripts.map((r) => ({ kind: 'transcript' as const, ...r })),
    ...input.documents.map((r) => ({ kind: 'document' as const, ...r })),
  ]
    .map((r) => ({ kind: r.kind, id: r.id, title: r.title, status: r.index_status ?? 'pending' }))
    .filter((r) => isTroubled(r.status))
    .sort((a, b) => TROUBLED_ORDER[a.status] - TROUBLED_ORDER[b.status] || a.title.localeCompare(b.title))

  return {
    transcripts,
    documents,
    facts,
    chunks: input.chunks,
    troubled,
    // `other` counts too: an unrecognised state is not a settled one, whatever
    // else it might be.
    settled:
      transcripts.pending + transcripts.failed + transcripts.other === 0 &&
      documents.pending + documents.failed + documents.other === 0,
  }
}
