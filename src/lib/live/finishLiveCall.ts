// Phase 1 — the "finish hand-off": turn an ended live call into a normal finished `transcripts`
// row so the existing finished page (`/app/live/[id]` → loadCompletedCall → LiveTranscriptView)
// renders it with synced-audio karaoke + the full toolbar. No IVRIT re-transcription, no YouTube
// download — reuses only Gemini polish (`formatTranscript`) and the stored `word_segments`/`audio_url`
// shapes. See docs/superpowers/specs/2026-06-16-live-transcript-ux-design.md.
//
// The top of this module is intentionally side-effect-free (pure transforms + types only) so the
// unit tests can import it without env. The heavy, env-dependent deps (Supabase admin client,
// the transcription/Gemini module, ffmpeg) are dynamically imported inside finishLiveCall().

import type { IvritWord, IvritSegment } from './syncEngine'

/** One word from the normalized live feed. `end`/`speaker` optional (degrades gracefully). */
export interface FeedWord {
  text: string
  start: number
  end?: number
  speaker?: string | null
}

/**
 * Keep the first contiguous capture session: drop everything after the first large backward jump
 * in `start` (a concatenated second session resets to ~0). Tolerates minor jitter below
 * `resetDropSec`. Pure.
 */
export function normalizeFeedWords(words: FeedWord[], resetDropSec = 5): FeedWord[] {
  if (words.length === 0) return []
  const out: FeedWord[] = [words[0]]
  for (let i = 1; i < words.length; i++) {
    if (words[i - 1].start - words[i].start > resetDropSec) break
    out.push(words[i])
  }
  return out
}

/** Give each word an `end`: the next word's start, or `start + tailPad` for the last/edge cases. Pure. */
export function synthesizeWordEnds(words: FeedWord[], tailPad = 0.5): IvritWord[] {
  return words.map((w, i) => {
    const next = words[i + 1]
    const end = w.end != null ? w.end : next && next.start > w.start ? next.start : w.start + tailPad
    return { word: w.text, start: w.start, end }
  })
}

/**
 * Build `word_segments` (IvritSegment[]) for a no-diarization feed: one segment, speaker=null.
 * Gemini's formatted_data drives the speaker turns proportionally at load
 * (`buildFromIvritWithGeminiNames`). Pure.
 */
export function buildWordSegments(words: FeedWord[], tailPad = 0.5): IvritSegment[] {
  if (words.length === 0) return []
  // Karaoke resolves the active word via a binary search over word starts (`activeWordIndex`),
  // which REQUIRES start-sorted input. Stable-sort defensively so any out-of-order jitter that
  // survived normalization can't desync the highlight.
  const sorted = [...words].sort((a, b) => a.start - b.start)
  const iwords = synthesizeWordEnds(sorted, tailPad)
  return [
    {
      text: iwords.map((w) => w.word).join(' '),
      start: iwords[0].start,
      end: iwords[iwords.length - 1].end,
      speaker: null,
      words: iwords,
    },
  ]
}

/** Captured span in seconds — the max word end (order-independent). Pure. */
export function feedDurationSec(words: FeedWord[], tailPad = 0.5): number {
  if (words.length === 0) return 0
  return words.reduce((m, w) => Math.max(m, w.end ?? w.start + tailPad), 0)
}

/** Sample-aligned PCM byte length for trimming. bytesPerFrame = 2 (S16LE) * channels. Pure. */
export function pcmByteLength(durationSec: number, sampleRate = 16000, bytesPerFrame = 2): number {
  return Math.max(0, Math.floor(durationSec * sampleRate) * bytesPerFrame)
}

export interface FinishInput {
  callId: string // synthetic transcripts id (idempotent upsert key)
  /** Resolved company id (e.g. from scheduling). Wins over companyTicker. */
  companyId?: string | null
  companyTicker?: string | null // links company_id via companies.tase_security_id
  companyName: string // header + Gemini context
  quarter: string // e.g. "Q1 2026"
  rawText: string // fed to Gemini
  words: FeedWord[] // feed words -> word_segments (karaoke)
  pcmPath: string
  sampleRate?: number // default 16000
  channels?: number // default 1
  userId: string
  tailPad?: number // default 0.5
}

/**
 * Born attributed (ingestion standard §2): the company is resolved BEFORE any
 * row exists — an unresolvable company THROWS visibly instead of quietly
 * storing null (the pre-A3 behavior this replaces). The company should ride in
 * from scheduling (`companyId`); the ticker lookup is the live path's fallback.
 */
export async function resolveFinishCompanyId(input: {
  companyId?: string | null
  companyTicker?: string | null
  companyName: string
}): Promise<string> {
  if (input.companyId) return input.companyId
  if (input.companyTicker) {
    const { supabaseAdmin } = await import('@/lib/supabase')
    const { data, error } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('tase_security_id', input.companyTicker)
      .maybeSingle()
    // A failed READ is not an attribution verdict (review finding 2026-08-13,
    // the discarded-{error} class's fourth filing): inventing "no such issuer"
    // for a transient DB failure is the invented-cause shape app.md forbids.
    if (error) {
      throw new Error(
        `live finish: companies read FAILED while resolving "${input.companyName}" — ${error.message} (transient; retry the finish, this is not an attribution verdict)`
      )
    }
    if (data?.id) return data.id as string
  }
  throw new Error(
    `live finish: cannot attribute "${input.companyName}" (ticker ${input.companyTicker ?? 'none'}) to a TASE issuer — corpus rows are born attributed`
  )
}

export interface FinishResult {
  id: string
  url: string
  audioUrl: string
  durationSec: number
  wordCount: number
}

/** Phase 1 spine: ended live call -> finished transcripts row (renderable by LiveTranscriptView). */
export async function finishLiveCall(input: FinishInput): Promise<FinishResult> {
  // Dynamic imports keep this module's top level import-safe for the pure-transform unit tests
  // (no env / no client construction at import time).
  const fs = await import('fs')
  const os = await import('os')
  const path = await import('path')
  const ffmpeg = (await import('fluent-ffmpeg')).default
  const ffmpegPath = (await import('@ffmpeg-installer/ffmpeg')).default
  const { supabaseAdmin } = await import('@/lib/supabase')
  const { formatTranscript, formatDuration } = await import('@/lib/transcription')
  const { birthLiveStub, finalizeTranscript } = await import('@/lib/db/transcripts')
  ffmpeg.setFfmpegPath(ffmpegPath.path)

  const sampleRate = input.sampleRate ?? 16000
  const channels = input.channels ?? 1
  const tailPad = input.tailPad ?? 0.5

  // Attribution FIRST — before audio work, before any row write (standard §2).
  const companyId = await resolveFinishCompanyId(input)

  const words = normalizeFeedWords(input.words)
  if (words.length === 0) throw new Error('finishLiveCall: no words after normalization')
  const segments = buildWordSegments(words, tailPad)
  const durationSec = feedDurationSec(words, tailPad)

  // 1. Trim the captured PCM to the transcript's span, encode to mp3 (32 kbps mono), upload.
  //    Trimming to the word span keeps audio↔text aligned AND stops a concatenated second capture
  //    session (whose per-word timeline resets to ~0) from bleeding into the playback tail.
  const pcm = fs.readFileSync(input.pcmPath)
  const wantBytes = pcmByteLength(durationSec, sampleRate, 2 * channels)
  const tmpPcm = path.join(os.tmpdir(), `finish_${input.callId}_${Date.now()}.pcm`)
  const tmpMp3 = tmpPcm.replace(/\.pcm$/, '.mp3')
  // Deterministic object name (keyed by callId) so a re-finish OVERWRITES the same audio object
  // instead of orphaning the previous mp3 in the bucket — and keeps `audio_url` stable across runs.
  const safeId = input.callId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const fileName = `live_finish_${safeId}.mp3`
  let audioUrl: string
  try {
    fs.writeFileSync(tmpPcm, pcm.subarray(0, Math.min(pcm.length, wantBytes)))
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tmpPcm)
        .inputOptions(['-f', 's16le', '-ar', String(sampleRate), '-ac', String(channels)])
        .audioCodec('libmp3lame')
        .audioBitrate('32k')
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .save(tmpMp3)
    })
    const { error: upErr } = await supabaseAdmin.storage
      .from('audio-temp')
      .upload(fileName, fs.readFileSync(tmpMp3), { contentType: 'audio/mpeg', upsert: true })
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)
    audioUrl = supabaseAdmin.storage.from('audio-temp').getPublicUrl(fileName).data.publicUrl
  } finally {
    if (fs.existsSync(tmpPcm)) fs.unlinkSync(tmpPcm)
    if (fs.existsSync(tmpMp3)) fs.unlinkSync(tmpMp3)
  }

  // 2. Gemini polish — same formatter as the IVRIT path. Title yields company + quarter.
  const title = `${input.companyName} ${input.quarter}`.trim()
  const formatted = await formatTranscript(input.rawText, input.callId, title, {
    engine: 'recall-live',
    model: 'live-finish',
  })
  const durationStr = formatDuration(Math.round(durationSec))
  formatted.duration = durationStr

  // 3. the birth door: ensure the attributed, source-keyed row exists (a
  //    re-airing re-processes the SAME row), then finalize — which persists the
  //    ALIGNED line times, bumps revision on re-processing, and rebuilds chunks
  //    atomically. Demo-family ids are excluded from the corpus by reindex.
  await birthLiveStub({
    id: input.callId,
    sourceKey: `live:${input.callId}`,
    companyId,
    userId: input.userId,
    youtubeUrl: `live://${input.callId}`,
    title,
  })
  await finalizeTranscript(input.callId, formatted, {
    rawTranscript: input.rawText,
    wordSegments: segments,
    audioUrl,
    duration: durationStr,
  })

  return {
    id: input.callId,
    url: `/app/live/${input.callId}`,
    audioUrl,
    durationSec,
    wordCount: words.length,
  }
}

/** The synthetic finished-call id (reused across airings; the live finish overwrites this row). */
export const DEMO_CALL_ID = 'live-finish-demo-tamis-2026-06-14'

interface DemoRec {
  id: number
  raw: string
  corrected: string | null
  words: { text: string; start: number }[]
}

/** FK-valid owner for a finished row: admin profile → newest transcript → fallback uuid. */
async function resolveOwnerUserId(): Promise<string> {
  const { supabaseAdmin } = await import('@/lib/supabase')
  const { data: admin } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()
  if (admin?.id) return admin.id as string
  const { data: t } = await supabaseAdmin
    .from('transcripts')
    .select('user_id')
    .not('user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (t?.user_id as string) ?? '00000000-0000-0000-0000-000000000000'
}

/**
 * Demo finish: read the recorded Or-Yam session, (optionally) mark a `processing` stub so a poller
 * sees it, then run the full finish pipeline. Used by both the runner script and POST /api/live/finish.
 * Dynamic imports keep this module's top level side-effect-free for the unit tests.
 */
export async function runDemoFinish(opts: { markProcessing?: boolean } = {}): Promise<FinishResult> {
  const fs = await import('fs')
  const path = await import('path')

  const sessDir = path.join(process.cwd(), 'scripts', 'out', 'sessions')
  const recs = fs
    .readFileSync(path.join(sessDir, 'tamis-2026-06-14.jsonl'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l) as DemoRec)

  // First capture session only (drop the concatenated second one — see normalizeFeedWords).
  const sessRecs: DemoRec[] = []
  let lastStart = -Infinity
  for (const r of recs) {
    const first = r.words?.[0]?.start ?? lastStart
    if (lastStart - first > 5) break
    sessRecs.push(r)
    lastStart = r.words?.[r.words.length - 1]?.start ?? first
  }
  const words: FeedWord[] = sessRecs.flatMap((r) => r.words.map((w) => ({ text: w.text, start: w.start })))
  const rawText = sessRecs.map((r) => r.raw).join('\n\n')

  // FK-valid owner: explicit uuid arg (CLI) → admin profile → newest transcript → fallback.
  const arg = process.argv[2]
  const userId = arg && /^[0-9a-fA-F-]{36}$/.test(arg) ? arg : await resolveOwnerUserId()

  if (opts.markProcessing) {
    // The stub rides the birth door: attributed + source-keyed like every row,
    // and a failed write surfaces, never vanishes (migration 027; standard §2).
    const { birthLiveStub } = await import('@/lib/db/transcripts')
    const companyId = await resolveFinishCompanyId({ companyTicker: '1097229', companyName: 'תמיס' })
    await birthLiveStub({
      id: DEMO_CALL_ID,
      sourceKey: `live:${DEMO_CALL_ID}`,
      companyId,
      userId,
      youtubeUrl: `live://${DEMO_CALL_ID}`,
      title: 'תמיס Q1 2026',
    })
  }

  return finishLiveCall({
    callId: DEMO_CALL_ID,
    companyTicker: '1097229',
    companyName: 'תמיס',
    quarter: 'Q1 2026',
    rawText,
    words,
    pcmPath: path.join(sessDir, 'tamis-2026-06-14.pcm'),
    sampleRate: 16000,
    channels: 1,
    userId,
  })
}

/**
 * Live finish (real call): read THIS airing's captured broadcast buffer
 * (scripts/out/broadcast-lines.jsonl + broadcast-audio.pcm) and run the finish pipeline, overwriting
 * the synthetic row. Recall's accuracy mode delivers transcript chunks up to ~188s AFTER the audio,
 * so this first waits for the captions to catch up to the (now-final) audio length — otherwise the
 * finished transcript would be truncated to whatever had arrived at source-end. Used by
 * POST /api/live/finish. Dynamic imports keep the module top level import-safe for the unit tests.
 */
export async function runLiveBroadcastFinish(opts: { markProcessing?: boolean } = {}): Promise<FinishResult> {
  const fs = await import('fs')
  const path = await import('path')

  const outDir = path.join(process.cwd(), 'scripts', 'out')
  const linesPath = path.join(outDir, 'broadcast-lines.jsonl')
  const pcmPath = path.join(outDir, 'broadcast-audio.pcm')
  if (!fs.existsSync(linesPath) || !fs.existsSync(pcmPath)) {
    throw new Error('no live broadcast captured (run a live call first)')
  }

  type BLine = { raw: string; corrected: string | null; words: { text: string; start: number | null }[] }
  const readLines = (): BLine[] =>
    fs
      .readFileSync(linesPath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l) as BLine)
  const lastWordStart = (ls: BLine[]): number => ls.at(-1)?.words?.at(-1)?.start ?? 0

  const userId = await resolveOwnerUserId()
  if (opts.markProcessing) {
    // Same law as runDemoFinish's stub: attributed, keyed, and a failed write
    // surfaces, never vanishes (027; standard §2).
    const { birthLiveStub } = await import('@/lib/db/transcripts')
    const companyId = await resolveFinishCompanyId({ companyTicker: '1097229', companyName: 'תמיס' })
    await birthLiveStub({
      id: DEMO_CALL_ID,
      sourceKey: `live:${DEMO_CALL_ID}`,
      companyId,
      userId,
      youtubeUrl: `live://${DEMO_CALL_ID}`,
      title: 'תמיס Q2 2026',
    })
  }

  // Audio is final once the source ended (PCM stopped growing); captions trail by up to ~188s. Wait
  // until the transcript reaches the audio end (within 8s) or a hard cap, so nothing is truncated.
  const pcmDurSec = fs.statSync(pcmPath).size / 2 / 16000
  const cap = Date.now() + 220_000
  while (Date.now() < cap) {
    const ls = readLines()
    if (ls.length && lastWordStart(ls) >= pcmDurSec - 8) break
    await new Promise((r) => setTimeout(r, 4000))
  }

  const lines = readLines()
  const words: FeedWord[] = lines.flatMap((l) =>
    (l.words ?? [])
      .filter((w): w is { text: string; start: number } => typeof w.start === 'number')
      .map((w) => ({ text: w.text, start: w.start }))
  )
  if (!words.length) throw new Error('no words captured in the live broadcast')
  const rawText = lines.map((l) => l.corrected || l.raw).join('\n\n')

  return finishLiveCall({
    callId: DEMO_CALL_ID,
    companyTicker: '1097229',
    companyName: 'תמיס',
    quarter: 'Q2 2026',
    rawText,
    words,
    pcmPath,
    sampleRate: 16000,
    channels: 1,
    userId,
  })
}
