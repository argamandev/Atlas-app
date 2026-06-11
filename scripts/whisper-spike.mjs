#!/usr/bin/env node
// scripts/whisper-spike.mjs
//
// Downloads a YouTube video's audio and transcribes it with OpenAI Whisper.
// Used to compare Whisper raw output vs IVRIT raw output on the same audio.
//
// Usage:
//   node scripts/whisper-spike.mjs <youtube-url>
//
// Output:
//   scripts/fixtures/whisper-<videoId>.txt   (raw text)

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, statSync, createReadStream } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import OpenAI from 'openai'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'

const execFileAsync = promisify(execFile)
const FFMPEG_BIN = ffmpegInstaller.path
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// --- tiny .env loader ---
function loadEnv(file) {
  const p = join(ROOT, file)
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '')
  }
}
loadEnv('.env.local')
loadEnv('.env')

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
if (!OPENAI_API_KEY) { console.error('OPENAI_API_KEY not set'); process.exit(1) }

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const MAX_WHISPER_BYTES = 24 * 1024 * 1024 // 24 MB

function getYtDlpBin() {
  if (process.platform === 'win32') {
    const p = join(ROOT, 'bin', 'yt-dlp.exe')
    if (!existsSync(p)) throw new Error(`yt-dlp.exe not found at ${p}`)
    return p
  }
  const local = join(ROOT, 'bin', 'yt-dlp')
  return existsSync(local) ? local : 'yt-dlp'
}

function extractVideoId(url) {
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : url.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 20)
}

async function downloadAudio(url) {
  const bin = getYtDlpBin()
  const base = join(tmpdir(), `whisper_spike_${Date.now()}`)
  await execFileAsync(bin, [
    url,
    '--no-playlist', '--retries', '10', '--fragment-retries', '10',
    '--socket-timeout', '30', '--no-check-certificate', '--no-warnings',
    '--js-runtimes', 'node',
    '--ffmpeg-location', FFMPEG_BIN,
    '-f', 'bestaudio',
    '-x', '--audio-format', 'mp3', '--audio-quality', '32K',
    '--postprocessor-args', 'ffmpeg:-ac 1 -ar 16000',
    '--no-progress',
    '-o', `${base}.%(ext)s`,
  ], { maxBuffer: 50 * 1024 * 1024, timeout: 10 * 60 * 1000 })

  const files = readdirSync(tmpdir()).filter(f => f.startsWith(basename(base)))
  if (files.length === 0) throw new Error('Download produced no file')
  const actualPath = join(tmpdir(), files[0])
  const finalPath = `${base}.mp3`
  if (actualPath !== finalPath) {
    const { renameSync } = await import('node:fs')
    renameSync(actualPath, finalPath)
  }
  return finalPath
}

const WHISPER_PROMPT = 'שיחת משקיעים רבעונית. מונחים נפוצים: רבעון, תשואה, EBITDA, תזרים מזומנים, הכנסות, רווח גולמי, הוצאות תפעול, חוב פיננסי, הון עצמי, דיבידנד, מניה, בורסה, תל אביב, דוח כספי, מאזן, התחייבויות, נכסים, השקעות, פחת והפחתות, מגה-וואט, ג\'יגה-וואט, ייזום, מימון, אגרות חוב, ריבית, גידור, נגזרים, אנליסט, תחזית, הנחיה שנתית, צמיחה, שוליים, תפעולי, רווחיות, נזילות, מינוף, CAPEX, OPEX, DCF, IPO, M&A, FFO, NOI.'

async function whisperFile(filePath) {
  console.log(`  [whisper] transcribing ${basename(filePath)} (${(statSync(filePath).size / 1024 / 1024).toFixed(1)} MB)...`)
  const res = await openai.audio.transcriptions.create({
    file: createReadStream(filePath),
    model: 'whisper-1',
    language: 'he',
    prompt: WHISPER_PROMPT,
  })
  return res.text
}

async function whisperTranscribe(audioPath) {
  const { size } = statSync(audioPath)
  if (size <= MAX_WHISPER_BYTES) return whisperFile(audioPath)

  // Split into 20-min segments via ffprobe+ffmpeg
  console.log(`  [whisper] file too large (${(size / 1024 / 1024).toFixed(1)} MB), splitting...`)
  const ffmpegBin = FFMPEG_BIN

  // get duration
  const { stderr: probeOut } = await execFileAsync(ffmpegBin, [
    '-i', audioPath, '-v', 'quiet', '-print_format', 'json', '-show_format',
  ], { maxBuffer: 5 * 1024 * 1024 }).catch(e => ({ stderr: e.stderr ?? '' }))
  // ffprobe output goes to stderr
  const durationMatch = probeOut.match(/"duration":\s*"([\d.]+)"/)
  const duration = durationMatch ? parseFloat(durationMatch[1]) : 3600
  const segSecs = 20 * 60
  const count = Math.ceil(duration / segSecs)
  const segs = []

  for (let i = 0; i < count; i++) {
    const start = i * segSecs
    const seg = join(tmpdir(), `whisper_seg_${Date.now()}_${i}.mp3`)
    await execFileAsync(ffmpegBin, [
      '-i', audioPath, '-ss', String(start), '-t', String(segSecs),
      '-y', seg,
    ], { maxBuffer: 10 * 1024 * 1024 })
    segs.push(seg)
  }

  const parts = []
  for (const seg of segs) {
    parts.push(await whisperFile(seg))
    unlinkSync(seg)
  }
  return parts.join(' ')
}

// --- main ---
const url = process.argv[2]
if (!url) {
  console.error('Usage: node scripts/whisper-spike.mjs <youtube-url>')
  process.exit(1)
}

const videoId = extractVideoId(url)
const outPath = join(__dirname, 'fixtures', `whisper-${videoId}.txt`)

console.log(`[whisper-spike] video: ${url}`)
console.log(`[whisper-spike] output: ${outPath}`)
console.log(`[whisper-spike] downloading audio...`)
const audioPath = await downloadAudio(url)
console.log(`[whisper-spike] downloaded: ${audioPath} (${(statSync(audioPath).size / 1024 / 1024).toFixed(1)} MB)`)

console.log(`[whisper-spike] transcribing with whisper-1...`)
const text = await whisperTranscribe(audioPath)
unlinkSync(audioPath)

writeFileSync(outPath, text, 'utf8')
console.log(`\n[whisper-spike] done — ${text.length} chars, saved to ${outPath}\n`)
console.log('='.repeat(60))
console.log(text)
console.log('='.repeat(60))
