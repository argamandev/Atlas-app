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
// The lexical channel is NOT deleted. `atlas_search_chunks_v2` still accepts it,
// so the revisit he asked for costs a flag rather than a rebuild — but it must not
// become the default again without a fresh harness run (§5 of the ingestion
// standard is explicit that changing the retrieval shape re-runs the gate).
//
// ONE RETRIEVER, for the same reason there is one chunker (standard §5): the
// harness scores THIS module, so what the gate certifies and what a user's
// question runs through cannot drift apart. All ranking lives in
// `atlas_search_chunks_v2` (migration 031, which supersedes 029's
// `atlas_search_chunks` — same ranking, plus the scope counts below); this file
// adds the query embedding and the row shape and nothing else.
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
 * What one channel actually saw, against what there was to see.
 *
 * `truncated` means the channel was CUT SHORT: it returned less than both what
 * this call asked for and what the scope holds. A top-20 search that examined 200
 * of 61,402 chunks is not cut short — that is the search working as asked — and a
 * flag that fired on it would be as useless as the one it replaced was blind.
 *
 * `ran: false` is a channel this call switched off — a different fact from one
 * that ran and found nothing.
 */
export interface ChannelReport {
  ran: boolean
  /** Rows this channel produced before ranking. */
  saw: number
  /**
   * Rows in scope, COUNTED NO FURTHER THAN `candidates + 1` — exact at or below
   * the pool, saturated above it. It is the only range that changes the answer,
   * and counting past it would mean scanning a table whose rows carry a
   * vector(1536) on every search.
   *
   * ⚠ NOT the size of the corpus or of the company's holdings. Never render it as
   * one: at the default pool it reads 201 for a company with 12 chunks' worth of
   * relevance and for one with forty thousand.
   */
  inScopeCapped: number
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
  dense_in_scope_capped: number
  lexical_in_scope_capped: number
  dense_ran: boolean
  lexical_ran: boolean
}

const DEFAULT_LIMIT = 20
const DEFAULT_CANDIDATES = 200

// ⚠ WHAT `truncated` DOES AND DOES NOT MEAN — worth stating, because both
// earlier versions of this got it wrong, once in each direction.
//
// It means one thing: the channel was CUT SHORT — it came back with less than
// both what this call asked for and what the scope holds. `saw < least(pool,
// inScopeCapped)`, two facts and the caller's own parameter.
//
// The loud wrong version compared the count against `hnsw.ef_search` (capped at
// 1000 by Postgres). That GUC bounds the index scan's EFFORT, not the row count;
// the planner is free to answer exactly, and at 3,181 chunks it did, returning
// all of them for an unscoped query. That rule reported five designs × nineteen
// cases as truncated when not one of them was.
//
// The quiet wrong version — the one this file shipped through A4 — compared the
// count against the requested POOL alone: `saw < pool` read as "saw everything".
// That holds only while every scan is exhaustive, which is a property of a
// 3,181-row corpus and not of the code. It goes silently false the moment the
// planner DOES use HNSW and `ef_search` caps the channel below the pool, or a
// scoped iterative scan stops at `hnsw.max_scan_tuples` (default 20,000). A5's
// corpus is where the index engages, so A5 is where migration 031 closed it.
//
// And a third wrong version, caught in review before it was ever applied: dropping
// the pool from the comparison entirely, `saw < inScope`. True, useless, and true
// of EVERY query once the corpus outgrows the pool — the loud failure again, with
// the numbers rearranged. The pool belongs in the comparison because the caller
// chose it; the two Postgres ceilings do not, because nobody did.
//
// The residual no counter can show: HNSW is APPROXIMATE. A dense channel can miss
// a genuine neighbour while reporting a complete, untruncated scope — that is a
// property of the index, not a truncation, and `truncated: false` must not be read
// as "these are the true nearest rows". Measuring it needs a corpus big enough to
// engage the index, which is what A5's backfill makes possible; until that
// harness re-run lands under docs/evidence/, it is UNMEASURED, not fine.

export async function retrieveChunks(db: CorpusDb, opts: RetrieveOptions): Promise<RetrievalResult> {
  const channels = opts.channels ?? DEFAULT_CHANNELS
  const query = opts.query ?? ''
  if (!query.trim()) throw new Error('retrieveChunks: an empty query retrieves nothing meaningful')
  const candidates = opts.candidates ?? DEFAULT_CANDIDATES
  const limit = opts.limit ?? DEFAULT_LIMIT
  // A LIMIT BELOW 1 IS REFUSED, not served. Every completeness figure this
  // function returns rides on a returned row, so a call that asks for zero rows
  // gets zero rows and would then be told, in the report's own words, that the
  // scope is empty — a fabricated fact assembled out of the caller's own
  // argument. Refusing makes that state unrepresentable rather than guarded
  // (M3.3); a caller who genuinely wants nothing back should not be calling this.
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error(`retrieveChunks: limit must be a positive integer, got ${opts.limit}`)

  // The dense channel needs the query embedded under RETRIEVAL_QUERY — the other
  // half of the asymmetric pair the corpus was embedded with. An embedding
  // failure throws here rather than quietly degrading to lexical-only: a
  // half-strength search that looks like a full one is the lie M3.3 forbids.
  const embedding = channels === 'lexical' ? null : toVectorLiteral(await embedQuery(query, opts.embed ?? {}))

  const { data, error } = await db.rpc('atlas_search_chunks_v2', {
    p_query_embedding: embedding,
    p_query_text: channels === 'dense' ? null : query,
    p_company_id: opts.companyId ?? null,
    p_limit: limit,
    p_candidates: candidates,
  })
  if (error) throw new Error(`retrieveChunks: ${error.message}`)

  const rows = (data as ChunkRpcRow[] | null) ?? []

  // WHETHER A CHANNEL RAN IS THE SQL'S ANSWER, NOT THIS FILE'S GUESS. A query
  // whose tsquery comes out empty — punctuation only, or nothing but terms the
  // tokenizer drops — makes the function switch the lexical channel off, and a
  // caller that assumed `channels: 'hybrid'` meant both ran would report a
  // half-strength search as a full one.
  //
  // The fallback applies only when NO row came back at all, which takes both an
  // empty scope and, for the lexical half, an empty tsquery on top. There it is
  // the honest reading: nothing ran that could have told us otherwise.
  const denseRan = rows[0]?.dense_ran ?? channels !== 'lexical'
  const lexicalRan = rows[0]?.lexical_ran ?? channels !== 'dense'

  const report = (ran: boolean, saw: number, inScopeCapped: number): ChannelReport => ({
    ran,
    saw: ran ? saw : 0,
    inScopeCapped: ran ? inScopeCapped : 0,
    // Cut short = returned less than BOTH what was asked for and what is there.
    // `least` is why a pool-limited search reads complete: at the pool, the
    // channel delivered exactly what this call requested.
    truncated: ran && saw < Math.min(candidates, inScopeCapped),
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
    // Zero rows carry no per-channel counts, so both report the honest zero rather
    // than an absent field the caller would have to guess about. Zero seen out of
    // zero in scope is complete information — the empty scope really is empty.
    // That reading is only safe because a `limit` below 1 was refused above: a
    // call that returns no rows BY CONSTRUCTION would otherwise land here and
    // fabricate "the corpus has nothing" out of its own argument.
    dense: report(denseRan, rows[0]?.dense_candidates ?? 0, rows[0]?.dense_in_scope_capped ?? 0),
    lexical: report(lexicalRan, rows[0]?.lexical_candidates ?? 0, rows[0]?.lexical_in_scope_capped ?? 0),
  }
}
