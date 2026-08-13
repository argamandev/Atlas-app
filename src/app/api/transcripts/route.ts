import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getRequestUserId, unauthorized } from '@/lib/auth'
import { isValidVideoUrl, extractVideoId } from '@/lib/utils'

async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).single()
  return data?.role === 'admin'
}
import {
  getVideoInfo,
  downloadAudio,
  transcribeAudio,
  formatTranscript,
  formatDuration,
} from '@/lib/transcription'
import { birthTranscript, stageTranscriptContent, finalizeTranscript } from '@/lib/db/transcripts'
import { reindexTranscript, type CorpusDb } from '@/lib/corpus/reindex'
import * as fs from 'fs'

export async function GET(req: NextRequest) {
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()

  const { data, error } = await supabaseAdmin
    .from('transcripts')
    .select('id, youtube_title, status, processing_step, duration, created_at, formatted_data')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  // Ingesting a video costs money (yt-dlp + transcription + the correction model) and writes a
  // row owned by `userId`. The "V1 runs anonymously" comment that used to sit here stopped being
  // true when the login gate landed 2026-08-01; the demo-user fallback it justified was an
  // unauthenticated write endpoint that also spends.
  const userId = await getRequestUserId(req)
  if (!userId) return unauthorized()

  const body = await req.json()
  const { url, force, companyId } = body

  if (!isValidVideoUrl(url)) {
    return NextResponse.json({ error: 'קישור YouTube או Vimeo לא תקין' }, { status: 400 })
  }

  const videoId = extractVideoId(url)
  if (!videoId) {
    return NextResponse.json({ error: 'לא ניתן לחלץ מזהה וידאו' }, { status: 400 })
  }

  console.log(`[POST /api/transcripts] videoId=${videoId} url=${url}`)

  const { data: existingRows, error: selectErr } = await supabaseAdmin
    .from('transcripts')
    .select('id, status, created_at, raw_transcript')
    .eq('id', videoId)
    .limit(1)
  const existing = existingRows?.[0] ?? null

  if (selectErr) {
    console.error('[POST] select failed:', selectErr)
    return NextResponse.json({ error: `Supabase select failed: ${selectErr.message}` }, { status: 500 })
  }

  // Link this call to its company when it was added from a company page — so the
  // transcript shows up under that company and grounds the chat with correct context.
  // A refused link surfaces (supabase never throws — the error rides the result).
  // The chunk prefix carries the company name, so a re-link re-chunks (reindex
  // skips rows that are not completed; failure lands in the visible index_status).
  if (existing && companyId) {
    const { error: linkErr } = await supabaseAdmin
      .from('transcripts')
      .update({ company_id: companyId })
      .eq('id', videoId)
    if (linkErr) {
      console.error('[POST] company link failed:', linkErr)
      return NextResponse.json({ error: `Supabase update failed: ${linkErr.message}` }, { status: 500 })
    }
    await reindexTranscript(supabaseAdmin as unknown as CorpusDb, videoId)
  }

  // Admin force re-transcribe — re-runs the full pipeline on the SAME row.
  // (It used to mint a `_r<timestamp>` sibling; minting a second corpus row for
  // one real-world event is banned — the PyuMxe88e8g_live duplicate outranked
  // its twin in every retrieval design. Ingestion standard §1.)
  if (existing && force) {
    const admin = await isAdminUser(userId)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    console.log(`[POST] admin force re-transcribe → re-processing ${videoId} in place`)
    const { error: resetErr } = await supabaseAdmin
      .from('transcripts')
      .update({ status: 'processing', processing_step: 'downloading', error_message: null })
      .eq('id', videoId)
    if (resetErr) return NextResponse.json({ error: resetErr.message }, { status: 500 })
    setImmediate(() => {
      runPipeline(videoId, url).catch(async (err: Error) => {
        console.error('[pipeline] FAILED:', err.message)
        await supabaseAdmin
          .from('transcripts')
          .update({ status: 'failed', error_message: err.message })
          .eq('id', videoId)
      })
    })
    return NextResponse.json({ id: videoId })
  }

  if (existing) {
    if (existing.status === 'completed') {
      return NextResponse.json({ id: videoId })
    }
    if (existing.status === 'processing') {
      // If stuck >20 min, the background process was likely killed by a redeploy — restart it
      const ageMs = Date.now() - new Date(existing.created_at as string).getTime()
      if (ageMs < 10 * 60 * 1000) {
        return NextResponse.json({ id: videoId })
      }
      console.log(
        `[POST] record ${videoId} stuck in processing for ${Math.round(ageMs / 60000)}m — restarting pipeline`
      )
      await supabaseAdmin
        .from('transcripts')
        .update({ status: 'processing', processing_step: 'downloading', error_message: null })
        .eq('id', videoId)
      setImmediate(() => {
        runPipeline(videoId, url).catch(async (err: Error) => {
          console.error('[pipeline] FAILED:', err.message)
          await supabaseAdmin
            .from('transcripts')
            .update({ status: 'failed', error_message: err.message })
            .eq('id', videoId)
        })
      })
      return NextResponse.json({ id: videoId })
    }
    // Reset failed records. If the transcript already exists, re-run formatting only
    // (cheap — skips download + IVRIT). Otherwise restart the full pipeline.
    const hasTranscript = !!existing.raw_transcript
    const { error: updateErr } = await supabaseAdmin
      .from('transcripts')
      .update({
        status: 'processing',
        processing_step: hasTranscript ? 'formatting' : 'downloading',
        error_message: null,
      })
      .eq('id', videoId)
    if (updateErr) {
      console.error('[POST] update failed:', updateErr)
      return NextResponse.json({ error: `Supabase update failed: ${updateErr.message}` }, { status: 500 })
    }
  } else {
    // Born attributed (ingestion standard §2): the company is picked BEFORE the
    // pipeline starts — an import with no company is refused visibly, never
    // stored as an unattributed corpus row. The only shipped caller
    // (AddInvestorCall on the company page) always sends companyId.
    if (!companyId) {
      return NextResponse.json(
        { error: 'לא ניתן להעלות שיחה ללא שיוך לחברה — פתחו את עמוד החברה והעלו משם' },
        { status: 400 }
      )
    }
    // The birth door: identity (source_key = video id) + attribution enforced in
    // one place. A duplicate source answers with the EXISTING row, never a twin.
    let birth
    try {
      birth = await birthTranscript({
        id: videoId,
        sourceKey: videoId,
        companyId,
        userId,
        youtubeUrl: url,
      })
    } catch (e) {
      console.error('[POST] birth failed:', e)
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
    if (!birth.born) {
      console.log(`[POST] duplicate source ${videoId} → existing row ${birth.existingId}`)
      return NextResponse.json({ id: birth.existingId, alreadyExists: true })
    }
    console.log(`[POST] born ${videoId}`)
  }

  // Fire-and-forget. A failed/reset row that already has a transcript only needs
  // reformatting; everything else runs the full pipeline. (force already returned above.)
  const reformatOnly = !!existing && !!existing.raw_transcript
  setImmediate(() => {
    const run = reformatOnly ? reformatPipeline(videoId) : runPipeline(videoId, url)
    run.catch(async (err: Error) => {
      console.error('[pipeline] FAILED:', err.message)
      await supabaseAdmin
        .from('transcripts')
        .update({ status: 'failed', error_message: err.message })
        .eq('id', videoId)
    })
  })

  return NextResponse.json({ id: videoId })
}

async function runPipeline(videoId: string, url: string) {
  let audioPath: string | null = null
  const t0 = Date.now()
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`

  try {
    console.log(`[pipeline:${videoId}] start`)

    const info = await getVideoInfo(url)
    console.log(`[pipeline:${videoId}] video info OK (${elapsed()}) — "${info.title}"`)
    const { error: upd1err } = await supabaseAdmin
      .from('transcripts')
      .update({
        youtube_title: info.title,
        youtube_thumbnail: info.thumbnail,
        duration: formatDuration(info.durationSecs),
        processing_step: 'downloading',
      })
      .eq('id', videoId)
      .select()
    if (upd1err) console.error(`[pipeline:${videoId}] update1 error:`, upd1err)

    audioPath = await downloadAudio(url)
    console.log(`[pipeline:${videoId}] download OK (${elapsed()})`)

    const { error: upd2err } = await supabaseAdmin
      .from('transcripts')
      .update({ processing_step: 'transcribing' })
      .eq('id', videoId)
      .select()
    if (upd2err) console.error(`[pipeline:${videoId}] update2 error:`, upd2err)

    const { text: rawText, engine, model, segments, audioUrl } = await transcribeAudio(audioPath)
    console.log(
      `[pipeline:${videoId}] transcription OK (${elapsed()}) — ${rawText.length} chars via ${engine} (${model})`
    )

    await stageTranscriptContent(videoId, {
      rawTranscript: rawText,
      wordSegments: segments ?? null,
      audioUrl: audioUrl ?? null,
      processingStep: 'formatting',
    })

    const formatted = await formatTranscript(rawText, videoId, info.title, { engine, model })
    formatted.processingSecs = Math.round((Date.now() - t0) / 1000)
    console.log(`[pipeline:${videoId}] formatting OK (${elapsed()})`)

    // The one exit of every pipeline: aligned line times persisted, revision
    // accounted, chunks rebuilt atomically. Index failures land in the visible
    // index_status, not in this log line (standard §4–§5).
    const fin = await finalizeTranscript(videoId, formatted)
    console.log(
      `[pipeline:${videoId}] DONE (${elapsed()}) — rev ${fin.revision}, ${fin.timedLines}/${fin.totalLines} lines timed, index ${fin.reindex.status}`
    )
  } finally {
    if (audioPath && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath)
    }
  }
}

// Re-run ONLY the formatting step on a row that already has a stored transcript.
// Used when a call failed at formatting — skips download + IVRIT entirely.
async function reformatPipeline(videoId: string) {
  const t0 = Date.now()
  console.log(`[reformat:${videoId}] start (skipping download + transcription)`)

  const { data: row, error } = await supabaseAdmin
    .from('transcripts')
    .select('raw_transcript, youtube_title, word_segments')
    .eq('id', videoId)
    .single()
  if (error || !row?.raw_transcript) {
    throw new Error(`reformat: row ${videoId} has no raw_transcript (${error?.message ?? 'empty'})`)
  }

  const engine = row.word_segments ? 'ivrit' : 'whisper'
  const formatted = await formatTranscript(
    row.raw_transcript as string,
    videoId,
    (row.youtube_title as string) ?? '',
    { engine }
  )
  formatted.processingSecs = Math.round((Date.now() - t0) / 1000)

  const fin = await finalizeTranscript(videoId, formatted)
  console.log(
    `[reformat:${videoId}] DONE (${((Date.now() - t0) / 1000).toFixed(1)}s) — rev ${fin.revision}, index ${fin.reindex.status}`
  )
}
