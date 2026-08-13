// Re-run ONLY the formatting step on a transcript that already has a stored raw_transcript.
// Skips download + IVRIT entirely (Gemini → GPT-4.1 fallback organize, then save through the
// birth door: revision + 1, line times re-aligned, chunks rebuilt atomically — standard §4/§8).
// Usage: node --import tsx --env-file=.env.local scripts/reformat.mjs <transcriptId>
import { supabaseAdmin } from '../src/lib/supabase.ts'
import { formatTranscript } from '../src/lib/transcription.ts'
import { finalizeTranscript } from '../src/lib/db/transcripts.ts'

const id = process.argv[2]
if (!id) {
  console.error('usage: reformat.mjs <transcriptId>')
  process.exit(1)
}

const { data, error } = await supabaseAdmin
  .from('transcripts')
  .select('id, status, raw_transcript, youtube_title, word_segments')
  .eq('id', id)
  .maybeSingle()
if (error || !data) {
  console.error('row not found:', error?.message)
  process.exit(1)
}
if (!data.raw_transcript) {
  console.error('row has no raw_transcript — nothing to reformat')
  process.exit(1)
}

const engine = data.word_segments ? 'ivrit' : 'whisper'
console.log(
  `[reformat] ${id} — status=${data.status}, ${data.raw_transcript.length} chars, word_segments=${data.word_segments ? 'yes' : 'no'} (engine=${engine})`
)
console.log(`[reformat] title: ${data.youtube_title ?? '(none)'}`)

const t0 = Date.now()
const formatted = await formatTranscript(data.raw_transcript, id, data.youtube_title ?? '', { engine })
formatted.processingSecs = Math.round((Date.now() - t0) / 1000)

const fin = await finalizeTranscript(id, formatted)

const speakers = formatted.speakers?.length ?? 0
const lines = (formatted.sections ?? []).reduce((n, s) => n + (s.lines?.length ?? 0), 0)
console.log(
  `[reformat] DONE — ${id} completed in ${((Date.now() - t0) / 1000).toFixed(1)}s (${speakers} speakers, ${lines} lines, rev ${fin.revision}, ${fin.timedLines} timed, index ${fin.reindex.status})`
)
process.exit(0)
