import OpenAI from 'openai'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from '@ffmpeg-installer/ffmpeg'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { getVideoInfo as ytGetInfo, downloadAudio as ytDownload } from './ytdlp'
import { supabaseAdmin } from './supabase'
import type { Transcript, CorrectionDiag } from './types'
import type { IvritSegment, IvritWord } from './live/syncEngine'

ffmpeg.setFfmpegPath(ffmpegPath.path)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY
const RUNPOD_IVRIT_ENDPOINT_ID = process.env.RUNPOD_IVRIT_ENDPOINT_ID

const IVRIT_MODEL = process.env.RUNPOD_IVRIT_MODEL || 'ivrit-ai/whisper-large-v3-ct2'
const IVRIT_FALLBACK_MODEL = 'ivrit-ai/whisper-large-v3-turbo-ct2'

// Speaker diarization for the live karaoke. Word-level sync does NOT depend on this —
// set IVRIT_DIARIZE=false to drop speaker labels and show one continuous synced transcript.
const IVRIT_DIARIZE = (process.env.IVRIT_DIARIZE ?? 'true') !== 'false'

export interface TranscriptionResult {
  text: string
  engine: 'ivrit' | 'whisper'
  model: string
  /** word-timed segments (IVRIT word_timestamps) — drives the live karaoke. undefined on the plain-text/whisper paths. */
  segments?: IvritSegment[]
  /** persisted audio URL (Supabase Storage) for live playback. */
  audioUrl?: string
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    ),
  ])
}

async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const MAX_WHISPER_BYTES = 24 * 1024 * 1024

export async function getVideoInfo(url: string) {
  return withTimeout(ytGetInfo(url), 90 * 1000, 'yt-dlp metadata')
}

export async function downloadAudio(url: string): Promise<string> {
  const base = path.join(os.tmpdir(), `inv_audio_${Date.now()}`)
  const finalPath = `${base}.mp3`
  await withTimeout(ytDownload(url, `${base}.%(ext)s`), 6 * 60 * 1000, 'yt-dlp download')

  const tmpDir = os.tmpdir()
  const prefix = path.basename(base)
  const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(prefix))
  if (files.length === 0) throw new Error('Audio download produced no file')

  const actualPath = path.join(tmpDir, files[0])
  if (actualPath !== finalPath) fs.renameSync(actualPath, finalPath)
  return finalPath
}

async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, meta) => {
      if (err) reject(err)
      else resolve(meta.format.duration ?? 0)
    })
  })
}

async function splitAudio(audioPath: string): Promise<string[]> {
  const totalDuration = await getAudioDuration(audioPath)
  const segmentSecs = 20 * 60
  const count = Math.ceil(totalDuration / segmentSecs)
  const segments: string[] = []

  for (let i = 0; i < count; i++) {
    const start = i * segmentSecs
    const outPath = path.join(os.tmpdir(), `inv_seg_${Date.now()}_${i}.mp3`)

    await new Promise<void>((resolve, reject) => {
      ffmpeg(audioPath)
        .setStartTime(start)
        .setDuration(Math.min(segmentSecs, totalDuration - start))
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outPath)
    })

    segments.push(outPath)
  }

  return segments
}

async function whisperFile(filePath: string): Promise<string> {
  const response = await withTimeout(
    openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath) as unknown as File,
      model: 'whisper-1',
      language: 'he',
      prompt: 'שיחת משקיעים רבעונית. מונחים נפוצים: רבעון, תשואה, EBITDA, תזרים מזומנים, הכנסות, רווח גולמי, הוצאות תפעול, חוב פיננסי, הון עצמי, דיבידנד, מניה, בורסה, תל אביב, דוח כספי, מאזן, התחייבויות, נכסים, השקעות, פחת והפחתות, מגה-וואט, ג\'יגה-וואט, ייזום, מימון, אגרות חוב, ריבית, גידור, נגזרים, אנליסט, תחזית, הנחיה שנתית, צמיחה, שוליים, תפעולי, רווחיות, נזילות, מינוף, CAPEX, OPEX, DCF, IPO, M&A, FFO, NOI.',
    }),
    5 * 60 * 1000,
    `Whisper (${path.basename(filePath)})`
  )
  return response.text
}

async function uploadAudioToStorage(audioPath: string): Promise<{ publicUrl: string; storagePath: string }> {
  const fileName = `audio_${Date.now()}_${path.basename(audioPath)}`
  const fileBuffer = fs.readFileSync(audioPath)

  const { error } = await supabaseAdmin.storage
    .from('audio-temp')
    .upload(fileName, fileBuffer, { contentType: 'audio/mpeg', upsert: false })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabaseAdmin.storage.from('audio-temp').getPublicUrl(fileName)
  return { publicUrl: data.publicUrl, storagePath: fileName }
}

// Submit one transcription job to the IVRIT/RunPod endpoint and poll to completion.
async function runIvritJob(transcribeArgs: Record<string, unknown>, model: string): Promise<unknown> {
  const runRes = await fetch(`https://api.runpod.ai/v2/${RUNPOD_IVRIT_ENDPOINT_ID}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RUNPOD_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { model, streaming: false, transcribe_args: transcribeArgs } }),
  })
  if (!runRes.ok) throw new Error(`RunPod submit failed ${runRes.status}: ${await runRes.text()}`)
  const { id: jobId } = (await runRes.json()) as { id: string }
  console.log(`[ivrit] job submitted: ${jobId}`)

  const maxWaitMs = 30 * 60 * 1000
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 5000))
    const statusRes = await fetch(`https://api.runpod.ai/v2/${RUNPOD_IVRIT_ENDPOINT_ID}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
    })
    if (!statusRes.ok) continue
    const status = (await statusRes.json()) as { status: string; output?: unknown; error?: unknown }
    console.log(`[ivrit] status: ${status.status}`)
    if (status.status === 'COMPLETED') return status.output
    if (status.status === 'FAILED') throw new Error(`RunPod job failed: ${JSON.stringify(status.error)}`)
  }
  throw new Error('IVRIT transcription timed out after 30 minutes')
}

function asNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : null
}

// Walk RunPod's output ({type:'segments',data:[...]} chunks, {result}, arrays, bare segments)
// and collect raw segment objects — defensive because the exact envelope varies.
function collectRawSegments(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!node) return out
  if (Array.isArray(node)) {
    for (const n of node) collectRawSegments(n, out)
    return out
  }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (o.type === 'segments' && Array.isArray(o.data)) {
      for (const s of o.data) collectRawSegments(s, out)
      return out
    }
    if (Array.isArray(o.segments)) {
      for (const s of o.segments) collectRawSegments(s, out)
      return out
    }
    if ('text' in o && ('start' in o || 'words' in o)) {
      out.push(o)
      return out
    }
    if ('result' in o) return collectRawSegments(o.result, out)
    if ('output' in o) return collectRawSegments(o.output, out)
    if ('data' in o) return collectRawSegments(o.data, out)
  }
  return out
}

// Normalize raw IVRIT segments into our word-timed shape.
function parseIvritSegments(output: unknown): IvritSegment[] {
  const segs: IvritSegment[] = []
  for (const s of collectRawSegments(output)) {
    const start = asNum(s.start)
    if (start == null) continue
    const end = asNum(s.end) ?? start
    const extra = (s.extra_data ?? {}) as Record<string, unknown>
    const wordsRaw = (Array.isArray(s.words) ? s.words : Array.isArray(extra.words) ? extra.words : []) as Record<string, unknown>[]
    const words: IvritWord[] = wordsRaw
      .map((w) => ({ word: String(w.word ?? w.text ?? '').trim(), start: asNum(w.start) ?? start, end: asNum(w.end) ?? asNum(w.start) ?? end }))
      .filter((w) => w.word)
    // IVRIT diarization exposes the speaker as a segment-level `speakers: [label]` array
    // (and per-word `speaker`); fall back through the singular forms. Reading only `s.speaker`
    // dropped diarization → every turn collapsed into one block.
    const firstWordSpeaker = (wordsRaw[0]?.speaker as string | undefined) ?? undefined
    const speakerRaw =
      s.speaker ??
      (Array.isArray(s.speakers) ? s.speakers[0] : undefined) ??
      extra.speaker ??
      (Array.isArray(extra.speakers) ? (extra.speakers as unknown[])[0] : undefined) ??
      firstWordSpeaker ??
      null
    segs.push({ text: String(s.text ?? '').trim(), start, end, speaker: speakerRaw != null ? String(speakerRaw) : null, words })
  }
  return segs.filter((s) => s.text || s.words.length)
}

// Plain-text fallback extraction (string result / {text} / segment arrays).
function extractIvritText(output: unknown): string {
  const segs = parseIvritSegments(output)
  if (segs.length) return segs.map((s) => s.text).join(' ').trim()
  const data = Array.isArray(output) ? (output as unknown[])[0] : output
  const result = (data as { result?: unknown } | undefined)?.result
  if (typeof result === 'string') return result.trim()
  if (result && typeof result === 'object' && 'text' in result) return String((result as { text: unknown }).text).trim()
  return ''
}

// Run the rich→plain attempts against ONE model. Throws if both yield nothing.
async function ivritTranscribeWithModel(publicUrl: string, model: string): Promise<{ text: string; segments?: IvritSegment[] }> {
  // Attempt 1: rich request — per-word timestamps (+ optional diarization). Drives the karaoke.
  try {
    const output = await runIvritJob({
      url: publicUrl,
      language: 'he',
      ...(IVRIT_DIARIZE ? { diarize: true } : {}),
      output_options: { word_timestamps: true, extra_data: true },
    }, model)
    console.log(`[ivrit:${model}] raw output (rich): ${JSON.stringify(output).slice(0, 800)}`)
    const segments = parseIvritSegments(output)
    const text = segments.length ? segments.map((s) => s.text).join(' ').trim() : extractIvritText(output)
    const withWords = segments.filter((s) => s.words.length).length
    if (text) {
      console.log(`[ivrit:${model}] rich done — ${text.length} chars, ${segments.length} segs, ${withWords} with word timings`)
      return { text, segments: withWords ? segments : undefined }
    }
    console.warn(`[ivrit:${model}] rich request returned no text — falling back to plain_text`)
  } catch (err) {
    console.warn(`[ivrit:${model}] rich request failed — falling back to plain_text: ${(err as Error).message}`)
  }

  // Attempt 2 (safe fallback): the original plain-text request — never breaks existing transcription.
  const output = await runIvritJob({ url: publicUrl, language: 'he', transcription: 'plain_text' }, model)
  const text = extractIvritText(output)
  if (!text) throw new Error('IVRIT returned empty transcript')
  console.log(`[ivrit:${model}] plain done — ${text.length} chars`)
  return { text }
}

async function transcribeWithIvrit(audioPath: string): Promise<{ text: string; segments?: IvritSegment[]; audioUrl: string; model: string }> {
  // Audio is uploaded to Storage AND kept (not deleted) so the live page can play it back.
  const { publicUrl } = await uploadAudioToStorage(audioPath)
  console.log(`[ivrit] uploaded audio (persisted), size: ${fs.statSync(audioPath).size} bytes`)

  // Accurate model first; on failure retry once with the faster, proven turbo model.
  try {
    const { text, segments } = await ivritTranscribeWithModel(publicUrl, IVRIT_MODEL)
    return { text, segments, audioUrl: publicUrl, model: IVRIT_MODEL }
  } catch (err) {
    if (IVRIT_MODEL === IVRIT_FALLBACK_MODEL) throw err
    console.warn(`[ivrit] model ${IVRIT_MODEL} failed — retrying with ${IVRIT_FALLBACK_MODEL}: ${(err as Error).message}`)
    const { text, segments } = await ivritTranscribeWithModel(publicUrl, IVRIT_FALLBACK_MODEL)
    return { text, segments, audioUrl: publicUrl, model: IVRIT_FALLBACK_MODEL }
  }
}

async function whisperTranscribe(audioPath: string): Promise<string> {
  const { size } = fs.statSync(audioPath)
  if (size <= MAX_WHISPER_BYTES) {
    return whisperFile(audioPath)
  }
  const segments = await splitAudio(audioPath)
  const parts: string[] = []
  for (const seg of segments) {
    parts.push(await whisperFile(seg))
    fs.unlinkSync(seg)
  }
  return parts.join(' ')
}

export async function transcribeAudio(audioPath: string): Promise<TranscriptionResult> {
  if (RUNPOD_API_KEY && RUNPOD_IVRIT_ENDPOINT_ID) {
    try {
      console.log(`[transcribe] using IVRIT/RunPod (model: ${IVRIT_MODEL}, diarize: ${IVRIT_DIARIZE})`)
      const { text, segments, audioUrl, model } = await transcribeWithIvrit(audioPath)
      return { text, engine: 'ivrit', model, segments, audioUrl }
    } catch (err) {
      console.error('[transcribe] IVRIT failed — falling back to Whisper:', (err as Error).message)
    }
  } else {
    console.log('[transcribe] using OpenAI Whisper (no RunPod config)')
  }

  const text = await whisperTranscribe(audioPath)
  return { text, engine: 'whisper', model: 'whisper-1' }
}

interface Speaker { id: string; name: string; role: string; title: string; affiliation: string }
interface Line { id: string; speakerId: string; timestamp: string; text: string }

// Parse company name and quarter directly from the YouTube video title — no LLM needed
function parseTitleMeta(videoTitle: string, today: string): {
  company: string; business: string; ticker: string; quarter: string; date: string
  speakers: Array<{ name: string; role: string; title: string }>
} {
  let title = videoTitle

  // Extract quarter — try English format first, then Hebrew
  let quarter = ''
  const qEn = title.match(/\bQ([1-4])\s*[-–]?\s*(20\d{2})\b/i)
  if (qEn) {
    quarter = `Q${qEn[1]} ${qEn[2]}`
    title = title.replace(qEn[0], '')
  } else {
    const heOrdinal: Record<string, string> = { ראשון: '1', שני: '2', שלישי: '3', רביעי: '4' }
    const qHe = title.match(/רבעון\s+([1-4]|ראשון|שני|שלישי|רביעי)\s+(20\d{2})/)
    if (qHe) {
      quarter = `Q${heOrdinal[qHe[1]] ?? qHe[1]} ${qHe[2]}`
      title = title.replace(qHe[0], '')
    } else {
      const yr = title.match(/\b(20\d{2})\b/)
      if (yr) { quarter = yr[1]; title = title.replace(yr[0], '') }
    }
  }

  // Strip boilerplate
  for (const b of ['שיחת משקיעים', 'שיחת ועידה', 'תוצאות', 'סיכום', 'מצגת', 'דוח רבעוני',
    'investor call', 'earnings call', 'conference call']) {
    title = title.replace(new RegExp(b, 'gi'), '')
  }
  title = title
    .replace(/\bQ[1-4]\b/gi, '')
    .replace(/\b20\d{2}\b/g, '')
    .replace(/\bבע["״]מ\b/g, '')
    .replace(/\bבעמ\b/g, '')
    .replace(/[-–—|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return { company: title, business: '', ticker: '', quarter, date: today, speakers: [] }
}

// Call Gemini 3.5 Flash with the company-aware formatting prompt (2 attempts)
async function formatWithGeminiFlash(rawText: string, company: string, business: string): Promise<string> {
  const GEMINI_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set')
  const businessDesc = business ? `${business} company` : 'Israeli public company'
  const prompt = `The text below is a raw IVRIT speech-to-text with no speaker labels. The speaker names are already in the text.

your mission is to understand the context of the call, organize it beautifully with speaker names, paragraphs of each speaker and fix specific typos or wrong words based on the context you understand.

This is an investors call transcript -of a company called "${company}" which is an Israeli ${businessDesc}. It's very important you dont "guess" the fix to a typo and you don't change the number of words in the raw transcript.

Don't rephrase and dont summorize!

Just organize everything, fix specific words you are confident they are wrong based on the context!

${rawText}`

  let lastErr: Error | undefined
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await withTimeout(
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 65536, temperature: 1 },
            }),
          }
        ),
        3 * 60 * 1000,
        'Gemini format'
      )
      const json = await res.json() as {
        candidates?: Array<{ content: { parts: Array<{ text?: string }> } }>
        error?: unknown
      }
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(json.error ?? json)}`)
      const text = (json.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('')
      if (!text) throw new Error('Gemini returned empty response')
      console.log(`[format] Gemini output: ${text.length} chars`)
      return text
    } catch (err) {
      lastErr = err as Error
      if (attempt < 2) {
        console.warn(`[format] Gemini attempt ${attempt} failed — retrying: ${lastErr.message}`)
        await new Promise(r => setTimeout(r, 3000))
      }
    }
  }
  throw lastErr!
}

// Parse Gemini's markdown output (bold "**Name:**" or "## Name" headers) into structured lines
export function parseGeminiOutput(
  text: string,
  metaSpeakers: Array<{ name: string; role: string; title: string }>,
): { mgmtLines: Line[]; qaLines: Line[]; speakers: Speaker[] } {
  const registry: Record<string, Speaker> = {}
  const speakers: Speaker[] = (metaSpeakers ?? []).map((s, i) => {
    const sp: Speaker = { id: `sp${i + 1}`, name: s.name, role: s.role, title: s.title ?? s.name, affiliation: '' }
    registry[s.name] = sp
    return sp
  })

  function getSpeaker(displayName: string): Speaker {
    if (registry[displayName]) return registry[displayName]
    const tok = displayName.split(' ')[0]
    const partial = speakers.find(s => s.name.startsWith(tok) || displayName.startsWith(s.name.split(' ')[0]))
    if (partial) return partial
    const id = `sp${speakers.length + 1}`
    let role = 'analyst'
    if (/מנכ/.test(displayName)) role = 'ceo'
    else if (/כספ|cfo/i.test(displayName)) role = 'cfo'
    else if (/שירן|מנח|מארח/.test(displayName)) role = 'moderator'
    const sp: Speaker = { id, name: displayName, role, title: displayName, affiliation: '' }
    registry[displayName] = sp
    speakers.push(sp)
    return sp
  }

  // Split on "## Name" or "**Name:**" speaker headers
  const parts = text.split(/(?=^(?:#{2,3}\s|\*\*[^\n*]+\*\*:?\s*$))/m)

  const mgmtLines: Line[] = []
  const qaLines: Line[] = []
  let lineCounter = 0
  let qaStarted = false

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const headerMatch = trimmed.match(/^(?:#{2,3}\s+\*{0,2}([^*\n#]+)\*{0,2}|\*\*([^*\n]+?)\*\*:?)/)
    if (!headerMatch) continue
    const speakerName = (headerMatch[1] ?? headerMatch[2])?.trim().replace(/:$/, '')
    if (!speakerName) continue

    const speaker = getSpeaker(speakerName)
    const afterHeader = trimmed.slice(headerMatch[0].length)
    const paragraphs = afterHeader
      .replace(/\n---+\n/g, '\n\n')
      .split(/\n\n+/)
      .map(p => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(p => p && !/^\*{3}/.test(p) && !/^---/.test(p) && !/^#{1,3}/.test(p))

    for (const para of paragraphs) {
      lineCounter++
      const line: Line = {
        id: `L${String(lineCounter).padStart(4, '0')}`,
        speakerId: speaker.id,
        timestamp: '00:00:00',
        text: para,
      }
      if (qaStarted) qaLines.push(line)
      else mgmtLines.push(line)
    }
  }

  // Fallback Q&A section detection
  if (qaLines.length === 0) {
    const QA_PATTERNS = ['ונעבור כרגע לשאלות', 'נעבור לשאלות', 'נפתח לשאלות', 'נשמח לקבל שאלות', 'שאלות ותשובות']
    const splitIdx = mgmtLines.findIndex(l => QA_PATTERNS.some(p => l.text.includes(p)))
    if (splitIdx !== -1) {
      console.log(`[format] Q&A fallback — splitting at line ${splitIdx + 1}`)
      qaLines.push(...mgmtLines.splice(splitIdx))
      ;[...mgmtLines, ...qaLines].forEach((l, i) => { l.id = `L${String(i + 1).padStart(4, '0')}` })
    }
  }

  console.log(`[format] parsed ${lineCounter} lines (mgmt: ${mgmtLines.length}, qa: ${qaLines.length})`)
  return { mgmtLines, qaLines, speakers }
}

export async function formatTranscript(
  rawText: string,
  videoId: string,
  videoTitle: string,
  opts: { engine?: string; model?: string } = {},
): Promise<Transcript> {
  const now = new Date().toISOString()
  const today = now.split('T')[0]

  // Step 1: parse company and quarter from the video title
  const meta = parseTitleMeta(videoTitle, today)
  console.log(`[format] meta — company: "${meta.company}"  quarter: "${meta.quarter}"`)


  // Step 2: format and organize with Gemini 3.5 Flash
  console.log('[format] formatting with Gemini 3.5 Flash...')
  const geminiOutput = await formatWithGeminiFlash(rawText, meta.company ?? '', meta.business ?? '')

  // Step 3: parse into structured sections
  const { mgmtLines, qaLines, speakers } = parseGeminiOutput(geminiOutput, meta.speakers ?? [])

  return buildTranscript(videoId, meta, today, now, speakers, mgmtLines, qaLines, opts)
}

function buildTranscript(
  videoId: string,
  meta: { company: string; ticker: string; quarter: string; date: string },
  today: string,
  now: string,
  speakers: Speaker[],
  mgmtLines: Line[],
  qaLines: Line[],
  opts: { engine?: string; model?: string; corrections?: CorrectionDiag[]; entities?: string[] } = {},
): Transcript {
  return {
    id: videoId,
    company: meta.company ?? '',
    ticker: meta.ticker ?? '',
    quarter: meta.quarter ?? '',
    date: meta.date ?? today,
    duration: '',
    youtubeUrl: '',
    status: 'completed',
    createdAt: now,
    engine: opts.engine,
    model: opts.model,
    corrections: opts.corrections,
    entities: opts.entities,
    speakers,
    sections: [
      { id: 'sec_mgmt', title: 'דברי הנהלה', lines: mgmtLines },
      { id: 'sec_qa', title: 'שאלות ותשובות', lines: qaLines },
    ],
  } as unknown as Transcript
}

export function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
