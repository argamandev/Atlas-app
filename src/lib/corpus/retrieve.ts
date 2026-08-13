// ─────────────────────────────────────────────────────────────────────────────
// RETRIEVAL — the real pipeline: pgvector + the real Postgres lexical channel.
//
// The counterpart of reindex.ts. Where that module is the ONE door chunks are
// written through, this is the ONE door they are read through: the measured
// design C-gemini(-scoped) — dense cosine over gemini-embedding-001 @1536, the
// dual-form 'simple' tsvector, RRF (k=50, 1/1), optional company PRE-filter.
//
// ONE RETRIEVER, for the same reason there is one chunker (ingestion standard
// §5): the standing eval harness scores THIS module, so what the gate certifies
// and what a user's question runs through cannot drift apart. A harness
// measuring a copy certifies a fiction (M2). All of the ranking itself lives in
// `atlas_search_chunks` (migration 029) — this file adds the query embedding and
// the row shape, and nothing else, so there is no second place for the design to
// be re-implemented slightly differently.
//
// FAILURE IS VISIBLE: an RPC error throws with its message. An empty result is
// NOT an error — "the resolved scope has no corpus content" is the honest
// cannot-ground signal the eval set's case 17 exists to demand, and the caller
// must be able to tell those two apart (M3.3).
// ─────────────────────────────────────────────────────────────────────────────

import { embedQuery, toVectorLiteral, type EmbedOptions } from './embed'
import type { CorpusDb } from './reindex'

/** Which channels feed the fusion. `hybrid` is the measured winner. */
export type RetrievalChannels = 'hybrid' | 'dense' | 'lexical'

export interface RetrieveOptions {
  /** The user's question, verbatim — it feeds both channels. */
  query: string
  /** Resolved TASE issuer, when the question has one. The measured multiplier. */
  companyId?: string | null
  /** Rows returned after fusion. */
  limit?: number
  /** Per-channel depth before fusion — the pool RRF sees. */
  candidates?: number
  channels?: RetrievalChannels
  embed?: EmbedOptions
}

export interface RetrievedChunk {
  id: string
  sourceType: 'transcript' | 'filing'
  transcriptId: string | null
  documentId: string | null
  companyId: string
  revision: number
  /** Transcript anchors — the "call · minute · line" citation. */
  firstLineId: string | null
  lastLineId: string | null
  /** Filing anchors. */
  pageNo: number | null
  partNo: number | null
  section: string | null
  speakers: string[] | null
  /** Verbatim and citable — never the embedding_input prefix (standard §5). */
  content: string
  /** Rank within each channel before fusion; null = this channel did not return it. */
  denseRank: number | null
  lexicalRank: number | null
  score: number
}

/**
 * What one channel actually saw. `saw === candidates` means the channel filled
 * its pool and MAY have been cut off; anything below it saw everything there was
 * to see. `ran: false` is a channel this call switched off — a different fact
 * from one that ran and found nothing.
 */
export interface ChannelReport {
  ran: boolean
  saw: number
  truncated: boolean
}

/**
 * The result is an OBJECT, not a bare array, and that is the whole point.
 *
 * A thin answer and a complete one look identical as a list of rows. An HNSW
 * scan under a company filter can hand back a fraction of what the company
 * holds; a lexical channel can fill its candidate pool and stop. Returning the
 * rows alone makes "we searched everything and this is all there is"
 * unrepresentable as distinct from "we stopped looking" — the degradation
 * app.md requires to be VISIBLE. Callers destructure `chunks`; the two reports
 * sit right beside it, unignorable, for whoever renders or reasons about
 * completeness.
 */
export interface RetrievalResult {
  chunks: RetrievedChunk[]
  dense: ChannelReport
  lexical: ChannelReport
}

type ChunkRpcRow = {
  id: string
  source_type: string
  transcript_id: string | null
  document_id: string | null
  company_id: string
  revision: number
  first_line_id: string | null
  last_line_id: string | null
  page_no: number | null
  part_no: number | null
  section: string | null
  speakers: string[] | null
  content: string
  dense_rank: number | null
  lexical_rank: number | null
  score: number
  dense_candidates: number
  lexical_candidates: number
}

const DEFAULT_LIMIT = 20
const DEFAULT_CANDIDATES = 200

// ⚠ WHAT `truncated` DOES AND DOES NOT MEAN — worth stating, because the first
// version of this got it wrong in the loud direction. It means one thing: the
// channel returned as many rows as the pool allowed, so there may have been
// more. Nothing else. In particular `hnsw.ef_search` (capped at 1000 by
// Postgres) bounds the index scan's EFFORT, not the row count — the planner is
// free to answer exactly, and on this corpus it does, returning all 3,181 rows
// for an unscoped query. Comparing the count against that ceiling reported five
// designs × nineteen cases as truncated when not one of them was.
//
// The honest residual, which no counter can show: HNSW is APPROXIMATE. A dense
// channel can miss a genuine neighbour without ever filling its pool. That is a
// property of the index, not a truncation, and it is measured by the eval gate
// rather than flagged per query.

export async function retrieveChunks(db: CorpusDb, opts: RetrieveOptions): Promise<RetrievalResult> {
  const channels = opts.channels ?? 'hybrid'
  const query = opts.query ?? ''
  if (!query.trim()) throw new Error('retrieveChunks: an empty query retrieves nothing meaningful')
  const candidates = opts.candidates ?? DEFAULT_CANDIDATES

  // The dense channel needs the query embedded under RETRIEVAL_QUERY — the other
  // half of the asymmetric pair the corpus was embedded with. An embedding
  // failure throws here rather than quietly degrading to lexical-only: a
  // half-strength search that looks like a full one is the lie M3.3 forbids.
  const embedding = channels === 'lexical' ? null : toVectorLiteral(await embedQuery(query, opts.embed ?? {}))

  const { data, error } = await db.rpc('atlas_search_chunks', {
    p_query_embedding: embedding,
    p_query_text: channels === 'dense' ? null : query,
    p_company_id: opts.companyId ?? null,
    p_limit: opts.limit ?? DEFAULT_LIMIT,
    p_candidates: candidates,
  })
  if (error) throw new Error(`retrieveChunks: ${error.message}`)

  const rows = (data as ChunkRpcRow[] | null) ?? []
  const report = (ran: boolean, saw: number, pool: number): ChannelReport => ({
    ran,
    saw: ran ? saw : 0,
    truncated: ran && saw >= pool,
  })

  return {
    chunks: rows.map((r) => ({
      id: r.id,
      sourceType: r.source_type === 'transcript' ? 'transcript' : ('filing' as const),
      transcriptId: r.transcript_id,
      documentId: r.document_id,
      companyId: r.company_id,
      revision: r.revision,
      firstLineId: r.first_line_id,
      lastLineId: r.last_line_id,
      pageNo: r.page_no,
      partNo: r.part_no,
      section: r.section,
      speakers: r.speakers,
      content: r.content,
      denseRank: r.dense_rank,
      lexicalRank: r.lexical_rank,
      score: r.score,
    })),
    // Zero rows carry no per-channel count, so both report the honest zero
    // rather than an absent field the caller would have to guess about.
    dense: report(channels !== 'lexical', rows[0]?.dense_candidates ?? 0, candidates),
    lexical: report(channels !== 'dense', rows[0]?.lexical_candidates ?? 0, candidates),
  }
}
