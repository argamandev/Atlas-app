import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Transcript } from '@/lib/types'
import { buildFromIvrit, buildFromIvritWithGeminiNames } from '@/lib/live/loadCall'
import { applySpeakerEdits } from '@/lib/live/syncEngine'
import type { IvritSegment, SpeakerEdits } from '@/lib/live/syncEngine'
import type { ItemContent } from './contentTypes'

// ─────────────────────────────────────────────────────────────────────────────
// A SHELF ITEM'S ACTUAL WORDS.
//
// Founder, 2026-08-04: *"make the documents we agreed on to be actually pulled
// and presented."* They were being pulled — `workspace_items` held the right
// rows, with the right titles, in the right order. What the pane rendered was a
// fabricated annual report about Tigbur, the same one for every file, whatever
// the file was. Three real investor calls arrived and all three displayed
// invented revenue figures under the heading "דוח שנתי".
//
// EVERY QUERY HERE GOES THROUGH THE USER'S CLIENT, never supabaseAdmin. The
// first hop is the one that matters: `workspace_items` is RLS-scoped to its
// owner, so an item id belonging to someone else simply does not resolve and the
// answer is `not-found` — the same answer as an id that never existed. Only once
// that row is in hand do we read the shared-corpus row it points at, and those
// (`transcripts`, `company_documents`, `document_pages`) are deliberately
// readable by any signed-in member — see docs/DATA-MODEL.md.
//
// THE UNAVAILABLE CASE IS A FIRST-CLASS RESULT, not an empty render. A transcript
// that is still processing has no `formatted_data`, and a document ingested
// without text extraction has no pages. Both must SAY so: .claude/rules/app.md
// has a standing rule that degradation is visible, and this pane is where it was
// most recently broken — a failed load previously fell through to demo content,
// which is how invented figures end up on a page the user believes is a filing.
// ─────────────────────────────────────────────────────────────────────────────

export class ItemNotFound extends Error {
  constructor() {
    super('item not found')
  }
}

/**
 * One shelf item's content.
 *
 * Throws {@link ItemNotFound} when the item is not this user's — the route turns
 * that into a 404, which is the complete answer to both "never existed" and
 * "belongs to someone else".
 */
export async function loadItemContent(
  supabase: SupabaseClient,
  workspaceId: string,
  itemId: string
): Promise<ItemContent> {
  const { data: item, error } = await supabase
    .from('workspace_items')
    .select('id, name, kind, transcript_id, document_id')
    .eq('id', itemId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!item) throw new ItemNotFound()

  const title = item.name as string

  if (item.transcript_id) return loadTranscript(supabase, item.transcript_id as string, title)
  if (item.document_id) return loadDocument(supabase, item.document_id as string, title)

  // `storage_path` items — a user's own uploaded file. Nothing ingests one yet,
  // so there is no text to show and saying that is the honest answer.
  return { kind: 'unavailable', title, reason: 'no-text' }
}

async function loadTranscript(
  supabase: SupabaseClient,
  transcriptId: string,
  title: string
): Promise<ItemContent> {
  const { data, error } = await supabase
    .from('transcripts')
    .select(
      'id, youtube_title, status, formatted_data, speaker_names, audio_url, word_segments, speaker_edits'
    )
    .eq('id', transcriptId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  // The corpus row was deleted after it was put on the shelf. The item survives
  // (its FK cascades only on transcript delete, and this covers the read anyway).
  if (!data) return { kind: 'unavailable', title, reason: 'source-gone' }

  const fd = data.formatted_data as Transcript | null
  if (!fd || !Array.isArray(fd.sections) || fd.sections.length === 0) {
    // Still in the pipeline, or it failed. Either way there are no words yet.
    return { kind: 'unavailable', title, reason: 'processing' }
  }

  // Speaker ids are meaningless to a reader, and `speaker_names` is the admin
  // rename overlay that the transcript page already applies — the workspace must
  // show the same name for the same person, or a quote copied from here would
  // not match the one copied from there.
  const overrides = (data.speaker_names as Record<string, string> | null) ?? {}
  const nameOf = new Map<string, string>()
  for (const s of fd.speakers ?? []) nameOf.set(s.id, overrides[s.id] ?? s.name)

  // ── THE RECORDING, ASSEMBLED THE SAME WAY THE CALL PAGE ASSEMBLES IT ───────
  // Founder, 2026-08-05: a transcript on the shelf should play, and the words
  // should follow the audio, exactly as they do in a live call.
  //
  // These are the live view's OWN builders (`lib/live/loadCall`), imported
  // rather than reimplemented: speaker grouping, the Gemini-name relabel that
  // leaves word timings untouched, and the manual diarization overlay are three
  // pieces of accumulated correctness, and a second copy of them here would
  // drift the moment either side was fixed. Only the QUERY differs — this one
  // goes through the user's client, because the shelf item's RLS check is the
  // hop that already proved this row is theirs to read.
  const audioUrl = (data.audio_url as string | null) ?? null
  const wordSegs = (data.word_segments as IvritSegment[] | null) ?? null
  const edits = (data.speaker_edits as SpeakerEdits | null) ?? null

  // BOTH or neither. Word timings with no audio is a transcript that cannot be
  // followed, and audio with no timings is a player with nothing to highlight —
  // the pane treats either half alone as "no recording" and says nothing about
  // it, rather than showing a control that does not work.
  const wordTimed =
    audioUrl && wordSegs && wordSegs.length
      ? applySpeakerEdits(
          // A Gemini pass means real speaker names exist; prefer them.
          (fd.sections?.flatMap((s) => s.lines) ?? []).length > 0
            ? buildFromIvritWithGeminiNames(wordSegs, fd, overrides)
            : buildFromIvrit(wordSegs, overrides),
          edits
        )
      : null

  return {
    kind: 'transcript',
    transcriptId,
    audioUrl: wordTimed ? audioUrl : null,
    wordTimed,
    title: fd.company && fd.quarter ? `${fd.company} — ${fd.quarter}` : title,
    company: fd.company ?? null,
    quarter: fd.quarter ?? null,
    date: fd.date ?? null,
    sections: fd.sections.map((sec) => ({
      id: sec.id,
      title: sec.title,
      lines: (sec.lines ?? []).map((l) => ({
        id: l.id,
        // An unmapped speaker id is not shown raw — a bare 'S2' in the middle of
        // a Hebrew call reads as a bug, and an empty string reads as nobody.
        speaker: nameOf.get(l.speakerId) ?? '',
        timestamp: l.timestamp,
        text: l.text,
      })),
    })),
  }
}

async function loadDocument(
  supabase: SupabaseClient,
  documentId: string,
  title: string
): Promise<ItemContent> {
  const { data: doc, error } = await supabase
    .from('company_documents')
    .select('id, title, doc_type, quarter, page_count')
    .eq('id', documentId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!doc) return { kind: 'unavailable', title, reason: 'source-gone' }

  const { data: pages, error: pErr } = await supabase
    .from('document_pages')
    .select('page_no, text')
    .eq('document_id', documentId)
    .order('page_no')
  if (pErr) throw new Error(pErr.message)

  const real = (pages ?? [])
    .map((p) => ({ pageNo: p.page_no as number, text: (p.text as string) ?? '' }))
    .filter((p) => p.text.trim().length > 0)

  // NO 'no-text' GUARD HERE ANY MORE, and the reason is worth stating: the pane
  // renders the actual PDF (components/live/PdfViewer), so a document whose text
  // was never extracted is still perfectly readable — you just cannot ask about
  // it. Refusing it would hide a file the user can see with their own eyes.
  // `pages` may therefore be empty; the chat route counts that as unreadable and
  // says so, which is where that fact belongs.
  const pageCount = (doc.page_count as number) ?? real.length

  if (pageCount === 0 && real.length === 0) {
    return { kind: 'unavailable', title: (doc.title as string) || title, reason: 'no-text' }
  }

  return {
    kind: 'document',
    title: (doc.title as string) || title,
    docType: (doc.doc_type as string) ?? null,
    quarter: (doc.quarter as string) ?? null,
    documentId: doc.id as string,
    pageCount,
    pages: real,
  }
}
