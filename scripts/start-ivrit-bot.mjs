// Create a Recall bot that streams AUDIO ONLY (audio_mixed_raw) to the ivrit engine's
// websocket — no Recall transcript provider at all (our pipeline produces the text).
//   node scripts/start-ivrit-bot.mjs "<zoom_url>" "<https tunnel base>"
// Exits after creation (no zombie — unlike live-broadcast.mjs start).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const raw of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const eq = line.indexOf('=')
  if (eq === -1) continue
  let val = line.slice(eq + 1).trim()
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
  env[line.slice(0, eq).trim()] = val
}

const [meetingUrl, tunnelBase] = process.argv.slice(2)
if (!meetingUrl || !tunnelBase) {
  console.error('Usage: node scripts/start-ivrit-bot.mjs "<zoom_url>" "<https tunnel base>"')
  process.exit(1)
}
const wsBase = tunnelBase.replace(/\/$/, '').replace(/^https:/, 'wss:')
const REGION = env.RECALL_REGION || 'us-west-2'

const res = await fetch(`https://${REGION}.recall.ai/api/v1/bot`, {
  method: 'POST',
  headers: { Authorization: `Token ${env.RECALL_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    meeting_url: meetingUrl,
    bot_name: 'Atlas Live',
    recording_config: {
      audio_mixed_raw: {},
      realtime_endpoints: [{ type: 'websocket', url: `${wsBase}/ws`, events: ['audio_mixed_raw.data'] }],
    },
  }),
})
const body = await res.json()
if (!res.ok) {
  console.error(`❌ Recall ${res.status}: ${JSON.stringify(body, null, 2)}`)
  process.exit(1)
}
console.log(`✅ Audio-only bot created: ${body.id}\n   audio -> ${wsBase}/ws\nAdmit "Atlas Live" from the Zoom waiting room.`)
