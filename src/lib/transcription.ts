import OpenAI from 'openai'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from '@ffmpeg-installer/ffmpeg'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { getVideoInfo as ytGetInfo, downloadAudio as ytDownload } from './ytdlp'
import { supabaseAdmin } from './supabase'
import type { Transcript, CorrectionDiag } from './types'
import { correctTranscript, attachFlags, type Profile } from './correction'

ffmpeg.setFfmpegPath(ffmpegPath.path)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY
const RUNPOD_IVRIT_ENDPOINT_ID = process.env.RUNPOD_IVRIT_ENDPOINT_ID

// IVRIT model sent to the RunPod endpoint. Override via env to A/B test the
// full-accuracy build (ivrit-ai/whisper-large-v3-ct2) vs the faster turbo build.
const IVRIT_MODEL = process.env.RUNPOD_IVRIT_MODEL || 'ivrit-ai/whisper-large-v3-turbo-ct2'

export interface TranscriptionResult {
  text: string
  engine: 'ivrit' | 'whisper'
  model: string
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

const MAX_WHISPER_BYTES = 24 * 1024 * 1024 // 24 MB

export async function getVideoInfo(url: string) {
  return withTimeout(ytGetInfo(url), 90 * 1000, 'yt-dlp metadata')
}

export async function downloadAudio(url: string): Promise<string> {
  // yt-dlp outputs to the path we give it, but adds the extension itself
  // We pass a path without extension and let yt-dlp add .mp3
  const base = path.join(os.tmpdir(), `inv_audio_${Date.now()}`)
  const finalPath = `${base}.mp3`
  await withTimeout(ytDownload(url, `${base}.%(ext)s`), 6 * 60 * 1000, 'yt-dlp download')

  // yt-dlp may have named it slightly differently — find it
  const tmpDir = os.tmpdir()
  const prefix = path.basename(base)
  const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(prefix))
  if (files.length === 0) throw new Error('Audio download produced no file')

  const actualPath = path.join(tmpDir, files[0])
  // Rename to consistent .mp3 if needed
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

async function transcribeWithIvrit(audioPath: string): Promise<string> {
  const { publicUrl, storagePath } = await uploadAudioToStorage(audioPath)
  console.log(`[ivrit] uploaded audio, size: ${fs.statSync(audioPath).size} bytes`)

  try {
    const runRes = await fetch(`https://api.runpod.ai/v2/${RUNPOD_IVRIT_ENDPOINT_ID}/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RUNPOD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          model: IVRIT_MODEL,
          streaming: false,
          transcribe_args: { url: publicUrl, language: 'he', transcription: 'plain_text' },
        },
      }),
    })
    if (!runRes.ok) {
      const body = await runRes.text()
      throw new Error(`RunPod submit failed ${runRes.status}: ${body}`)
    }
    const { id: jobId } = (await runRes.json()) as { id: string }
    console.log(`[ivrit] job submitted: ${jobId}`)

    // Poll every 5s, up to 30 minutes
    const maxWaitMs = 30 * 60 * 1000
    const start = Date.now()
    while (Date.now() - start < maxWaitMs) {
      await new Promise(r => setTimeout(r, 5000))
      const statusRes = await fetch(
        `https://api.runpod.ai/v2/${RUNPOD_IVRIT_ENDPOINT_ID}/status/${jobId}`,
        { headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` } }
      )
      if (!statusRes.ok) continue
      const status = (await statusRes.json()) as { status: string; output?: { result?: unknown }; error?: unknown }
      console.log(`[ivrit] status: ${status.status}`)

      if (status.status === 'COMPLETED') {
        console.log(`[ivrit] raw output: ${JSON.stringify(status.output).slice(0, 500)}`)
        // output may be wrapped in an array: [{result:[[...]]}] or just {result:[[...]]}
        const outputData = Array.isArray(status.output) ? (status.output as unknown[])[0] : status.output
        const result = (outputData as { result?: unknown } | undefined)?.result
        let text = ''
        if (typeof result === 'string') {
          text = result.trim()
        } else if (result && typeof result === 'object' && 'text' in result) {
          text = String(result.text).trim()
        } else if (Array.isArray(result)) {
          // result may be [[seg1,seg2,...]] (nested) or [seg1,seg2,...] — flatten first
          const segments = (result as unknown[]).flat()
          text = segments.map((s) => (s as { text?: string }).text ?? '').join(' ').trim()
        }
        if (!text) throw new Error('IVRIT returned empty transcript')
        console.log(`[ivrit] done — ${text.length} chars`)
        return text
      }
      if (status.status === 'FAILED') {
        throw new Error(`RunPod job failed: ${JSON.stringify(status.error)}`)
      }
    }
    throw new Error('IVRIT transcription timed out after 30 minutes')
  } finally {
    supabaseAdmin.storage.from('audio-temp').remove([storagePath]).catch(() => {})
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
  // Prefer IVRIT (Hebrew-specialized) when configured; fall back to Whisper on any error
  // so a transient RunPod issue degrades gracefully instead of failing the whole job.
  if (RUNPOD_API_KEY && RUNPOD_IVRIT_ENDPOINT_ID) {
    try {
      console.log(`[transcribe] using IVRIT/RunPod (model: ${IVRIT_MODEL})`)
      const text = await transcribeWithIvrit(audioPath)
      return { text, engine: 'ivrit', model: IVRIT_MODEL }
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

// Split raw text into chunks at sentence boundaries
function splitIntoChunks(text: string, maxChars = 3000): string[] {
  if (text.length <= maxChars) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) { chunks.push(remaining); break }
    const slice = remaining.slice(0, maxChars)
    const cutAt = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '))
    const end = cutAt > maxChars * 0.5 ? cutAt + 2 : maxChars
    chunks.push(remaining.slice(0, end).trim())
    remaining = remaining.slice(end).trim()
  }
  return chunks
}

// Split a speaker's long turn into readable ~300-char sentence groups
function splitIntoSentenceGroups(text: string, maxChars = 320): string[] {
  if (text.length <= maxChars) return [text]
  // Try sentence endings first
  const sentences = text.match(/[^.!?,]+[.!?,]+\s*/g)
  if (sentences) {
    const groups: string[] = []
    let current = ''
    for (const s of sentences) {
      if (current.length + s.length > maxChars && current.length > 0) {
        groups.push(current.trim())
        current = s
      } else {
        current += s
      }
    }
    if (current.trim()) groups.push(current.trim())
    if (groups.length > 0) return groups
  }
  // Fallback: split by word boundaries
  const words = text.split(' ')
  const groups: string[] = []
  let current = ''
  for (const w of words) {
    if (current.length + w.length + 1 > maxChars && current.length > 0) {
      groups.push(current.trim())
      current = w
    } else {
      current += (current ? ' ' : '') + w
    }
  }
  if (current.trim()) groups.push(current.trim())
  return groups.length > 0 ? groups : [text]
}

// Strip [Name] tags to compare lengths for coverage check
function stripSpeakerTags(text: string): string {
  return text.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim()
}

// Always-applied corrections — Whisper errors that recur across all Hebrew investor calls
const KNOWN_CORRECTIONS: Record<string, string> = {
  'ריבון': 'רבעון',
  'הגירה': 'אגירה',
  'מוכזבים': 'מאוכזבים',
  'שותק': 'שוטף',
  'תחיות': 'דחיות',
  'צועות': 'תשואות',
  'מחירת': 'מכירת',
  'תבלעות': 'טבלאות',
  'תמיל': 'תמהיל',
  'סבר הבקבוק': 'צוואר הבקבוק',
  'בני היסוד': 'אבני היסוד',
  'ולאס ואת נוט ליס': 'Last but not least',
  'איזום': 'ייזום',
  'מגוואט': 'מגה-וואט',
  "ג'יג אבאט": "ג'יגה-וואט",
  'דיבלופר': 'Developer',
  'דיבלופמנט': 'Development',
  'סטנדלון': 'Standalone',
  'PGM': 'PJM',
  'פיו': 'PV',
  'מציבושי': 'מיצובישי',
  'מורגן סנלי': 'מורגן סטנלי',
  'פרס צולאר': 'First Solar',
  'סייף ארבור': 'Safe Harbor',
  'למועדדו': 'למועד הדוח',
  'שותף אמאס': 'שותף המס',
  // Universal financial acronyms Whisper phonetically mangles
  'אי בי טי דה': 'EBITDA',
  'אי ביטדה': 'EBITDA',
  'אי.בי.טי.דה': 'EBITDA',
  'די סי אף': 'DCF',
  'איי פי או': 'IPO',
  'אם אנד אי': 'M&A',
  'אף אף או': 'FFO',
  'אן או איי': 'NOI',
  'קאפקס': 'CAPEX',
  'אופקס': 'OPEX',
  // Common Hebrew financial terms Whisper consistently misspells
  'פיינשל': 'פיננסי',
  'פינשל': 'פיננסי',
  'מולטיפל': 'מכפיל',
  'אינפלציה': 'אינפלציה',
  'דפלציה': 'דפלציה',
  'ריפיינסינג': 'מחזור חוב',
  'ווליום': 'היקף',
  'גיידנס': 'הנחיה',
  'קונסנסוס': 'קונצנזוס',
  'לוורג\'': 'מינוף',
  'מארג\'ין': 'שוליים',
  // Adjective/verb forms of common Whisper errors
  'ריבוני': 'רבעוני',
  'ריבונית': 'רבעונית',
  'ריבונים': 'רבעונים',
  // Systematic Whisper confusion: תוצאות → הוצאות in financial headings
  'הוצאות שנת': 'תוצאות שנת',
  'הוצאות השנה': 'תוצאות השנה',
  'הוצאות הרבעון': 'תוצאות הרבעון',
  // Assets vs. deductions
  'לנחסים': 'לנכסים',
  'נחסים פיננסיים': 'נכסים פיננסיים',
  'בנחסים': 'בנכסים',
  // Implementation
  'התמעת': 'הטמעת',
  'מהתמעת': 'מהטמעת',
  'תמעת': 'הטמעת',
  // Common business Hebrew
  'אנורגנית': 'אנאורגנית',
  'אורגנית': 'אורגנית',
}

const CORRECTION_PROMPT_EXAMPLES = `
KNOWN WHISPER ERROR PATTERNS in Hebrew investor calls — use these as examples to find similar errors:
Hebrew homophones/phonetic errors: ריבון→רבעון (quarter), הגירה→אגירה (storage), מוכזבים→מאוכזבים, שותק→שוטף, תחיות→דחיות, צועות→תשואות, מחירת→מכירת, תבלעות→טבלאות, תמיל→תמהיל, סבר הבקבוק→צוואר הבקבוק, בני היסוד→אבני היסוד, ולאס ואת נוט ליס→Last but not least, איזום→ייזום
English terms phonetically in Hebrew: מגוואט→מגה-וואט, ג'יג אבאט→ג'יגה-וואט, דיבלופר→Developer, דיבלופמנט→Development, סטנדלון→Standalone
Acronyms: PGM→PJM, פיו→PV, and Hebrew phonetic spellings of acronyms→the actual acronym
Company/person names: מציבושי→מיצובישי, מורגן סנלי→מורגן סטנלי, פרס צולאר→First Solar, סייף ארבור→Safe Harbor
Word boundary/recognition errors: למועדדו→למועד הדוח, שותף אמאס→שותף המס
`

// Filter out risky corrections that might change meaning rather than fix Whisper errors
function isSafeCorrection(wrong: string, correct: string): boolean {
  if (wrong.length > 35) return false
  const wrongWords = wrong.trim().split(/\s+/).length
  const correctWords = correct.trim().split(/\s+/).length
  // Word-boundary fix (1 word split into 2) is OK; multi-word additions are not
  const maxIncrease = wrongWords === 1 ? 1 : 0
  if (correctWords > wrongWords + maxIncrease) return false
  // Allow removing at most 1 word (phonetic merging)
  if (correctWords < wrongWords - 1) return false
  return true
}

// Build a map of Whisper transcription errors — safer than direct text output because
// GPT-4o can only change strings it explicitly names, preventing garbled output.
async function buildCorrectionMap(rawText: string, videoTitle: string): Promise<Record<string, string>> {
  // Extract glossary to protect proper nouns from hallucination
  const mid = Math.floor(rawText.length / 2)
  const sampleForGlossary = [
    rawText.slice(0, 800),
    rawText.slice(mid, mid + 800),
    rawText.slice(-800),
  ].join(' ')

  let glossary: string[] = []
  try {
    const glossaryRes = await withTimeout(
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: `List all company names, brand names, product names, acronyms, and English terms that appear verbatim in this Hebrew text. Do NOT invent or expand. Return JSON: {"terms": ["term1", "term2"]}
Text: ${sampleForGlossary}`,
        }],
        max_tokens: 300,
        response_format: { type: 'json_object' },
      }),
      30_000,
      'extractGlossary'
    )
    const g = JSON.parse(glossaryRes.choices[0].message.content ?? '{}')
    glossary = Array.isArray(g.terms) ? g.terms.filter((x: unknown) => typeof x === 'string') : []
  } catch { /* glossary is best-effort */ }

  const preserveNote = glossary.length > 0
    ? `\nDo NOT correct these terms — they appear correctly in the text: ${glossary.slice(0, 25).join(', ')}`
    : ''

  const makePrompt = (chunk: string) => `Hebrew investor call transcript transcribed by Whisper (speech-to-text AI).
Video: "${videoTitle}"
${CORRECTION_PROMPT_EXAMPLES}

Find Whisper PHONETIC transcription errors — where Whisper misheard a sound and wrote the wrong word.
Return ONLY corrections you are CERTAIN about.

CRITICAL RULES:
- Return JSON: {"corrections": [{"wrong": "exact wrong text", "correct": "correct text"}]}
- ONLY fix phonetic errors (wrong Hebrew letter, misheard syllable, garbled sound)
- Do NOT change English terms, brand names, or product names${preserveNote}
- Do NOT change a word just because a different word sounds better in context
- If you are not 100% certain it is a Whisper error, DO NOT include it
- Do NOT change acronyms unless you can see the garbled phonetic version clearly

Text:
${chunk}`

  const map: Record<string, string> = { ...KNOWN_CORRECTIONS }

  const third = Math.ceil(rawText.length / 3)
  const parts = [
    rawText.slice(0, third),
    rawText.slice(third, third * 2),
    rawText.slice(third * 2),
  ]

  const responses = await Promise.all(
    parts.map((part, i) =>
      withTimeout(
        openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: makePrompt(part) }],
          response_format: { type: 'json_object' },
          max_tokens: 2000,
        }),
        90 * 1000,
        `buildCorrectionMap part ${i + 1}`
      )
    )
  )

  for (const response of responses) {
    const result = JSON.parse(response.choices[0].message.content ?? '{}')
    for (const c of (result.corrections ?? [])) {
      if (!c.wrong || !c.correct || c.wrong === c.correct) continue
      if (!isSafeCorrection(c.wrong, c.correct)) continue
      if (map[c.correct] === c.wrong) continue
      if (Object.keys(map).some(k => k !== c.wrong && c.correct.includes(k))) continue
      map[c.wrong] = c.correct
    }
  }

  console.log(`[corrections] ${Object.keys(map).length} corrections (${Object.keys(KNOWN_CORRECTIONS).length} known + GPT-4o extras, glossary: ${glossary.length} terms protected)`)
  return map
}

// Apply correction map to text — longer phrases first to avoid partial replacements
function applyCorrections(text: string, corrections: Record<string, string>): string {
  const sorted = Object.entries(corrections).sort((a, b) => b[0].length - a[0].length)
  let result = text
  for (const [wrong, correct] of sorted) {
    const subIdx = correct.indexOf(wrong)
    if (subIdx > 0 && subIdx + wrong.length === correct.length) {
      // "correct" ends with "wrong" as a substring (e.g. "בני היסוד" inside "אבני היסוד").
      // Use a lookbehind for the specific prefix char that correct adds, so we don't
      // re-match inside already-corrected text.
      const prefixChar = correct.slice(0, 1)
      const escaped = wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedPrefix = prefixChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      result = result.replace(new RegExp('(?<!' + escapedPrefix + ')' + escaped, 'g'), correct)
    } else {
      result = result.split(wrong).join(correct)
    }
  }
  return result
}

// Step 1: extract metadata from the opening of the transcript
async function extractMeta(
  opening: string,
  videoTitle: string,
  today: string,
): Promise<{ company: string; business: string; ticker: string; quarter: string; date: string; speakers: Array<{ name: string; role: string; title: string }> }> {
  const response = await withTimeout(
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: `You are extracting metadata for a Hebrew investor earnings call.

PRIMARY SOURCE — the video title. For Israeli investor calls the company name and the quarter almost always appear in the title. Extract "company" and "quarter" from the title FIRST, then use the transcript opening only to confirm or fill gaps.

Rules for "company":
- Return ONLY the clean company name (in Hebrew, as commonly known).
- REMOVE boilerplate: "שיחת משקיעים", "שיחת ועידה", "תוצאות", "סיכום", "מצגת", quarter/year text ("רבעון 3", "Q3 2025", "2025"), dates, and channel names.
- Drop a trailing "בע״מ"/"בעמ" unless it is part of the well-known name.
- Example: title "כלל תעשיות בע""מ - שיחת משקיעים סיכום רבעון 3 2025" → company "כלל תעשיות".
- If the title has no company, infer it from the transcript opening. Never invent one.

Rules for "quarter":
- Normalize to EXACTLY "Q{n} {YYYY}" (e.g. "Q1 2026"). Map "רבעון 1 2026" → "Q1 2026". If only a year is found, use the most likely quarter from context; if truly unknown, return "".

Return JSON only:
{
  "company": "clean company name in Hebrew",
  "business": "תחום הפעילות של החברה בעברית בקצרה (למשל: נדל\"ן מניב, בנקאות, אנרגיה). אם לא ברור, החזר מחרוזת ריקה.",
  "ticker": "stock ticker or empty string",
  "quarter": "Q{n} {YYYY} or empty string",
  "date": "YYYY-MM-DD",
  "speakers": [
    { "name": "full name", "role": "ceo|cfo|analyst|moderator", "title": "Hebrew job title" }
  ]
}
Use date ${today} if not found.

Video title: "${videoTitle}"

Transcript opening:
${opening}`,
      }],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    }),
    60 * 1000,
    'extractMeta'
  )
  return JSON.parse(response.choices[0].message.content ?? '{}')
}

// Step 2: add [Speaker Name] tags + fix typos — plain text output, no JSON
async function tagChunk(
  chunkText: string,
  speakers: Array<{ name: string; role: string }>,
): Promise<string> {
  const speakerList = speakers.map(s => `${s.name} (${s.role})`).join(', ')

  const response = await withTimeout(
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a transcript editor for Hebrew investor calls. You follow instructions exactly.',
        },
        {
          role: 'user',
          content: `You will receive a chunk of a Hebrew investor call transcript. Spelling has already been corrected.

Known speakers: ${speakerList}

Your task — do EXACTLY these two things and nothing else:
1. Insert [Speaker Name] at the start of each speaker's turn, where Speaker Name is:
   - The exact name from the Known Speakers list if you can identify the speaker
   - [מנחה] if they are the moderator or host asking questions
   - [אנליסט] if they appear to be an external analyst from an investment firm
   Do NOT write the literal text "[Speaker Full Name]".
2. Insert the special marker [Q&A_START] on its own line exactly once — at the moment the call transitions from the management presentation to the Q&A section. If this chunk does not contain the transition, do not add this marker.

STRICT RULES:
- Keep EVERY word exactly as written. Do NOT change, fix, or remove any word for any reason.
- Do NOT rephrase, correct spelling, or add words.
- Return plain text only — no JSON, no markdown, no explanations.

Transcript chunk:
${chunkText}`,
        },
      ],
      max_tokens: 4000,
    }),
    60 * 1000,
    'tagChunk'
  )

  return response.choices[0].message.content ?? chunkText
}

// Step 3: parse tagged plain text into structured lines
function parseTaggedText(
  text: string,
  speakers: Speaker[],
): Array<{ speakerId: string; text: string; section: 'mgmt' | 'qa' }> {
  const results: Array<{ speakerId: string; text: string; section: 'mgmt' | 'qa' }> = []
  let qaStarted = false

  // Check if GPT-4o placed a [Q&A_START] marker anywhere
  if (text.includes('[Q&A_START]')) {
    // Split at the marker — everything after is Q&A
    text = text // marker will be stripped in the split below
  }

  // Split on [Name] and [Q&A_START] markers
  const parts = text.split(/\[([^\]]+)\]/)
  // parts = [ignored-prefix, tag1, content1, tag2, content2, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const tag = (parts[i] ?? '').trim()
    const content = (parts[i + 1] ?? '').trim()

    // Q&A_START is a control marker, not a speaker
    if (tag === 'Q&A_START') {
      qaStarted = true
      continue
    }

    const rawName = tag
    if (!content) continue

    // Match speaker — exact name, then first-name match, then create new
    let speaker = speakers.find(s => s.name === rawName)
    if (!speaker) speaker = speakers.find(s => rawName.startsWith(s.name.split(' ')[0]))
    if (!speaker) {
      speaker = { id: `sp${speakers.length + 1}`, name: rawName, role: 'unknown', title: rawName, affiliation: '' }
      speakers.push(speaker)
    }

    results.push({ speakerId: speaker.id, text: content, section: qaStarted ? 'qa' : 'mgmt' })
  }

  return results
}

export async function formatWithGPT4o(
  rawText: string,
  videoId: string,
  videoTitle: string,
  opts: { engine?: string; model?: string } = {},
): Promise<Transcript> {
  const now = new Date().toISOString()
  const today = now.split('T')[0]

  // Step 1: metadata FIRST — the raw opening already carries the correct company name.
  console.log('[format] extracting metadata...')
  const meta = await extractMeta(rawText.slice(0, 2500), videoTitle, today)

  // Step 0: correction — runs on the full raw text, before speaker tagging.
  // V1 ships with NO entity list (sense-only). Flags + applied corrections are kept for UI + diagnostics.
  let flags: { text: string; reason: string }[] = []
  let corrections: CorrectionDiag[] = []
  try {
    const profile: Profile = {
      company: meta.company ?? '',
      business: meta.business ?? '',
      quarter: meta.quarter ?? '',
      speakers: (meta.speakers ?? []).map(s => `${s.name} (${s.role})`).join(', '),
    }
    const gptChunk = (prompt: string) =>
      withTimeout(
        openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          max_tokens: 2000,
          temperature: 0,
        }),
        90 * 1000,
        'correction chunk',
      ).then(r => r.choices[0].message.content ?? '{}')

    const result = await correctTranscript(rawText, profile, [], gptChunk)
    rawText = result.text
    flags = result.flags
    corrections = result.applied.map(a => ({
      original: a.original, corrected: a.corrected, kind: a.kind, certainty: a.certainty, reason: a.reason,
    }))
    console.log(`[format] correction: ${corrections.length} applied, ${flags.length} flagged`)
  } catch (err) {
    console.warn('[format] correction pass skipped:', (err as Error).message)
  }

  const speakers: Speaker[] = (meta.speakers ?? []).map((s, i) => ({
    id: `sp${i + 1}`,
    name: s.name,
    role: s.role,
    title: s.title ?? s.name,
    affiliation: '',
  }))

  // Step 2: tag speakers (rawText already corrected in step 0)
  const chunks = splitIntoChunks(rawText, 3000)
  console.log(`[format] ${chunks.length} chunks | ${rawText.length} chars total`)

  const processedParts = await runWithConcurrency(chunks, 4, async (chunk, i) => {
    console.log(`[format] chunk ${i + 1}/${chunks.length}`)
    const tagged = await tagChunk(chunk, meta.speakers ?? [])

    // Coverage check: stripped output should be ≥ 85% of input
    const coverage = stripSpeakerTags(tagged).length / chunk.length
    console.log(`[format]   chunk ${i + 1} coverage: ${Math.round(coverage * 100)}%`)

    if (coverage < 0.85) {
      console.warn(`[format]   LOW COVERAGE — falling back to raw text for chunk ${i + 1}`)
      return chunk
    }
    return tagged
  })

  // Step 4: parse tagged text into speaker segments
  const fullTagged = processedParts.join(' ')
  const segments = parseTaggedText(fullTagged, speakers)

  // Fallback: if no tags found at all, show raw text under first speaker
  if (segments.length === 0) {
    console.warn('[format] no speaker tags found — using raw text fallback')
    const groups = splitIntoSentenceGroups(rawText)
    const fallbackLines: Line[] = groups.map((t, i) => ({
      id: `L${String(i + 1).padStart(4, '0')}`,
      speakerId: speakers[0]?.id ?? 'sp1',
      timestamp: '00:00:00',
      text: t,
    }))
    attachFlags(fallbackLines, flags)
    return buildTranscript(videoId, meta, today, now, speakers, fallbackLines, [], { ...opts, corrections })
  }

  // Merge consecutive segments from the same speaker + section
  const mergedSegments: typeof segments = []
  for (const seg of segments) {
    const prev = mergedSegments[mergedSegments.length - 1]
    if (prev && prev.speakerId === seg.speakerId && prev.section === seg.section) {
      prev.text = prev.text + ' ' + seg.text
    } else {
      mergedSegments.push({ ...seg })
    }
  }

  // Step 4: split long turns into sentence groups and build final lines
  const mgmtLines: Line[] = []
  const qaLines: Line[] = []
  let lineCounter = 0

  for (const seg of mergedSegments) {
    const groups = splitIntoSentenceGroups(seg.text, 600)
    for (const groupText of groups) {
      lineCounter++
      const line: Line = {
        id: `L${String(lineCounter).padStart(4, '0')}`,
        speakerId: seg.speakerId,
        timestamp: '00:00:00',
        text: groupText,
      }
      if (seg.section === 'qa') qaLines.push(line)
      else mgmtLines.push(line)
    }
  }

  // Fallback Q&A detection: if GPT-4o never placed [Q&A_START],
  // scan lines for known transition phrases and split there
  if (qaLines.length === 0) {
    const QA_PATTERNS = ['ונעבור כרגע לשאלות', 'נעבור לשאלות', 'נפתח לשאלות', 'נשמח לקבל שאלות']
    const splitIdx = mgmtLines.findIndex(l => QA_PATTERNS.some(p => l.text.includes(p)))
    if (splitIdx !== -1) {
      console.log(`[format] Q&A fallback detection — splitting at line ${splitIdx + 1}`)
      qaLines.push(...mgmtLines.splice(splitIdx))
      // Re-number lines for consistency
      ;[...mgmtLines, ...qaLines].forEach((l, i) => { l.id = `L${String(i + 1).padStart(4, '0')}` })
    }
  }

  const totalOutputChars = [...mgmtLines, ...qaLines].reduce((s, l) => s + l.text.length, 0)
  console.log(`[format] done — ${lineCounter} lines (mgmt: ${mgmtLines.length}, qa: ${qaLines.length}) | coverage: ${Math.round(totalOutputChars / rawText.length * 100)}%`)

  attachFlags(mgmtLines, flags)
  attachFlags(qaLines, flags)
  return buildTranscript(videoId, meta, today, now, speakers, mgmtLines, qaLines, { ...opts, corrections })
}

function buildTranscript(
  videoId: string,
  meta: { company: string; ticker: string; quarter: string; date: string },
  today: string,
  now: string,
  speakers: Speaker[],
  mgmtLines: Line[],
  qaLines: Line[],
  opts: { engine?: string; model?: string; corrections?: CorrectionDiag[] } = {},
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
