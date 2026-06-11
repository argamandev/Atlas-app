// recall-spike.mjs — throwaway quality spike for Recall.ai live transcription (Phase 1).
//
// Purpose: send a Recall bot into a Zoom call, let it transcribe Hebrew
// (recallai_streaming, prioritize_accuracy, language_code "he" — the exact config the
// future live feature would use), then pull the finished transcript and judge quality.
//
// No webhook / no Railway needed: we poll Recall's API directly with the API key.
//
// Usage (Node 18+, native fetch):
//   node scripts/recall-spike.mjs start "<zoom_join_url>"   -> creates the bot, saves its id
//   node scripts/recall-spike.mjs status                    -> prints current bot status
//   node scripts/recall-spike.mjs fetch                     -> waits for + downloads the transcript
//
// Reads RECALL_API_KEY (and optional RECALL_REGION, default us-west-2) from .env.local.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// --- config -----------------------------------------------------------------
const LANGUAGE_CODE = 'auto' // language detection + code-switching (Hebrew + English financial terms).
const MODE = 'prioritize_accuracy' // the only mode that supports Hebrew (low_latency is English-only)
const BOT_NAME = 'Timlul'
const STATE_FILE = join(__dirname, '.recall-spike-bot.json')
const OUT_DIR = join(__dirname, 'fixtures')
const FETCH_TIMEOUT_MS = 20 * 60 * 1000 // wait up to 20 min for the (3-10 min delayed) transcript
const POLL_EVERY_MS = 15 * 1000

// --- tiny .env.local reader (no dotenv dependency) --------------------------
function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) throw new Error(`.env.local not found at ${envPath}`)
  const out = {}
  for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

const env = loadEnv()
const API_KEY = env.RECALL_API_KEY
const REGION = env.RECALL_REGION || 'us-west-2'
const BASE = `https://${REGION}.recall.ai/api/v1`
if (!API_KEY) throw new Error('RECALL_API_KEY missing from .env.local')

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!res.ok) {
    throw new Error(`Recall ${init.method || 'GET'} ${path} -> ${res.status}\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`)
  }
  return body
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- commands ---------------------------------------------------------------
async function start(meetingUrl) {
  if (!meetingUrl) throw new Error('Usage: node scripts/recall-spike.mjs start "<zoom_url>"')
  console.log(`Sending bot to: ${meetingUrl}`)
  console.log(`Transcript: recallai_streaming · ${MODE} · language=${LANGUAGE_CODE}`)
  const bot = await api('/bot', {
    method: 'POST',
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: BOT_NAME,
      recording_config: {
        transcript: {
          provider: { recallai_streaming: { mode: MODE, language_code: LANGUAGE_CODE } },
        },
      },
    }),
  })
  writeFileSync(STATE_FILE, JSON.stringify({ botId: bot.id, meetingUrl, createdAt: new Date().toISOString() }, null, 2))
  console.log(`\n✅ Bot created. id = ${bot.id}`)
  console.log(`   Status: ${bot.status_changes?.at(-1)?.code ?? 'created'}`)
  console.log(`\nNext: run the call with real Hebrew, end it, then:`)
  console.log(`   node scripts/recall-spike.mjs fetch`)
}

function savedBotId(argId) {
  if (argId) return argId
  if (!existsSync(STATE_FILE)) throw new Error('No saved bot. Pass a bot id or run "start" first.')
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')).botId
}

async function status(argId) {
  const botId = savedBotId(argId)
  const bot = await api(`/bot/${botId}`)
  const last = bot.status_changes?.at(-1)
  console.log(`Bot ${botId}`)
  console.log(`  status: ${last?.code ?? 'unknown'}${last?.sub_code ? ` (${last.sub_code})` : ''} @ ${last?.created_at ?? ''}`)
  const url = transcriptUrl(bot)
  console.log(`  transcript ready: ${url ? 'yes' : 'not yet'}`)
  return bot
}

// Find the transcript download_url across recordings (per quickstart schema).
function transcriptUrl(bot) {
  for (const rec of bot.recordings || []) {
    const u = rec?.media_shortcuts?.transcript?.data?.download_url
    if (u) return u
  }
  return null
}

async function fetchTranscript(argId) {
  const botId = savedBotId(argId)
  console.log(`Waiting for transcript of bot ${botId} (accuracy mode is delayed 3-10 min)...`)
  const deadline = Date.now() + FETCH_TIMEOUT_MS
  let url = null
  while (Date.now() < deadline) {
    const bot = await api(`/bot/${botId}`)
    const last = bot.status_changes?.at(-1)?.code
    url = transcriptUrl(bot)
    process.stdout.write(`  [${new Date().toLocaleTimeString()}] status=${last} transcript=${url ? 'READY' : '...'}\n`)
    if (url) break
    await sleep(POLL_EVERY_MS)
  }
  if (!url) throw new Error('Timed out waiting for transcript. Try "status" later, or "fetch" again.')

  console.log(`\nDownloading transcript JSON...`)
  const json = await (await fetch(url)).json()

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  const jsonPath = join(OUT_DIR, 'recall-spike.transcript.json')
  const txtPath = join(OUT_DIR, 'recall-spike.he.txt')
  writeFileSync(jsonPath, JSON.stringify(json, null, 2))
  writeFileSync(txtPath, toReadable(json))
  console.log(`\n✅ Saved:\n   ${jsonPath}\n   ${txtPath}`)
  console.log(`\n----- transcript preview -----\n`)
  console.log(toReadable(json).slice(0, 4000))
}

// Recall JSON transcript: array of { participant:{name}, words:[{text,start_timestamp:{relative}}] }
function toReadable(json) {
  const groups = Array.isArray(json) ? json : json?.transcript || []
  const lines = []
  for (const g of groups) {
    const name = g?.participant?.name ?? 'Speaker'
    const words = (g?.words || []).map((w) => w.text).join(' ').trim()
    if (!words) continue
    const t = g?.words?.[0]?.start_timestamp?.relative
    const stamp = typeof t === 'number' ? `[${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}] ` : ''
    lines.push(`${stamp}${name}: ${words}`)
  }
  return lines.join('\n') || JSON.stringify(json, null, 2)
}

// --- dispatch ---------------------------------------------------------------
const [cmd, arg] = process.argv.slice(2)
const run = { start, status, fetch: fetchTranscript }[cmd]
if (!run) {
  console.log('Commands:\n  start "<zoom_url>"\n  status\n  fetch')
  process.exit(1)
}
run(cmd === 'start' ? arg : arg).catch((e) => { console.error('\n❌', e.message); process.exit(1) })
