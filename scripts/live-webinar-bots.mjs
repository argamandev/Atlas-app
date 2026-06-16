// live-webinar-bots.mjs — fire TWO Recall bots into a registration-required Zoom webinar (test).
//
// Recall can't fill a Zoom registration form (Zoom blocks bots), so a human must register each
// attendee first; Zoom then hands back a JOIN URL containing a `tk=` token. We pass that tk-URL
// straight to Recall. (Docs: registration-required webinars require the meeting_url to carry `tk`.)
//
//   • Atlas bot  -> FULL live config: streams transcript + raw audio to the live engine via the
//                   tunnel (so it shows on our platform, same as live-broadcast.mjs).
//   • Sagi bot   -> RECORD-ONLY: Recall records audio + transcript server-side; we fetch post-call.
//
// Usage:
//   node scripts/live-webinar-bots.mjs create "<ATLAS_tk_join_url>" "<SAGI_tk_join_url>" "<https_tunnel_base>"
//   node scripts/live-webinar-bots.mjs status        -> poll both bots' join status (did they get in?)
//
// Reads RECALL_API_KEY (+ optional RECALL_REGION) from .env.local. Saves ids to .live-webinar-bots.json.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATE_FILE = join(__dirname, '.live-webinar-bots.json')
const DEFAULT_TUNNEL = 'https://penalty-arkansas-excitement-costs.trycloudflare.com'

function loadEnv() {
  const out = {}
  for (const raw of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
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
const REGION = env.RECALL_REGION || 'us-west-2'
const BASE = `https://${REGION}.recall.ai/api/v1`
if (!env.RECALL_API_KEY) throw new Error('RECALL_API_KEY missing from .env.local')

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Token ${env.RECALL_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers || {}) },
  })
  const text = await res.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { ok: res.ok, status: res.status, body }
}

function liveConfig(tunnelBase) {
  const base = tunnelBase.replace(/\/$/, '')
  const wsBase = base.replace(/^https:/, 'wss:')
  return {
    transcript: { provider: { recallai_streaming: { mode: 'prioritize_accuracy', language_code: 'auto' } } },
    audio_mixed_raw: {},
    realtime_endpoints: [
      { type: 'webhook', url: `${base}/recall`, events: ['transcript.data'] },
      { type: 'websocket', url: `${wsBase}/ws`, events: ['audio_mixed_raw.data'] },
    ],
  }
}
// record-only: transcript stored server-side, no realtime stream to our engine
const recordConfig = { transcript: { provider: { recallai_streaming: { mode: 'prioritize_accuracy', language_code: 'auto' } } } }

async function createBot({ label, botName, meetingUrl, userEmail, recording_config }) {
  if (!meetingUrl || !/[?&]tk=/.test(meetingUrl)) {
    console.log(`⚠️  ${label}: URL is missing a "tk=" token — that means it's the REGISTRATION link, not the post-registration JOIN link. Register first, then copy the join link.`)
  }
  const { ok, status, body } = await api('/bot', {
    method: 'POST',
    body: JSON.stringify({ meeting_url: meetingUrl, bot_name: botName, zoom: { user_email: userEmail }, recording_config }),
  })
  if (!ok) {
    console.log(`❌ ${label} (${botName}): Recall ${status}\n   ${typeof body === 'string' ? body : JSON.stringify(body)}`)
    return null
  }
  console.log(`✅ ${label} (${botName}) created: ${body.id}  status=${body.status_changes?.at(-1)?.code ?? 'created'}`)
  return body.id
}

async function create(atlasUrl, sagiUrl, tunnel) {
  const tunnelBase = tunnel || DEFAULT_TUNNEL
  console.log(`Tunnel: ${tunnelBase}\nRegion: ${REGION}\n`)
  const atlasId = await createBot({ label: 'ATLAS  (live→platform)', botName: 'Atlas', meetingUrl: atlasUrl, userEmail: 'timlulproduct@gmail.com', recording_config: liveConfig(tunnelBase) })
  const sagiId = await createBot({ label: 'SAGI   (record-only)', botName: 'Sagi Argaman', meetingUrl: sagiUrl, userEmail: 'sagi.arg@gmail.com', recording_config: recordConfig })
  writeFileSync(STATE_FILE, JSON.stringify({ atlasId, sagiId, createdAt: new Date().toISOString() }, null, 2))
  console.log(`\nSaved ids -> ${STATE_FILE}\nWatch them with:  node scripts/live-webinar-bots.mjs status`)
}

async function status() {
  if (!existsSync(STATE_FILE)) throw new Error('No saved bots. Run "create" first.')
  const { atlasId, sagiId } = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  for (const [label, id] of [['ATLAS', atlasId], ['SAGI', sagiId]]) {
    if (!id) { console.log(`${label}: (not created)`); continue }
    const { ok, body } = await api(`/bot/${id}`)
    if (!ok) { console.log(`${label} ${id}: fetch failed`); continue }
    const last = body.status_changes?.at(-1)
    console.log(`${label} ${id}: ${last?.code ?? '?'}${last?.sub_code ? ` (${last.sub_code})` : ''} @ ${last?.created_at ?? ''}`)
  }
}

// non-destructive state merge so single-bot creates don't clobber the other bot's id
function mergeState(patch) {
  const prev = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {}
  writeFileSync(STATE_FILE, JSON.stringify({ ...prev, ...patch, updatedAt: new Date().toISOString() }, null, 2))
}
async function oneAtlas(url, tunnel) {
  const id = await createBot({ label: 'ATLAS  (live→platform)', botName: 'Atlas', meetingUrl: url, userEmail: 'timlulproduct@gmail.com', recording_config: liveConfig(tunnel || DEFAULT_TUNNEL) })
  if (id) mergeState({ atlasId: id })
}
async function oneSagi(url) {
  const id = await createBot({ label: 'SAGI   (record-only)', botName: 'Sagi Argaman', meetingUrl: url, userEmail: 'sagi.arg@gmail.com', recording_config: recordConfig })
  if (id) mergeState({ sagiId: id })
}

const [cmd, a1, a2, a3] = process.argv.slice(2)
if (cmd === 'create') create(a1, a2, a3).catch((e) => { console.error('❌', e.message); process.exit(1) })
else if (cmd === 'atlas') oneAtlas(a1, a2).catch((e) => { console.error('❌', e.message); process.exit(1) })
else if (cmd === 'sagi') oneSagi(a1).catch((e) => { console.error('❌', e.message); process.exit(1) })
else if (cmd === 'status') status().catch((e) => { console.error('❌', e.message); process.exit(1) })
else console.log('Commands:\n  create "<ATLAS_tk_url>" "<SAGI_tk_url>" ["<tunnel>"]\n  atlas "<ATLAS_tk_url>" ["<tunnel>"]\n  sagi "<SAGI_tk_url>"\n  status')
