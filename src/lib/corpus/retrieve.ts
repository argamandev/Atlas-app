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
}

const DEFAULT_LIMIT = 20
const DEFAULT_CANDIDATES = 200

export async function retrieveChunks(db: CorpusDb, opts: RetrieveOptions): Promise<RetrievedChunk[]> {
  const channels = opts.channels ?? 'hybrid'
  const query = opts.query ?? ''
  if (!query.trim()) throw new Error('retrieveChunks: an empty query retrieves nothing meaningful')

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
    p_candidates: opts.candidates ?? DEFAULT_CANDIDATES,
  })
  if (error) throw new Error(`retrieveChunks: ${error.message}`)

  return ((data as ChunkRpcRow[] | null) ?? []).map((r) => ({
    id: r.id,
    sourceType: r.source_type === 'transcript' ? 'transcript' : 'filing',
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
  }))
}
