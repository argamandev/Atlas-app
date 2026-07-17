// CLI: npx tsx scripts/retranscribe-call.ts --url <youtube> --id <new-row-id> [--company <uuid>]
//
// Runs the product's own transcription pipeline (yt-dlp → IVRIT/RunPod word timestamps →
// Gemini format) into a NEW transcripts row — the additive way to re-transcribe a video
// whose original row predates the karaoke pipeline (no word_segments/audio_url), without
// touching that row and without needing the admin force path of POST /api/transcripts.
// Refuses to run without RunPod env: the Whisper fallback has no word timings, and a
// word-less demo call would silently defeat the point.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env']) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const url = arg('url')
  const id = arg('id')
  const companyId = arg('company') ?? null
  if (!url || !id) {
    console.error(
      'Usage: npx tsx scripts/retranscribe-call.ts --url <youtube> --id <new-row-id> [--company <uuid>]'
    )
    process.exit(1)
  }
  if (!process.env.RUNPOD_API_KEY || !process.env.RUNPOD_IVRIT_ENDPOINT_ID) {
    console.error(
      'RUNPOD_API_KEY / RUNPOD_IVRIT_ENDPOINT_ID missing in .env.local — aborting (the Whisper fallback has no word timings).'
    )
    process.exit(1)
  }

  // Import AFTER env is loaded — these modules read process.env at import time.
  const { getVideoInfo, downloadAudio, transcribeAudio, formatTranscript, formatDuration } =
    await import('../src/lib/transcription')
  const { supabaseAdmin } = await import('../src/lib/supabase')

  // Reuse the row only if a previous run of THIS script failed on it — anything else is
  // someone's data (additive-only, no overwrites).
  const { data: clash } = await supabaseAdmin.from('transcripts').select('id, status').eq('id', id).limit(1)
  if (clash?.length && clash[0].status !== 'failed') {
    console.error(`Row ${id} already exists (status ${clash[0].status}) — pick a fresh id.`)
    process.exit(1)
  }
  if (clash?.length) {
    const { error: updErr } = await supabaseAdmin
      .from('transcripts')
      .update({
        status: 'processing',
        processing_step: 'downloading',
        error_message: null,
        company_id: companyId,
      })
      .eq('id', id)
    if (updErr) throw new Error(`reset failed: ${updErr.message}`)
    console.log(`[retranscribe:${id}] retrying failed row`)
  } else {
    const { error: insErr } = await supabaseAdmin.from('transcripts').insert({
      id,
      youtube_url: url,
      status: 'processing',
      processing_step: 'downloading',
      company_id: companyId,
    })
    if (insErr) throw new Error(`insert failed: ${insErr.message}`)
    console.log(`[retranscribe:${id}] row inserted`)
  }

  try {
    const info = await getVideoInfo(url)
    console.log(`[retranscribe:${id}] title: "${info.title}" (${formatDuration(info.durationSecs)})`)
    await supabaseAdmin
      .from('transcripts')
      .update({
        youtube_title: info.title,
        youtube_thumbnail: info.thumbnail,
        duration: formatDuration(info.durationSecs),
      })
      .eq('id', id)

    const audioPath = await downloadAudio(url)
    console.log(`[retranscribe:${id}] audio downloaded`)
    await supabaseAdmin.from('transcripts').update({ processing_step: 'transcribing' }).eq('id', id)

    const { text, engine, model, segments, audioUrl } = await transcribeAudio(audioPath)
    console.log(
      `[retranscribe:${id}] transcribed — ${text.length} chars via ${engine} (${model}), ${segments?.length ?? 0} segments`
    )
    if (!segments?.length) {
      console.warn(`[retranscribe:${id}] WARNING: no word segments — karaoke will not sync`)
    }
    await supabaseAdmin
      .from('transcripts')
      .update({
        raw_transcript: text,
        word_segments: segments ?? null,
        audio_url: audioUrl ?? null,
        processing_step: 'formatting',
      })
      .eq('id', id)

    const formatted = await formatTranscript(text, id, info.title, { engine, model })
    await supabaseAdmin
      .from('transcripts')
      .update({ formatted_data: formatted, status: 'completed', processing_step: 'completed' })
      .eq('id', id)
    console.log(
      `[retranscribe:${id}] DONE — company "${(formatted as { company?: string }).company}" quarter "${(formatted as { quarter?: string }).quarter}"`
    )
  } catch (err) {
    await supabaseAdmin
      .from('transcripts')
      .update({ status: 'failed', error_message: (err as Error).message })
      .eq('id', id)
    throw err
  }
}

main().catch((err) => {
  console.error(`FAILED: ${(err as Error).message}`)
  process.exit(1)
})
