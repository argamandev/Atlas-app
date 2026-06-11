// live-bakeoff.mjs — live Hebrew transcription quality bake-off (Core 1 spike).
//
// Sends up to 3 Recall bots into the SAME Zoom call, each with a different engine:
//   A. recall_acc  — recallai_streaming / prioritize_accuracy (proven quality, delayed events)
//   B. gladia      — gladia_v2_streaming (Solaria; true real-time Hebrew)   [needs GLADIA_API_KEY]
//   C. elevenlabs  — elevenlabs_streaming (Scribe v2 realtime)              [needs ELEVENLABS_API_KEY]
// Then a 4th contender offline: IVRIT in simulated 45s live chunks over the call recording.
//
// No webhooks/ngrok: we POLL each bot's transcript during the call and log when each
// word first appears -> measures the real caption delay (lag) per engine.
//
// Usage (Node 18+):
//   node scripts/live-bakeoff.mjs start "<zoom_join_url>"  -> create bots, save state
//   node scripts/live-bakeoff.mjs watch                    -> poll during call, log word arrivals + lag
//   node scripts/live-bakeoff.mjs status                   -> one-shot bot status
//   node scripts/live-bakeoff.mjs fetch                    -> final transcripts + call recording audio
//   node scripts/live-bakeoff.mjs simulate-ivrit           -> IVRIT 45s-chunk simulation on the recording
//   node scripts/live-bakeoff.mjs compare                  -> side-by-side comparison.md + lag stats
//
// Reads from .env.local: RECALL_API_KEY (+RECALL_REGION), GLADIA_API_KEY?, ELEVENLABS_API_KEY?,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RUNPOD_API_KEY, RUNPOD_IVRIT_ENDPOINT_ID.

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATE_FILE = join(__dirname, '.live-bakeoff.json')
const OUT_DIR = join(__dirname, 'out')
const CHUNK_SECS = 45 // simulated live chunk size for IVRIT
const POLL_EVERY_MS = 10 * 1000

// --- env ---------------------------------------------------------------------
function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) throw new Error(`.env.local not found at ${envPath}`)
  const out = {}
  for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    out[line.slice(0, eq).trim()] = val
  }
  return out
}
const env = loadEnv()
env.SUPABASE_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const API_KEY = env.RECALL_API_KEY
const REGION = env.RECALL_REGION || 'us-west-2'
const BASE = `https://${REGION}.recall.ai/api/v1`
if (!API_KEY) throw new Error('RECALL_API_KEY missing from .env.local')

// --- provider configs (EDIT HERE if Recall rejects a field name) ---------------
// Each entry: { key, label, provider: <recording_config.transcript.provider object> }
function buildProviders() {
  const list = [
    {
      key: 'recall_acc',
      label: 'Timlul-A (Recall accuracy)',
      provider: { recallai_streaming: { mode: 'prioritize_accuracy', language_code: 'auto' } },
    },
  ]
  if (env.GLADIA_API_KEY) {
    list.push({
      key: 'gladia',
      label: 'Timlul-B (Gladia)',
      // credentials live in the Recall dashboard (https://<region>.recall.ai/dashboard/transcription)
      provider: {
        gladia_v2_streaming: {
          // Solaria live: Hebrew + English code-switching
          language_config: { languages: ['he', 'en'], code_switching: true },
        },
      },
    })
  } else console.log('(!) GLADIA_API_KEY not set — skipping Gladia bot')
  if (env.ELEVENLABS_API_KEY) {
    list.push({
      key: 'elevenlabs',
      label: 'Timlul-C (ElevenLabs)',
      provider: {
        elevenlabs_streaming: {
          model_id: 'scribe_v2_realtime',
          language_code: 'he',
        },
      },
    })
  } else console.log('(!) ELEVENLABS_API_KEY not set — skipping ElevenLabs bot')
  return list
}

// --- helpers -------------------------------------------------------------------
async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Token ${API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers || {}) },
  })
  const text = await res.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!res.ok) throw new Error(`Recall ${init.method || 'GET'} ${path} -> ${res.status}\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`)
  return body
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const loadState = () => JSON.parse(readFileSync(STATE_FILE, 'utf8'))
const nowIso = () => new Date().toISOString()
function ensureOut() { if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true }) }

function transcriptUrl(bot) {
  for (const rec of bot.recordings || []) {
    const u = rec?.media_shortcuts?.transcript?.data?.download_url
    if (u) return u
  }
  return null
}
function videoUrl(bot) {
  for (const rec of bot.recordings || []) {
    const u = rec?.media_shortcuts?.video_mixed?.data?.download_url
    if (u) return u
  }
  return null
}
function recordingStartMs(bot) {
  const ev = (bot.status_changes || []).find((s) => s.code === 'in_call_recording')
  return ev ? Date.parse(ev.created_at) : null
}
function flattenWords(transcriptJson) {
  const groups = Array.isArray(transcriptJson) ? transcriptJson : transcriptJson?.transcript || []
  const words = []
  for (const g of groups) for (const w of g?.words || []) words.push({ text: w.text, rel: w.start_timestamp?.relative })
  return words
}
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
  return lines.join('\n')
}

// --- commands --------------------------------------------------------------------
async function start(meetingUrl, webhookBase, onlyCsv) {
  if (!meetingUrl) throw new Error('Usage: node scripts/live-bakeoff.mjs start "<zoom_url>" [public_webhook_base_url] [only_keys_csv]')
  // realtime push: Recall POSTs transcript events to our listener (via tunnel) as they happen
  const realtimeEndpoints = webhookBase
    ? [{ type: 'webhook', url: `${webhookBase.replace(/\/$/, '')}/recall`, events: ['transcript.data', 'transcript.partial_data'] }]
    : undefined
  if (realtimeEndpoints) console.log(`Realtime events -> ${realtimeEndpoints[0].url}\n`)
  let providers = buildProviders()
  if (onlyCsv) {
    const keep = new Set(onlyCsv.split(','))
    providers = providers.filter((p) => keep.has(p.key))
  }
  // resume support: keep bots already created for this meeting, only add the missing ones
  let bots = []
  if (existsSync(STATE_FILE)) {
    const prev = loadState()
    if (prev.meetingUrl === meetingUrl && Array.isArray(prev.bots)) {
      bots = prev.bots
      const have = new Set(bots.map((b) => b.key))
      providers = providers.filter((p) => !have.has(p.key))
      if (bots.length) console.log(`Keeping ${bots.length} existing bot(s): ${[...have].join(', ')}`)
    }
  }
  console.log(`Sending ${providers.length} new bot(s) to: ${meetingUrl}\n`)
  for (const p of providers) {
    try {
      const bot = await api('/bot', {
        method: 'POST',
        body: JSON.stringify({
          meeting_url: meetingUrl,
          bot_name: p.label,
          recording_config: {
            transcript: { provider: p.provider },
            ...(realtimeEndpoints ? { realtime_endpoints: realtimeEndpoints } : {}),
          },
        }),
      })
      bots.push({ key: p.key, label: p.label, botId: bot.id })
      console.log(`✅ ${p.key}: bot ${bot.id}`)
    } catch (e) {
      console.error(`❌ ${p.key} failed to create — check provider config fields:\n${e.message}\n`)
    }
  }
  if (!bots.length) throw new Error('No bots created.')
  writeFileSync(STATE_FILE, JSON.stringify({ meetingUrl, createdAt: nowIso(), bots }, null, 2))
  console.log(`\nState saved. Now: admit the bots from the Zoom waiting room, then run:\n   node scripts/live-bakeoff.mjs watch`)
}

async function status() {
  const { bots } = loadState()
  for (const b of bots) {
    const bot = await api(`/bot/${b.botId}`)
    const last = bot.status_changes?.at(-1)
    console.log(`${b.key.padEnd(11)} ${last?.code ?? 'unknown'}${last?.sub_code ? ` (${last.sub_code})` : ''}  transcript=${transcriptUrl(bot) ? 'available' : 'not yet'}`)
  }
}

// Poll all bots during the call; log when new words first appear + their lag vs spoken time.
async function watch() {
  ensureOut()
  const { bots } = loadState()
  const seen = Object.fromEntries(bots.map((b) => [b.key, 0]))
  const ended = new Set()
  console.log(`Watching ${bots.length} bot(s) — every ${POLL_EVERY_MS / 1000}s. Ctrl+C to stop (state is saved).\n`)
  while (ended.size < bots.length) {
    for (const b of bots) {
      if (ended.has(b.key)) continue
      try {
        const bot = await api(`/bot/${b.botId}`)
        const code = bot.status_changes?.at(-1)?.code ?? '?'
        if (['done', 'fatal', 'call_ended'].includes(code)) ended.add(b.key)
        const url = transcriptUrl(bot)
        if (!url) { console.log(`  ${b.key.padEnd(11)} status=${code} transcript=...`); continue }
        const json = await (await fetch(url)).json()
        const words = flattenWords(json)
        if (words.length > seen[b.key]) {
          const recStart = recordingStartMs(bot)
          const fresh = words.slice(seen[b.key])
          const seenAt = Date.now()
          const lags = fresh
            .filter((w) => typeof w.rel === 'number' && recStart)
            .map((w) => (seenAt - recStart) / 1000 - w.rel)
          const lagNote = lags.length ? ` lag≈${Math.round(Math.min(...lags))}-${Math.round(Math.max(...lags))}s` : ''
          appendFileSync(join(OUT_DIR, `bakeoff-arrivals-${b.key}.jsonl`),
            fresh.map((w) => JSON.stringify({ seenAt: new Date(seenAt).toISOString(), rel: w.rel, text: w.text })).join('\n') + '\n')
          console.log(`  ${b.key.padEnd(11)} status=${code} words=${words.length} (+${fresh.length})${lagNote}`)
          seen[b.key] = words.length
        } else {
          console.log(`  ${b.key.padEnd(11)} status=${code} words=${words.length}`)
        }
      } catch (e) {
        console.log(`  ${b.key.padEnd(11)} poll error: ${e.message.split('\n')[0]}`)
      }
    }
    console.log('')
    await sleep(POLL_EVERY_MS)
  }
  console.log('All bots finished. Next: node scripts/live-bakeoff.mjs fetch')
}

async function fetchAll() {
  ensureOut()
  const { bots } = loadState()
  let savedRecording = false
  for (const b of bots) {
    // accuracy-mode transcript can take 3-10 min post-call — poll up to 20 min
    const deadline = Date.now() + 20 * 60 * 1000
    let url = null, bot = null
    while (Date.now() < deadline) {
      bot = await api(`/bot/${b.botId}`)
      url = transcriptUrl(bot)
      if (url) break
      console.log(`  ${b.key}: transcript not ready yet (status=${bot.status_changes?.at(-1)?.code}) — waiting 15s`)
      await sleep(15 * 1000)
    }
    if (!url) { console.error(`❌ ${b.key}: no transcript after 20 min`); continue }
    const json = await (await fetch(url)).json()
    writeFileSync(join(OUT_DIR, `bakeoff-${b.key}.transcript.json`), JSON.stringify(json, null, 2))
    writeFileSync(join(OUT_DIR, `bakeoff-${b.key}.txt`), toReadable(json))
    console.log(`✅ ${b.key}: transcript saved (${flattenWords(json).length} words)`)
    if (!savedRecording) {
      const vu = videoUrl(bot)
      if (vu) {
        const buf = Buffer.from(await (await fetch(vu)).arrayBuffer())
        const mp4 = join(OUT_DIR, 'bakeoff-recording.mp4')
        writeFileSync(mp4, buf)
        const mp3 = join(OUT_DIR, 'bakeoff-audio.mp3')
        const r = ffmpeg(['-y', '-i', mp4, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', mp3])
        if (r.status === 0) { console.log(`✅ recording audio extracted -> ${mp3}`); savedRecording = true }
        else console.error(`❌ ffmpeg extract failed:\n${r.stderr?.toString().slice(-800)}`)
      }
    }
  }
  console.log('\nNext: node scripts/live-bakeoff.mjs simulate-ivrit')
}

// --- IVRIT simulated-live ----------------------------------------------------------
const require2 = createRequire(import.meta.url)
function ffmpegPath() { return require2('@ffmpeg-installer/ffmpeg').path }
function ffmpeg(args) { return spawnSync(ffmpegPath(), args, { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }) }
function audioDurationSecs(file) {
  const r = spawnSync(ffmpegPath(), ['-i', file], { encoding: 'utf8' })
  const m = (r.stderr || '').match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/)
  if (!m) throw new Error(`Could not read duration of ${file}`)
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

async function supabaseUpload(filePath) {
  const name = `bakeoff_${Date.now()}_${basename(filePath)}`
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/audio-temp/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'audio/mpeg' },
    body: readFileSync(filePath),
  })
  if (!res.ok) throw new Error(`Supabase upload failed ${res.status}: ${await res.text()}`)
  return { publicUrl: `${env.SUPABASE_URL}/storage/v1/object/public/audio-temp/${name}`, name }
}
async function supabaseDelete(name) {
  await fetch(`${env.SUPABASE_URL}/storage/v1/object/audio-temp/${name}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  }).catch(() => {})
}
async function ivritTranscribe(publicUrl) {
  const model = env.RUNPOD_IVRIT_MODEL || 'ivrit-ai/whisper-large-v3-turbo-ct2'
  const run = await fetch(`https://api.runpod.ai/v2/${env.RUNPOD_IVRIT_ENDPOINT_ID}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RUNPOD_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { model, streaming: false, transcribe_args: { url: publicUrl, language: 'he', transcription: 'plain_text' } } }),
  })
  if (!run.ok) throw new Error(`RunPod submit ${run.status}: ${await run.text()}`)
  const { id } = await run.json()
  const deadline = Date.now() + 10 * 60 * 1000
  while (Date.now() < deadline) {
    await sleep(2000)
    const sr = await fetch(`https://api.runpod.ai/v2/${env.RUNPOD_IVRIT_ENDPOINT_ID}/status/${id}`, {
      headers: { Authorization: `Bearer ${env.RUNPOD_API_KEY}` },
    })
    if (!sr.ok) continue
    const st = await sr.json()
    if (st.status === 'COMPLETED') {
      const out = Array.isArray(st.output) ? st.output[0] : st.output
      const result = out?.result
      if (typeof result === 'string') return result.trim()
      if (result && typeof result === 'object' && 'text' in result) return String(result.text).trim()
      if (Array.isArray(result)) return result.flat().map((s) => s?.text ?? '').join(' ').trim()
      throw new Error(`Unexpected IVRIT output: ${JSON.stringify(st.output).slice(0, 300)}`)
    }
    if (st.status === 'FAILED') throw new Error(`RunPod failed: ${JSON.stringify(st.error)}`)
  }
  throw new Error('IVRIT chunk timed out')
}

async function simulateIvrit(audioArg) {
  if (!env.RUNPOD_API_KEY || !env.RUNPOD_IVRIT_ENDPOINT_ID) throw new Error('RUNPOD_API_KEY / RUNPOD_IVRIT_ENDPOINT_ID missing')
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')
  ensureOut()
  const audio = audioArg || join(OUT_DIR, 'bakeoff-audio.mp3')
  if (!existsSync(audio)) throw new Error(`Audio not found: ${audio} — run "fetch" first`)
  const total = audioDurationSecs(audio)
  const chunks = Math.ceil(total / CHUNK_SECS)
  console.log(`Simulating live IVRIT: ${Math.round(total)}s audio -> ${chunks} chunks of ${CHUNK_SECS}s\n`)
  const texts = [], stats = []
  for (let i = 0; i < chunks; i++) {
    const chunkFile = join(OUT_DIR, `bakeoff-chunk-${i}.mp3`)
    const r = ffmpeg(['-y', '-ss', String(i * CHUNK_SECS), '-t', String(CHUNK_SECS), '-i', audio, '-ac', '1', '-ar', '16000', '-b:a', '32k', chunkFile])
    if (r.status !== 0 || !existsSync(chunkFile) || statSync(chunkFile).size < 1000) { console.log(`  chunk ${i}: empty/failed — skipping`); continue }
    const t0 = Date.now()
    const { publicUrl, name } = await supabaseUpload(chunkFile)
    let text = ''
    try { text = await ivritTranscribe(publicUrl) } finally { await supabaseDelete(name) }
    const secs = (Date.now() - t0) / 1000
    stats.push(secs)
    texts.push(text)
    console.log(`  chunk ${i + 1}/${chunks}: ${Math.round(secs)}s processing — "${text.slice(0, 60)}..."`)
  }
  const avg = stats.reduce((a, b) => a + b, 0) / (stats.length || 1)
  const max = Math.max(...stats, 0)
  const summary = `IVRIT simulated-live: chunk=${CHUNK_SECS}s, avg processing=${avg.toFixed(1)}s, max=${max.toFixed(1)}s
=> implied caption delay (chunk + processing + safety): ~${Math.round(CHUNK_SECS + avg + 10)}s typical, ~${Math.round(CHUNK_SECS + max + 10)}s worst
`
  writeFileSync(join(OUT_DIR, 'bakeoff-ivrit-sim.txt'), texts.join('\n'))
  writeFileSync(join(OUT_DIR, 'bakeoff-ivrit-sim.stats.txt'), summary)
  console.log(`\n${summary}✅ saved out/bakeoff-ivrit-sim.txt`)
}

// --- comparison --------------------------------------------------------------------
function lagStats(key) {
  const f = join(OUT_DIR, `bakeoff-arrivals-${key}.jsonl`)
  if (!existsSync(f)) return null
  const lags = []
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const { seenAt, rel } = JSON.parse(line)
      if (typeof rel === 'number') lags.push({ seenAt: Date.parse(seenAt), rel })
    } catch { /* skip */ }
  }
  if (!lags.length) return null
  // lag values were computed vs recording start at watch-time; here report arrival spread only
  return { words: lags.length }
}

async function compare() {
  ensureOut()
  const { bots } = loadState()
  const sections = []
  for (const b of bots) {
    const f = join(OUT_DIR, `bakeoff-${b.key}.txt`)
    if (existsSync(f)) sections.push(`## ${b.key}\n\n\`\`\`\n${readFileSync(f, 'utf8')}\n\`\`\``)
  }
  const ivritF = join(OUT_DIR, 'bakeoff-ivrit-sim.txt')
  if (existsSync(ivritF)) {
    const stats = existsSync(join(OUT_DIR, 'bakeoff-ivrit-sim.stats.txt')) ? readFileSync(join(OUT_DIR, 'bakeoff-ivrit-sim.stats.txt'), 'utf8') : ''
    sections.push(`## ivrit (simulated live, ${CHUNK_SECS}s chunks)\n\n${stats}\n\`\`\`\n${readFileSync(ivritF, 'utf8')}\n\`\`\``)
  }
  const md = `# Live bake-off — ${nowIso()}\n\nReading script: scripts/fixtures/live-bakeoff-script.he.txt\nArrival logs (caption delay): scripts/out/bakeoff-arrivals-*.jsonl (lag printed live during watch)\n\n${sections.join('\n\n')}\n`
  writeFileSync(join(OUT_DIR, 'bakeoff-comparison.md'), md)
  console.log(`✅ scripts/out/bakeoff-comparison.md (${sections.length} engines)`)
}

// --- dispatch ------------------------------------------------------------------------
const [cmd, ...args] = process.argv.slice(2)
const run = { start, watch, status, fetch: fetchAll, 'simulate-ivrit': simulateIvrit, compare }[cmd]
if (!run) {
  console.log('Commands:\n  start "<zoom_url>" [public_webhook_base_url]\n  watch\n  status\n  fetch\n  simulate-ivrit [audio.mp3]\n  compare')
  process.exit(1)
}
run(...args).catch((e) => { console.error('\n❌', e.message); process.exit(1) })
