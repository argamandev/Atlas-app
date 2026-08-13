import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { buildCorpusIndexHealth } from './indexHealth'
import type { CorpusIndexHealth, DocumentStatusRow, StatusRow } from './indexHealth'

// ─────────────────────────────────────────────────────────────────────────────
// The IO half of the corpus-index screen. All the arithmetic lives in
// `indexHealth.ts`, which is pure and unit-tested; this file only fetches.
//
// `supabaseAdmin` BYPASSES RLS, and that is legitimate here for the reason
// rules/app.md lists `companies.ts` and `calls.ts` under: these are SHARED CORPUS
// tables with no user rows in them. There is nothing to owner-filter. What gates
// this data is the caller — the page checks `isAdmin` before it reads — and that
// gate lives there rather than here because this module has no request to read.
//
// ⚠ Whoever adds a per-user or per-company view of this later: that is a
// different query and it does NOT inherit this justification.
//
// RETURNS null ON FAILURE, never a zeroed-out health object. A read failure
// rendered as "0 documents, 0 pending, all settled" is the exact shape of lie the
// visible-degradation law exists to forbid — it would report a broken database as
// a healthy empty corpus.
// ─────────────────────────────────────────────────────────────────────────────

export async function readCorpusIndexHealth(): Promise<CorpusIndexHealth | null> {
  const [transcripts, documents, chunks] = await Promise.all([
    // `youtube_title`, not `title` — the transcripts table has no `title` column
    // (the birth door writes `youtube_title`, and a live call has no YouTube
    // anything). Aliased so the pure module keeps one row shape for both sources.
    supabaseAdmin.from('transcripts').select('id, title:youtube_title, index_status'),
    supabaseAdmin.from('company_documents').select('id, title, index_status, facts_status'),
    supabaseAdmin.from('document_chunks').select('id', { count: 'exact', head: true }),
  ])

  // EVERY error is read, and any one of them fails the whole screen. A partial
  // answer here would be a corpus health report missing a table, with nothing on
  // screen saying which — worse than saying nothing.
  if (transcripts.error || documents.error || chunks.error) {
    console.error(
      '[corpus-index] read failed:',
      transcripts.error?.message ?? documents.error?.message ?? chunks.error?.message
    )
    return null
  }

  return buildCorpusIndexHealth({
    transcripts: ((transcripts.data as StatusRow[] | null) ?? []).map((r) => ({
      ...r,
      // A transcript with no title is a real row, not a missing one; its id is the
      // only honest thing to show, and showing nothing would make it unfindable.
      title: r.title || r.id,
    })),
    documents: ((documents.data as DocumentStatusRow[] | null) ?? []).map((r) => ({
      ...r,
      title: r.title || r.id,
    })),
    chunks: chunks.count ?? 0,
  })
}
