// CLI: npx tsx scripts/retranscribe-call.ts --url <youtube> [--company <uuid>]
//
// Runs the product's own transcription pipeline (yt-dlp → IVRIT/RunPod word timestamps →
// Gemini format) through the BIRTH DOOR (src/lib/db/transcripts.ts, ingestion standard §1–§2):
//
//   * The row id IS the video id — one real-world event, one corpus row. The pre-A3
//     version minted a sibling row (`--id <new-row-id>`) for a video that already had one;
//     that is the exact shape that produced the PyuMxe88e8g_live duplicate, and the door
//     now makes it unrepresentable. An existing row is RE-PROCESSED in place
//     (revision + 1, chunks rebuilt atomically); comparison runs happen off-corpus.
//   * A NEW row requires --company (born attributed). An existing row keeps its
//     attribution; --company re-links it.
//
// Refuses to run without RunPod env: the Whisper fallback has no word timings, and a
// word-less call would silently defeat the karaoke + line-timestamp alignment.
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
  const companyId = arg('company') ?? null
  if (!url) {
    console.error('Usage: npx tsx scripts/retranscribe-call.ts --url <youtube> [--company <uuid>]')
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
  const { birthTranscript, stageTranscriptContent, finalizeTranscript } =
    await import('../src/lib/db/transcripts')
  const { extractVideoId } = await import('../src/lib/utils')

  const id = extractVideoId(url)
  if (!id) {
    console.error(`cannot extract a video id from ${url}`)
    process.exit(1)
  }

  const { data: existing } = await supabaseAdmin
    .from('transcripts')
    .select('id, status, company_id, user_id')
    .eq('id', id)
    .maybeSingle()

  if (existing) {
    console.log(
      `[retranscribe:${id}] row exists (status ${existing.status}) — RE-PROCESSING the same row (standard §1: never a sibling id)`
    )
    if (companyId && companyId !== existing.company_id) {
      const { error } = await supabaseAdmin.from('transcripts').update({ company_id: companyId }).eq('id', id)
      if (error) throw new Error(`company re-link failed: ${error.message}`)
    }
    const { error } = await supabaseAdmin
      .from('transcripts')
      .update({ status: 'processing', processing_step: 'downloading', error_message: null })
      .eq('id', id)
    if (error) throw new Error(`reset failed: ${error.message}`)
  } else {
    if (!companyId) {
      console.error('a NEW row needs --company <uuid> — corpus rows are born attributed (standard §2)')
      process.exit(1)
    }
    // FK-valid owner for a script-born row: the admin profile.
    const { data: admin } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle()
    if (!admin?.id) {
      console.error('no admin profile found to own the row — aborting')
      process.exit(1)
    }
    const birth = await birthTranscript({
      id,
      sourceKey: id,
      companyId,
      userId: admin.id as string,
      youtubeUrl: url,
    })
    if (!birth.born) {
      console.error(`source already in the corpus as ${birth.existingId} — nothing to do`)
      process.exit(1)
    }
    console.log(`[retranscribe:${id}] born`)
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
    await stageTranscriptContent(id, {
      rawTranscript: text,
      wordSegments: segments ?? null,
      audioUrl: audioUrl ?? null,
      processingStep: 'formatting',
    })

    const formatted = await formatTranscript(text, id, info.title, { engine, model })
    const fin = await finalizeTranscript(id, formatted)
    console.log(
      `[retranscribe:${id}] DONE — company "${(formatted as { company?: string }).company}" ` +
        `rev ${fin.revision}, ${fin.timedLines}/${fin.totalLines} lines timed, index ${fin.reindex.status}`
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
