// ─────────────────────────────────────────────────────────────────────────────
// THE TRANSCRIPT BIRTH DOOR (ingestion standard §1–§2, slice A3).
//
// Every `transcripts` INSERT/UPSERT in the product goes through THIS module —
// `src/lib/transcriptBirthDoor.test.ts` fails the battery for one anywhere
// else. Same for every regeneration of `formatted_data` / `word_segments`:
// those three and the chunks are ONE consistency unit (standard §4), so the
// door re-runs alignment and re-chunks in the same operation, and a path that
// skips that is a battery failure, not a code-review hope.
//
// LAWS this door is the mechanism for:
//   * Born attributed — companyId is a REQUIRED argument; no unattributed
//     corpus rows, ever again (founder decision 2026-08-12; DB CHECK 027).
//   * Dedup at birth — sourceKey is REQUIRED and UNIQUE (027); a duplicate
//     source returns { born:false, existingId } for the caller to surface —
//     never a silent twin, never a sibling id.
//   * Re-processing updates the SAME row, bumping `revision`; chunks rebuild
//     atomically via reindexTranscript (migration 028).
//   * Real per-line timestamps at birth — completion runs the alignment ONCE
//     and persists it (standard §4).
//
// The module top is import-safe (the finishLiveCall pattern): heavy deps
// (supabase admin client, quotes) load inside the functions, so the battery
// imports this file without env. `db` is injectable for the same reason.
// ─────────────────────────────────────────────────────────────────────────────

import type { SpeakerEdits } from '@/lib/live/syncEngine'
import type { Transcript } from '@/lib/types'
import { alignLineTimestamps, type AlignableSegment } from '@/lib/corpus/align'
import { reindexTranscript, type CorpusDb, type ReindexResult } from '@/lib/corpus/reindex'
import type { EmbedOptions } from '@/lib/corpus/embed'

async function adminDb(): Promise<CorpusDb> {
  const { supabaseAdmin } = await import('@/lib/supabase')
  return supabaseAdmin as unknown as CorpusDb
}

// ── birth ────────────────────────────────────────────────────────────────────

export interface BirthInput {
  /** Row id (video id for imports, call id for live). */
  id: string
  /** Real-world identity: video id, or `live:<call>` (standard §1). REQUIRED. */
  sourceKey: string
  /** Born attributed (standard §2). REQUIRED — resolve BEFORE calling. */
  companyId: string
  userId: string
  youtubeUrl?: string | null
  title?: string | null
  processingStep?: string
}

export type BirthResult = { born: true; id: string } | { born: false; existingId: string }

function requireBirthFacts(b: { sourceKey?: string; companyId?: string; userId?: string }): void {
  if (!b.companyId) throw new Error('birth: companyId is required — corpus rows are born attributed')
  if (!b.sourceKey) throw new Error('birth: sourceKey is required — identity is the real-world source')
  if (!b.userId) throw new Error('birth: userId is required')
}

const UNIQUE_VIOLATION = '23505'

/**
 * Strict birth: a NEW processing row, or the existing row when the source is
 * already in the corpus. Never a second row for one real-world event.
 */
export async function birthTranscript(input: BirthInput, db?: CorpusDb): Promise<BirthResult> {
  requireBirthFacts(input)
  const d = db ?? (await adminDb())

  const { error } = await d.from('transcripts').insert({
    id: input.id,
    source_key: input.sourceKey,
    company_id: input.companyId,
    user_id: input.userId,
    youtube_url: input.youtubeUrl ?? null,
    youtube_title: input.title ?? null,
    status: 'processing',
    processing_step: input.processingStep ?? 'downloading',
    revision: 1,
    index_status: 'pending',
  })
  if (!error) return { born: true, id: input.id }

  if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
    // Already in the corpus (by source or by id) — point at the existing row.
    const bySource = await d.from('transcripts').select('id').eq('source_key', input.sourceKey).maybeSingle()
    const existingId = (bySource.data?.id as string) ?? input.id
    return { born: false, existingId }
  }
  throw new Error(`birthTranscript failed: ${error.message}`)
}

/**
 * Live-call stub: the `processing` row a poller watches while the finish
 * pipeline runs. UPSERT because a re-airing re-processes the SAME row
 * (standard §1) — still born attributed, still keyed by source.
 */
export async function birthLiveStub(input: BirthInput, db?: CorpusDb): Promise<void> {
  requireBirthFacts(input)
  const d = db ?? (await adminDb())
  const { error } = await d.from('transcripts').upsert(
    {
      id: input.id,
      source_key: input.sourceKey,
      company_id: input.companyId,
      user_id: input.userId,
      youtube_url: input.youtubeUrl ?? null,
      youtube_title: input.title ?? null,
      status: 'processing',
      processing_step: input.processingStep ?? 'formatting',
    },
    { onConflict: 'id' }
  )
  if (error) throw new Error(`birthLiveStub upsert failed: ${error.message}`)
}

// ── staging (mid-pipeline, before completion) ────────────────────────────────

/**
 * Stage transcription output on a processing row. A plain write — alignment
 * and chunking happen once, at completion — but it lives in the door so the
 * battery guard can promise "no content write bypasses this module".
 */
export async function stageTranscriptContent(
  id: string,
  content: {
    rawTranscript?: string
    wordSegments?: AlignableSegment[] | null
    audioUrl?: string | null
    processingStep?: string
  },
  db?: CorpusDb
): Promise<void> {
  const d = db ?? (await adminDb())
  const payload: Record<string, unknown> = {}
  if (content.rawTranscript !== undefined) payload.raw_transcript = content.rawTranscript
  if (content.wordSegments !== undefined) payload.word_segments = content.wordSegments
  if (content.audioUrl !== undefined) payload.audio_url = content.audioUrl
  if (content.processingStep !== undefined) payload.processing_step = content.processingStep
  const { error } = await d.from('transcripts').update(payload).eq('id', id)
  if (error) throw new Error(`stageTranscriptContent failed: ${error.message}`)
}

// ── completion + regeneration (the consistency unit) ─────────────────────────

export interface FinalizeExtras {
  rawTranscript?: string
  wordSegments?: AlignableSegment[] | null
  audioUrl?: string | null
  duration?: string | null
}

export interface FinalizeResult {
  revision: number
  timedLines: number
  totalLines: number
  reindex: ReindexResult
}

/**
 * Complete (or re-complete) a transcript: persist the aligned formatted data,
 * bump revision on re-processing, and rebuild chunks atomically. THE one exit
 * of every pipeline — full runs, reformat-only runs, live finishes.
 */
export async function finalizeTranscript(
  id: string,
  formatted: Transcript,
  extras: FinalizeExtras = {},
  db?: CorpusDb,
  embed?: EmbedOptions
): Promise<FinalizeResult> {
  const d = db ?? (await adminDb())

  const { data: row, error } = await d
    .from('transcripts')
    .select('id, revision, formatted_data, word_segments')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`finalizeTranscript: load failed: ${error.message}`)
  if (!row) throw new Error(`finalizeTranscript: no such row ${id}`)

  const segments =
    extras.wordSegments !== undefined
      ? extras.wordSegments
      : ((row.word_segments as AlignableSegment[] | null) ?? null)

  // Real timestamps at birth (standard §4): align ONCE, persist. Lines that
  // cannot be timed keep the visible UNTIMED sentinel.
  const { fd: aligned, timedLines, totalLines } = alignLineTimestamps(formatted, segments)

  // Re-processing the same row bumps revision; first completion keeps 1 (027).
  const revision = row.formatted_data ? ((row.revision as number) ?? 1) + 1 : ((row.revision as number) ?? 1)

  const payload: Record<string, unknown> = {
    formatted_data: aligned,
    status: 'completed',
    processing_step: 'completed',
    error_message: null,
    revision,
  }
  if (extras.rawTranscript !== undefined) payload.raw_transcript = extras.rawTranscript
  if (extras.wordSegments !== undefined) payload.word_segments = extras.wordSegments
  if (extras.audioUrl !== undefined) payload.audio_url = extras.audioUrl
  if (extras.duration !== undefined) payload.duration = extras.duration

  const { error: upErr } = await d.from('transcripts').update(payload).eq('id', id)
  if (upErr) throw new Error(`finalizeTranscript: update failed: ${upErr.message}`)

  // Chunks rebuild in the same operation — the consistency unit (standard §4).
  const reindex = await reindexTranscript(d, id, embed)
  return { revision, timedLines, totalLines, reindex }
}

/**
 * Content-edit door (PUT/PATCH): persist edited formatted_data, re-align
 * against the stored word timings, bump revision, rebuild chunks. Unchanged
 * chunks re-embed for free (embedding carry-forward in migration 028).
 */
export async function saveFormattedData(
  id: string,
  formatted: Transcript,
  db?: CorpusDb,
  embed?: EmbedOptions
): Promise<FinalizeResult> {
  return finalizeTranscript(id, formatted, {}, db, embed)
}

/**
 * Word-timing regeneration door (reprocess-audio): store new segments + audio,
 * re-align the EXISTING formatted_data to them, bump revision, rebuild chunks.
 * The desync `reprocess-audio.mjs` used to create (fresh timings, stale
 * alignment) is now unrepresentable.
 */
export async function saveWordSegments(
  id: string,
  content: { segments: AlignableSegment[] | null; audioUrl?: string | null },
  db?: CorpusDb,
  embed?: EmbedOptions
): Promise<FinalizeResult> {
  const d = db ?? (await adminDb())
  const { data: row, error } = await d
    .from('transcripts')
    .select('id, formatted_data')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`saveWordSegments: load failed: ${error.message}`)
  if (!row?.formatted_data) throw new Error(`saveWordSegments: row ${id} has no formatted_data`)
  return finalizeTranscript(
    id,
    row.formatted_data as Transcript,
    { wordSegments: content.segments, audioUrl: content.audioUrl },
    d,
    embed
  )
}

// ── overlays (display-only; not part of the consistency unit) ────────────────

// Override map { [speakerId]: displayName } merged over the transcript's speakers at load.
export async function renameSpeaker(
  transcriptId: string,
  speakerId: string,
  newName: string,
  oldName: string
): Promise<void> {
  const { supabaseAdmin } = await import('@/lib/supabase')
  const { renameSpeakerInQuotes } = await import('./quotes')
  const { data } = await supabaseAdmin
    .from('transcripts')
    .select('speaker_names')
    .eq('id', transcriptId)
    .maybeSingle()
  const map = { ...((data?.speaker_names as Record<string, string> | null) ?? {}), [speakerId]: newName }
  const { error } = await supabaseAdmin
    .from('transcripts')
    .update({ speaker_names: map })
    .eq('id', transcriptId)
  if (error) throw new Error(error.message)
  if (oldName && oldName !== newName) await renameSpeakerInQuotes(transcriptId, oldName, newName)
}

// Persist the manual diarization overlay (Feature 1). The full boundary list is recomputed
// server-side per edit, so this is a simple replace.
export async function saveSpeakerEdits(transcriptId: string, edits: SpeakerEdits): Promise<void> {
  const { supabaseAdmin } = await import('@/lib/supabase')
  const { error } = await supabaseAdmin
    .from('transcripts')
    .update({ speaker_edits: edits })
    .eq('id', transcriptId)
  if (error) throw new Error(error.message)
}
