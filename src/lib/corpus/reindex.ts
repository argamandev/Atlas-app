// ─────────────────────────────────────────────────────────────────────────────
// REINDEX — chunks + embeddings for one corpus source, rebuilt atomically.
//
// The choke point (M3) every chunk write passes through. Both source types:
//   reindexTranscript(db, id)  — transcripts.formatted_data → line-window chunks
//   reindexDocument(db, id)    — document_pages → page chunks
//
// The atomic swap is `atlas_replace_chunks` (migration 028): delete + reinsert
// in ONE transaction, with embeddings carried forward server-side for chunks
// whose embedding_input did not change — an unchanged chunk re-embeds for free.
// Only the returned ids are embedded here (gemini), row by row, and
// index_status flips to 'indexed' only when every chunk has its embedding.
//
// FAILURE IS VISIBLE, NEVER THROWN PAST: an embed/update failure sets
// index_status='failed' and returns the error string. The source row itself
// (a finished transcript, an ingested filing) is real regardless — indexing is
// derived data, and 'failed' is its honest, queryable, retryable state (M3.3).
//
// Demo/test content NEVER enters the corpus (standard §1): demo rows get
// index_status='excluded' and zero chunks — visibly out, not eternally pending.
// ─────────────────────────────────────────────────────────────────────────────

import { chunkTranscriptSections, chunkFilingPage, speakersById } from './chunker'
import type { TranscriptChunk, FilingPageChunk } from './chunker'
import { embedDocuments, toVectorLiteral, type EmbedOptions } from './embed'

/** Structural slice of a supabase client — injectable in tests. */
export interface CorpusDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export type ReindexResult =
  | { status: 'indexed'; chunkCount: number; embedded: number; reused: number }
  | { status: 'failed'; chunkCount: number; error: string }
  | { status: 'excluded' }
  | { status: 'skipped'; reason: string }

/** Demo/test rows are not corpus (standard §1). The demo finish reuses this id family. */
export function isDemoTranscriptId(id: string): boolean {
  return id.startsWith('live-finish-demo')
}

type ChunkRow = {
  id: string
  company_id: string
  revision: number
  first_line_id: string | null
  last_line_id: string | null
  page_no: number | null
  part_no: number | null
  section: string | null
  speakers: string[] | null
  content: string
  embedding_input: string
}

function transcriptChunkRows(chunks: TranscriptChunk[], companyId: string, revision: number): ChunkRow[] {
  return chunks.map((c) => ({
    id: globalThis.crypto.randomUUID(),
    company_id: companyId,
    revision,
    first_line_id: c.firstLineId,
    last_line_id: c.lastLineId,
    page_no: null,
    part_no: null,
    section: c.section,
    speakers: c.speakers,
    content: c.content,
    embedding_input: c.embeddingInput,
  }))
}

function filingChunkRows(chunks: FilingPageChunk[], companyId: string, revision: number): ChunkRow[] {
  return chunks.map((c) => ({
    id: globalThis.crypto.randomUUID(),
    company_id: companyId,
    revision,
    first_line_id: null,
    last_line_id: null,
    page_no: c.pageNo,
    part_no: c.partNo,
    section: null,
    speakers: null,
    content: c.content,
    embedding_input: c.embeddingInput,
  }))
}

async function setIndexStatus(db: CorpusDb, table: string, id: string, status: string): Promise<void> {
  const { error } = await db.from(table).update({ index_status: status }).eq('id', id)
  if (error) throw new Error(`${table}.index_status update failed: ${error.message}`)
}

/**
 * Swap in the new chunk set atomically, embed what the swap says is missing,
 * and flip index_status. Shared spine of both source types.
 */
async function replaceAndEmbed(
  db: CorpusDb,
  source: { transcriptId: string | null; documentId: string | null },
  statusTable: string,
  statusId: string,
  rows: ChunkRow[],
  embed: EmbedOptions
): Promise<ReindexResult> {
  const { data, error } = await db.rpc('atlas_replace_chunks', {
    p_transcript_id: source.transcriptId,
    p_document_id: source.documentId,
    p_chunks: rows,
  })
  if (error) {
    await setIndexStatus(db, statusTable, statusId, 'failed')
    return { status: 'failed', chunkCount: rows.length, error: `replace_chunks: ${error.message}` }
  }

  const needIds = new Set(((data as Array<{ chunk_id: string }>) ?? []).map((r) => r.chunk_id))
  const need = rows.filter((r) => needIds.has(r.id))
  try {
    const vectors = await embedDocuments(
      need.map((r) => r.embedding_input),
      embed
    )
    for (let i = 0; i < need.length; i++) {
      const { error: upErr } = await db
        .from('document_chunks')
        .update({ embedding: toVectorLiteral(vectors[i]) })
        .eq('id', need[i].id)
      if (upErr) throw new Error(`embedding write failed: ${upErr.message}`)
    }
  } catch (e) {
    await setIndexStatus(db, statusTable, statusId, 'failed')
    return { status: 'failed', chunkCount: rows.length, error: (e as Error).message }
  }

  await setIndexStatus(db, statusTable, statusId, 'indexed')
  return {
    status: 'indexed',
    chunkCount: rows.length,
    embedded: need.length,
    reused: rows.length - need.length,
  }
}

async function companyNameOf(db: CorpusDb, companyId: string): Promise<string> {
  const { data } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
  return (data?.name as string) ?? 'ללא שיוך'
}

export async function reindexTranscript(
  db: CorpusDb,
  transcriptId: string,
  embed: EmbedOptions = {}
): Promise<ReindexResult> {
  if (isDemoTranscriptId(transcriptId)) {
    await setIndexStatus(db, 'transcripts', transcriptId, 'excluded')
    return { status: 'excluded' }
  }

  const { data: row, error } = await db
    .from('transcripts')
    .select('id, status, formatted_data, company_id, revision, source_key')
    .eq('id', transcriptId)
    .maybeSingle()
  if (error) throw new Error(`reindexTranscript: load failed: ${error.message}`)
  if (!row) throw new Error(`reindexTranscript: no such transcript ${transcriptId}`)
  if (row.status !== 'completed' || !row.formatted_data) {
    return { status: 'skipped', reason: `not completed (status=${row.status})` }
  }
  // NO IDENTITY, NO CORPUS (standard §1). `source_key` is the real-world source,
  // UNIQUE at the DB — so a row without one is either not yet born through the
  // door, or the losing half of a duplicate pair whose identity another row
  // already holds (PyuMxe88e8g_live, eval finding 6: no ranker fixes a
  // duplicate, it dies at this door). Either way it must not become searchable
  // on the strength of a one-time script remembering to skip it.
  if (!row.source_key) {
    return { status: 'skipped', reason: 'no source_key — real-world identity unresolved' }
  }
  if (!row.company_id) {
    // Unreachable for new rows (born attributed; DB CHECK) — old unattributed rows
    // cannot be chunked, and saying so beats chunking under 'ללא שיוך'.
    await setIndexStatus(db, 'transcripts', transcriptId, 'failed')
    return { status: 'failed', chunkCount: 0, error: 'no company_id — cannot chunk unattributed row' }
  }

  const fd = row.formatted_data as {
    sections?: Array<{ title: string; lines?: Array<{ id: string; speakerId: string; text: string }> }>
    speakers?: Array<{ id: string; name?: string | null; title?: string | null }>
  }
  const companyName = await companyNameOf(db, row.company_id as string)
  const chunks = chunkTranscriptSections(fd.sections ?? [], companyName, speakersById(fd.speakers))
  const rows = transcriptChunkRows(chunks, row.company_id as string, (row.revision as number) ?? 1)
  return replaceAndEmbed(db, { transcriptId, documentId: null }, 'transcripts', transcriptId, rows, embed)
}

export async function reindexDocument(
  db: CorpusDb,
  documentId: string,
  embed: EmbedOptions = {}
): Promise<ReindexResult> {
  const { data: doc, error } = await db
    .from('company_documents')
    .select('id, company_id, title')
    .eq('id', documentId)
    .maybeSingle()
  if (error) throw new Error(`reindexDocument: load failed: ${error.message}`)
  if (!doc) throw new Error(`reindexDocument: no such document ${documentId}`)

  const { data: pages, error: pagesErr } = await db
    .from('document_pages')
    .select('page_no, text')
    .eq('document_id', documentId)
    .order('page_no')
  if (pagesErr) throw new Error(`reindexDocument: pages load failed: ${pagesErr.message}`)

  const companyName = await companyNameOf(db, doc.company_id as string)
  const chunks = ((pages as Array<{ page_no: number; text: string }>) ?? []).flatMap((p) =>
    chunkFilingPage(p.text, p.page_no, companyName, doc.title as string)
  )
  // Documents carry no revision column; chunks record revision 1 until re-ingest
  // versioning exists for filings (re-ingest replaces pages, then reindexes).
  const rows = filingChunkRows(chunks, doc.company_id as string, 1)
  return replaceAndEmbed(db, { transcriptId: null, documentId }, 'company_documents', documentId, rows, embed)
}
