// ─────────────────────────────────────────────────────────────────────────────
// RETRIEVAL — the one door corpus chunks are READ through, as reindex.ts is the
// one door they are written through.
//
// ⚠ THE SHIPPED DESIGN IS DENSE-ONLY — semantic search, not the hybrid the eval
// picked. Founder decision 2026-08-14, in DECISIONS.md: *"okay yes lets just go
// with the semantic search now, and after we finish working on the rest of the
// tickets and test the product we can come back to it and improving it."*
//
// The reason it is not the hybrid, so nobody "fixes" this back: slice A4 ran the
// standing eval against the REAL database and the lexical channel did not
// reproduce. Postgres has no IDF — `ts_rank_cd` scores `שנת` (96% of chunks)
// like `ההכנסות` (5%) — so lexical fell from MRR 0.207 to 0.075 and, fused by
// RRF, dragged the chosen hybrid to 0.141, BELOW dense-only's 0.268. Dense
// reproduced its measured numbers exactly. Full evidence and the four options he
// chose between: docs/evidence/feat-smart-layer-a4-backfill/gate.md.
//
// The lexical channel is NOT deleted. `atlas_search_chunks` still accepts it, so
// the revisit he asked for costs a flag rather than a rebuild — but it must not
// become the default again without a fresh harness run (§5 of the ingestion
// standard is explicit that changing the retrieval shape re-runs the gate).
//
// ONE RETRIEVER, for the same reason there is one chunker (standard §5): the
// harness scores THIS module, so what the gate certifies and what a user's
// question runs through cannot drift apart. All ranking lives in
// `atlas_search_chunks` (migration 029); this file adds the query embedding and
// the row shape and nothing else.
//
// FAILURE IS VISIBLE: an RPC error throws with its message. An empty result is
// NOT an error — "the resolved scope has no corpus content" is the honest
// cannot-ground signal the eval set's case 17 exists to demand, and the caller
// must be able to tell those two apart (M3.3).
// ─────────────────────────────────────────────────────────────────────────────

import { embedQuery, toVectorLiteral, type EmbedOptions } from './embed'
import type { CorpusDb } from './reindex'

/**
 * Which channels rank. `dense` is the shipped default (founder 2026-08-14).
 * `hybrid` and `lexical` remain reachable for the promised revisit and for the
 * harness, and BOTH are known not to reproduce the eval on this database.
 */
export type RetrievalChannels = 'dense' | 'hybrid' | 'lexical'

/** Semantic search. Changing this re-runs the eval gate — it is a design change. */
const DEFAULT_CHANNELS: RetrievalChannels = 'dense'

export interface RetrieveOptions {
  /** The user's question, verbatim. */
  query: string
  /** Resolved TASE issuer, when the question has one. The measured multiplier. */
  companyId?: string | null
  /** Rows returned. */
  limit?: number
  /** Candidate depth per channel before ranking. */
  candidates?: number
  /** Defaults to `dense`. Anything else is off the measured path — see the header. */
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
  const channels = opts.channels ?? DEFAULT_CHANNELS
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
