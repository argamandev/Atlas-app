// live-listen.mjs — real-time webhook listener for the live bake-off (Core 1 spike).
//
// Recall pushes transcript.data / transcript.partial_data events here (via a public
// tunnel, e.g. cloudflared). Each event is printed with its measured lag:
//   lag = wall-clock arrival time - the word's absolute spoken timestamp.
// This is the word-by-word LIVE proof + caption-delay measurement per engine.
//
// Usage: node scripts/live-listen.mjs   (listens on http://localhost:8788)
// Pair with: cloudflared tunnel --url http://localhost:8788
// Then: node scripts/live-bakeoff.mjs start "<zoom_url>" "https://<tunnel>.trycloudflare.com"

import { createServer } from 'node:http'
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATE_FILE = join(__dirname, '.live-bakeoff.json')
const OUT_DIR = join(__dirname, 'out')
const PORT = 8788
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

function botKey(botId) {
  try {
    const { bots } = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    return bots.find((b) => b.botId === botId)?.key ?? botId?.slice(0, 8) ?? 'unknown'
  } catch { return botId?.slice(0, 8) ?? 'unknown' }
}
const hhmmss = () => new Date().toISOString().slice(11, 19)

const server = createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(200).end('live-listen ok'); return }
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    res.writeHead(200).end('ok') // ack fast; Recall retries on non-2xx
    try {
      const evt = JSON.parse(body)
      const kind = evt?.event ?? 'unknown'
      if (!kind.startsWith('transcript.')) { console.log(`[${hhmmss()}] event: ${kind}`); return }
      const d = evt?.data ?? {}
      const words = d?.data?.words ?? []
      const speaker = d?.data?.participant?.name ?? ''
      const key = botKey(d?.bot?.id)
      const text = words.map((w) => w.text).join(' ').trim()
      if (!text) return
      const abs = words[0]?.start_timestamp?.absolute
      const lag = abs ? (Date.now() - Date.parse(abs)) / 1000 : null
      const lagStr = lag !== null ? `lag=${lag.toFixed(1)}s` : 'lag=?'
      const tag = kind === 'transcript.partial_data' ? 'PART' : 'FINAL'
      console.log(`[${hhmmss()}] ${key.padEnd(11)} ${tag} ${lagStr} ${speaker ? speaker + ': ' : ''}${text}`)
      appendFileSync(join(OUT_DIR, `live-arrivals-${key}.jsonl`),
        JSON.stringify({ at: new Date().toISOString(), kind, lag, speaker, text, rel: words[0]?.start_timestamp?.relative }) + '\n')
    } catch (e) {
      console.log(`[${hhmmss()}] unparseable event: ${e.message} :: ${body.slice(0, 200)}`)
    }
  })
})
server.listen(PORT, () => console.log(`live-listen on http://localhost:${PORT} — waiting for Recall events...`))
