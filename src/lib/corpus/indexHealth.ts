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
// ⚠ IT TAKES COUNTS, NOT ROWS, AND THAT IS THE POINT. The first version of this
// module tallied a list of every row — which a cold review caught: PostgREST caps
// a select at 1000 rows, this repo already pages around that cap elsewhere
// (`lib/db/calls.ts`), and A5's own backfill takes `company_documents` past it.
// A screen built to reveal an under-indexed corpus would itself have started
// under-reporting at exactly the size that made it necessary, and the browser
// check that passed it measured a 26-document corpus (M1 — a green signal proves
// only what it measured). Counts are exact at any corpus size and cost one head
// request each.
//
// PURE, for the usual reason: this is the part that can be wrong in a way that
// looks right, and a Server Component cannot be unit-tested.
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
  /** How many troubled sources exist in total. `troubled.length` can be smaller:
   *  the list is bounded, and a screen that showed 200 of 900 without saying so
   *  would be the same lie one level down. */
  troubledTotal: number
  /** True when every corpus source has reached a settled state. NOT the same as
   *  "nothing is wrong": an `excluded` row is settled and deliberate. */
  settled: boolean
}

/** What the DB layer counts, per table. `total` is counted separately from the
 *  four known states precisely so an unrecognised one cannot hide. */
export interface StatusCounts {
  total: number
  pending: number
  indexed: number
  failed: number
  excluded: number
}

export interface HealthInput {
  transcripts: StatusCounts
  documents: StatusCounts
  facts: { total: number; facts: number; none: number; failed: number }
  chunks: number
  troubled: TroubledSource[]
  troubledTotal: number
}

function tally(c: StatusCounts): StatusTally {
  // `other` IS A SUBTRACTION, and that is deliberate: it cannot be enumerated,
  // because the whole point is to catch a status nobody has thought of yet. Any
  // value the column grows later lands here and stays visible instead of being
  // silently read as one of the four we know. Clamped at 0 so a count taken across
  // a concurrent write — which this slice's three unattended writers make routine —
  // shows 0 rather than a negative that reads as a bug in the screen.
  const known = c.pending + c.indexed + c.failed + c.excluded
  return {
    pending: c.pending,
    indexed: c.indexed,
    failed: c.failed,
    excluded: c.excluded,
    other: Math.max(0, c.total - known),
    total: c.total,
  }
}

const TROUBLED_ORDER: Record<string, number> = { failed: 0, pending: 1 }

export function assembleCorpusIndexHealth(input: HealthInput): CorpusIndexHealth {
  const transcripts = tally(input.transcripts)
  const documents = tally(input.documents)

  const f = input.facts
  const facts: FactsTally = {
    facts: f.facts,
    none: f.none,
    failed: f.failed,
    unknown: Math.max(0, f.total - (f.facts + f.none + f.failed)),
  }

  const troubled = [...input.troubled].sort(
    (a, b) =>
      (TROUBLED_ORDER[a.status] ?? 9) - (TROUBLED_ORDER[b.status] ?? 9) || a.title.localeCompare(b.title)
  )

  return {
    transcripts,
    documents,
    facts,
    chunks: input.chunks,
    troubled,
    troubledTotal: input.troubledTotal,
    // `other` counts too: an unrecognised state is not a settled one, whatever
    // else it might be.
    settled:
      transcripts.pending + transcripts.failed + transcripts.other === 0 &&
      documents.pending + documents.failed + documents.other === 0,
  }
}
