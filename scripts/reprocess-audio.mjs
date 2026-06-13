// Backfill audio_url + word_segments on an existing transcript row by re-running the
// download + IVRIT transcription on its stored youtube_url. Keeps formatted_data as-is.
// Usage: node --import tsx --env-file=.env.local scripts/reprocess-audio.mjs <transcriptId>
import { supabaseAdmin } from '../src/lib/supabase.ts'
import { downloadAudio, transcribeAudio } from '../src/lib/transcription.ts'
import { existsSync, unlinkSync } from 'node:fs'

const id = process.argv[2]
if (!id) {
  console.error('usage: reprocess-audio.mjs <transcriptId>')
  process.exit(1)
}

const { data, error } = await supabaseAdmin
  .from('transcripts')
  .select('id, youtube_url')
  .eq('id', id)
  .maybeSingle()
if (error || !data) {
  console.error('row not found:', error?.message)
  process.exit(1)
}
if (!data.youtube_url) {
  console.error('row has no youtube_url — cannot re-download')
  process.exit(1)
}

let audioPath = null
try {
  console.log(`[reprocess] downloading ${data.youtube_url}`)
  audioPath = await downloadAudio(data.youtube_url)
  console.log('[reprocess] transcribing (IVRIT word timestamps)…')
  const { audioUrl, segments } = await transcribeAudio(audioPath)
  const withWords = (segments ?? []).filter((s) => s.words?.length).length
  console.log(`[reprocess] audioUrl=${audioUrl ? 'ok' : 'none'} segments=${segments?.length ?? 0} withWords=${withWords}`)
  const { error: updErr } = await supabaseAdmin
    .from('transcripts')
    .update({ audio_url: audioUrl ?? null, word_segments: segments ?? null })
    .eq('id', id)
  if (updErr) throw new Error(updErr.message)
  console.log('[reprocess] DONE — row updated')
} finally {
  if (audioPath && existsSync(audioPath)) unlinkSync(audioPath)
}
process.exit(0)
