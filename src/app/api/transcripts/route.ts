import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getRequestUserId } from '@/lib/auth'
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
import * as fs from 'fs'

export async function GET(req: NextRequest) {
  const userId = await getRequestUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('transcripts')
    .select('id, youtube_title, status, processing_step, duration, created_at, formatted_data')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const userId = await getRequestUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    .select('id, status, created_at')
    .eq('id', videoId)
    .limit(1)
  const existing = existingRows?.[0] ?? null

  if (selectErr) {
    console.error('[POST] select failed:', selectErr)
    return NextResponse.json({ error: `Supabase select failed: ${selectErr.message}` }, { status: 500 })
  }

  // Link this call to its company when it was added from a company page — so the
  // transcript shows up under that company and grounds the chat with correct context.
  if (existing && companyId) {
    await supabaseAdmin.from('transcripts').update({ company_id: companyId }).eq('id', videoId)
  }

  // Admin force re-transcribe — inserts a NEW row (suffix _r<timestamp>) so the
  // original is preserved for side-by-side comparison in the dashboard.
  if (existing && force) {
    const admin = await isAdminUser(userId)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const retryId = `${videoId}_r${Date.now().toString(36)}`
    console.log(`[POST] admin force re-transcribe → new id=${retryId}`)
    const { error: insertErr } = await supabaseAdmin.from('transcripts').insert({
      id: retryId,
      youtube_url: url,
      status: 'processing',
      processing_step: 'downloading',
      user_id: userId,
      company_id: companyId ?? null,
    })
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
    setImmediate(() => {
      runPipeline(retryId, url).catch(async (err: Error) => {
        console.error('[pipeline] FAILED:', err.message)
        await supabaseAdmin.from('transcripts').update({ status: 'failed', error_message: err.message }).eq('id', retryId)
      })
    })
    return NextResponse.json({ id: retryId })
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
      console.log(`[POST] record ${videoId} stuck in processing for ${Math.round(ageMs / 60000)}m — restarting pipeline`)
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
    // Reset failed records
    const { error: updateErr } = await supabaseAdmin
      .from('transcripts')
      .update({ status: 'processing', processing_step: 'downloading', error_message: null })
      .eq('id', videoId)
    if (updateErr) {
      console.error('[POST] update failed:', updateErr)
      return NextResponse.json({ error: `Supabase update failed: ${updateErr.message}` }, { status: 500 })
    }
  } else {
    const { data: insertedRows, error: insertErr } = await supabaseAdmin.from('transcripts').insert({
      id: videoId,
      youtube_url: url,
      status: 'processing',
      processing_step: 'downloading',
      user_id: userId,
      company_id: companyId ?? null,
    }).select()
    console.log(`[POST] insert result: data=${JSON.stringify(insertedRows)}, error=${JSON.stringify(insertErr)}`)
    if (insertErr) {
      console.error('[POST] insert failed:', insertErr)
      return NextResponse.json({ error: `Supabase insert failed: ${insertErr.message}` }, { status: 500 })
    }
    if (!insertedRows?.length) {
      console.error(`[POST] INSERT SILENT FAILURE — SDK returned no error but no row data for ${videoId}`)
      return NextResponse.json({ error: 'Insert silent failure — row not created' }, { status: 500 })
    }
    console.log(`[POST] inserted row for ${videoId}`)
  }

  // Fire-and-forget
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
    console.log(`[pipeline:${videoId}] transcription OK (${elapsed()}) — ${rawText.length} chars via ${engine} (${model})`)

    const { error: upd3err } = await supabaseAdmin
      .from('transcripts')
      .update({ raw_transcript: rawText, processing_step: 'formatting' })
      .eq('id', videoId)
      .select()
    if (upd3err) console.error(`[pipeline:${videoId}] update3 error:`, upd3err)

    const formatted = await formatTranscript(rawText, videoId, info.title, { engine, model })
    formatted.processingSecs = Math.round((Date.now() - t0) / 1000)
    console.log(`[pipeline:${videoId}] formatting OK (${elapsed()})`)

    const { error: upd4err } = await supabaseAdmin
      .from('transcripts')
      .update({
        formatted_data: formatted,
        status: 'completed',
        processing_step: 'completed',
        audio_url: audioUrl ?? null,
        word_segments: segments ?? null,
      })
      .eq('id', videoId)
      .select()
    if (upd4err) console.error(`[pipeline:${videoId}] update4 error:`, upd4err)

    console.log(`[pipeline:${videoId}] DONE (${elapsed()})`)
  } finally {
    if (audioPath && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath)
    }
  }
}
