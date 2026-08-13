import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { assembleCorpusIndexHealth } from './indexHealth'
import type { CorpusIndexHealth, StatusCounts, TroubledSource } from './indexHealth'

// ─────────────────────────────────────────────────────────────────────────────
// The IO half of the corpus-index screen. All the arithmetic lives in
// `indexHealth.ts`, which is pure and unit-tested; this file only fetches.
//
// ⚠ IT COUNTS, IT DOES NOT LIST — the defect a cold review caught before this
// shipped. The first version selected every `transcripts` and `company_documents`
// row and tallied them in JavaScript. PostgREST caps a select at 1000 rows
// (Supabase's default), this repo already pages around that cap in
// `lib/db/calls.ts`, and slice A5's own backfill takes `company_documents` to
// ~1,178. So the screen built to reveal an under-indexed corpus would itself have
// begun under-reporting at exactly the size that made it worth building — and the
// browser check that passed it ran against 26 documents, which is M1 in one
// sentence.
//
// `head: true` + `count: 'exact'` fetches no rows at all. Exact at any corpus
// size, and the only list reads left are the troubled set, bounded by a status
// filter AND a limit, with its true total counted separately so a cut list is
// reported as cut.
//
// `supabaseAdmin` BYPASSES RLS, and that is legitimate here for the reason
// rules/app.md lists `companies.ts` and `calls.ts` under: these are SHARED CORPUS
// tables with no user rows in them. There is nothing to owner-filter. What gates
// this data is the caller — the page checks `isAdmin` before it reads.
// ⚠ Whoever adds a per-user or per-company view of this later: that is a
// different query and it does NOT inherit this justification.
//
// RETURNS null ON FAILURE, never a zeroed-out health object. A read failure
// rendered as "0 documents, 0 pending, all settled" is the exact shape of lie the
// visible-degradation law exists to forbid — it would report a broken database as
// a healthy empty corpus. Every error below is read; any one of them fails the
// whole screen, because a corpus health report silently missing one table is worse
// than saying nothing.
// ─────────────────────────────────────────────────────────────────────────────

/** The troubled list is bounded. `troubledTotal` is counted separately, so a cut
 *  list is reported as cut rather than passed off as the whole set. */
const TROUBLED_LIMIT = 200

const TROUBLED_STATES = ['pending', 'failed']

type CountResult = { count: number | null; error: { message: string } | null }
type Row = { id: string; title: string | null; index_status: string | null }

const firstError = (rs: Array<{ error: { message: string } | null }>) =>
  rs.map((r) => r.error?.message).find(Boolean) ?? null

function countsOf(rs: CountResult[]): StatusCounts {
  const [total, pending, indexed, failed, excluded] = rs.map((r) => r.count ?? 0)
  return { total, pending, indexed, failed, excluded }
}

/** One exact head-count per state, plus the table total — `other` falls out of the
 *  subtraction in `indexHealth.ts`, which is how an unrecognised state stays
 *  visible instead of being folded into a familiar bucket. */
function statusCounts(table: string): Array<PromiseLike<CountResult>> {
  const head = () => supabaseAdmin.from(table).select('id', { count: 'exact', head: true })
  return [
    head(),
    head().eq('index_status', 'pending'),
    head().eq('index_status', 'indexed'),
    head().eq('index_status', 'failed'),
    head().eq('index_status', 'excluded'),
  ] as unknown as Array<PromiseLike<CountResult>>
}

export async function readCorpusIndexHealth(): Promise<CorpusIndexHealth | null> {
  const factsHead = () => supabaseAdmin.from('company_documents').select('id', { count: 'exact', head: true })

  // NAMED, NOT POSITIONAL. An earlier draft indexed into one flat results array;
  // one reordered line there and this screen reports another table's numbers with
  // nothing to notice — a silent wrong answer in the file whose whole job is to
  // stop those.
  const [
    transcriptCounts,
    documentCounts,
    chunks,
    factsTotal,
    factsYes,
    factsNone,
    factsFailed,
    troubledCountT,
    troubledCountD,
    troubledT,
    troubledD,
  ] = await Promise.all([
    Promise.all(statusCounts('transcripts')),
    Promise.all(statusCounts('company_documents')),
    supabaseAdmin.from('document_chunks').select('id', { count: 'exact', head: true }),
    factsHead(),
    factsHead().eq('facts_status', 'facts'),
    factsHead().eq('facts_status', 'none'),
    factsHead().eq('facts_status', 'failed'),
    supabaseAdmin
      .from('transcripts')
      .select('id', { count: 'exact', head: true })
      .in('index_status', TROUBLED_STATES),
    supabaseAdmin
      .from('company_documents')
      .select('id', { count: 'exact', head: true })
      .in('index_status', TROUBLED_STATES),
    supabaseAdmin
      .from('transcripts')
      .select('id, title:youtube_title, index_status')
      .in('index_status', TROUBLED_STATES)
      .limit(TROUBLED_LIMIT),
    supabaseAdmin
      .from('company_documents')
      .select('id, title, index_status')
      .in('index_status', TROUBLED_STATES)
      .limit(TROUBLED_LIMIT),
  ])

  const failure = firstError([
    ...transcriptCounts,
    ...documentCounts,
    chunks,
    factsTotal,
    factsYes,
    factsNone,
    factsFailed,
    troubledCountT,
    troubledCountD,
    troubledT,
    troubledD,
  ] as Array<{ error: { message: string } | null }>)
  if (failure) {
    console.error('[corpus-index] read failed:', failure)
    return null
  }

  const asTroubled = (rows: Row[] | null, kind: TroubledSource['kind']): TroubledSource[] =>
    (rows ?? []).map((r) => ({
      kind,
      id: r.id,
      // A source with no title is a real row, not a missing one; its id is the only
      // honest thing to show, and showing nothing would make it unfindable.
      title: r.title || r.id,
      status: r.index_status ?? 'pending',
    }))

  return assembleCorpusIndexHealth({
    transcripts: countsOf(transcriptCounts),
    documents: countsOf(documentCounts),
    facts: {
      total: factsTotal.count ?? 0,
      facts: factsYes.count ?? 0,
      none: factsNone.count ?? 0,
      failed: factsFailed.count ?? 0,
    },
    chunks: chunks.count ?? 0,
    troubled: [
      ...asTroubled(troubledT.data as Row[] | null, 'transcript'),
      ...asTroubled(troubledD.data as Row[] | null, 'document'),
    ],
    troubledTotal: (troubledCountT.count ?? 0) + (troubledCountD.count ?? 0),
  })
}
