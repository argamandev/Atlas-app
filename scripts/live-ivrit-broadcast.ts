// scripts/live-ivrit-broadcast.ts — the second live pipeline: audio in, OUR text out.
//   Recall ws (audio_mixed_raw) -> PcmChunker (20-45s, silence-aligned) -> RunPod IVRIT
//   (word timestamps) -> stitcher -> /state lines for the same karaoke UX.
// Same /state + /pcm contract as live-broadcast.mjs; the Next app proxies :8788 as before.
// Run: node --import tsx scripts/live-ivrit-broadcast.ts
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { PcmChunker, type PcmChunk } from '../src/lib/live/pcmChunker'
import { stitchChunk, lastWordStart, captionOnTime, type LiveLine } from '../src/lib/live/ivritStitcher'
import { pcmToWav } from '../src/lib/live/wavEncode'
import { parseIvritSegments } from '../src/lib/live/ivritParse'
import { transcribeWav } from './lib/runpod-live'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(__dirname, 'out')
const LINES_FILE = join(OUT_DIR, 'ivrit-lines.jsonl')
const PORT = 8788
const SAMPLE_RATE = 16000
const BYTES_PER_SEC = SAMPLE_RATE * 2
const BUFFER_SEC = Number(process.env.LIVE_BUFFER_SEC || 300)
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(LINES_FILE, '') // one engine run = one call (see live rules)

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1)
    out[line.slice(0, eq).trim()] = val
  }
  return out
}
const env = loadEnv()
const runpodOpts = {
  apiKey: env.RUNPOD_API_KEY,
  endpointId: env.RUNPOD_IVRIT_ENDPOINT_ID,
  model: process.env.RUNPOD_IVRIT_LIVE_MODEL || 'ivrit-ai/whisper-large-v3-turbo-ct2',
}
if (!runpodOpts.apiKey || !runpodOpts.endpointId)
  throw new Error('RUNPOD_API_KEY / RUNPOD_IVRIT_ENDPOINT_ID missing')

// ---- live state (module memory; restart per call, per live rules) ----
const pcmChunks: Buffer[] = []
let pcmBytes = 0
let audioStartRel: number | null = null
let wallStartMs: number | null = null // wall clock at first audio packet — drives readyAt accounting
let liveEnded = false
let endedAt: number | null = null
const lines: LiveLine[] = []
let prevMaxStart = 0
let nextId = 1
const jobQueue: PcmChunk[] = []
let working = false

const chunker = new PcmChunker() // defaults: min 20s, max 45s, 400ms silence

function liveEdgeRel(): number | null {
  return audioStartRel === null ? null : audioStartRel + pcmBytes / BYTES_PER_SEC
}
function nowRel(): number {
  return wallStartMs === null || audioStartRel === null
    ? 0
    : audioStartRel + (Date.now() - wallStartMs) / 1000
}

async function processQueue() {
  if (working) return
  working = true
  while (jobQueue.length) {
    if (jobQueue.length > 3) console.warn(`[queue] depth=${jobQueue.length} — falling behind?`)
    const chunk = jobQueue.shift()!
    const streamChunk = {
      startSec: (audioStartRel ?? 0) + chunk.startSec,
      endSec: (audioStartRel ?? 0) + chunk.endSec,
    }
    let line: LiveLine
    const t0 = Date.now()
    try {
      let output: unknown
      let lastErr: Error | null = null
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          output = await transcribeWav(pcmToWav(chunk.pcm), runpodOpts)
          lastErr = null
          break
        } catch (e) {
          lastErr = e as Error
          console.warn(
            `[job] chunk@${chunk.startSec.toFixed(0)}s attempt ${attempt} failed: ${lastErr.message}`
          )
        }
      }
      if (lastErr) throw lastErr
      line = stitchChunk(nextId++, parseIvritSegments(output), streamChunk, prevMaxStart)
    } catch (e) {
      // A failed chunk is a logged gap, never a stall.
      console.error(`[job] chunk@${chunk.startSec.toFixed(0)}s GAP after retries: ${(e as Error).message}`)
      line = {
        id: nextId++,
        raw: '',
        words: [],
        chunkStartSec: streamChunk.startSec,
        chunkEndSec: streamChunk.endSec,
        failed: true,
      }
    }
    prevMaxStart = lastWordStart(line, prevMaxStart)
    lines.push(line)
    appendFileSync(LINES_FILE, JSON.stringify(line) + '\n')
    const readyAt = nowRel()
    const onTime = captionOnTime(line.chunkStartSec, readyAt, BUFFER_SEC)
    console.log(
      `[caption] line ${line.id} (${chunk.reason}, ${(chunk.endSec - chunk.startSec).toFixed(1)}s): ` +
        `${line.words.length} words in ${((Date.now() - t0) / 1000).toFixed(1)}s, readyAt=${readyAt.toFixed(0)}s ` +
        `${onTime ? 'ON TIME' : '*** LATE vs buffer budget ***'}${line.failed ? ' [GAP]' : ''}${line.fallbackTiming ? ' [fallback timing]' : ''}`
    )
  }
  working = false
}

// heartbeat — proof of life every 30s
setInterval(() => {
  const edge = liveEdgeRel()
  console.log(
    `[status] audio=${edge === null ? 'NOT STARTED' : (edge - (audioStartRel ?? 0)).toFixed(0) + 's'} | lines=${lines.length} | queue=${jobQueue.length}${liveEnded ? ' | SOURCE ENDED' : ''}`
  )
}, 30_000)

// ---- HTTP: same contract as live-broadcast.mjs ----
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  if (url.pathname === '/state') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(
      JSON.stringify({
        audioStartRel,
        liveEdgeRel: liveEdgeRel(),
        liveEnded,
        endedAt,
        sampleRate: SAMPLE_RATE,
        lines,
      })
    )
    return
  }
  if (url.pathname === '/pcm') {
    const from = Number(url.searchParams.get('from'))
    const to = Number(url.searchParams.get('to'))
    if (audioStartRel === null || !isFinite(from) || !isFinite(to) || to <= from) {
      res.writeHead(416).end()
      return
    }
    const startByte = Math.max(0, Math.round((from - audioStartRel) * SAMPLE_RATE) * 2)
    const endByte = Math.min(pcmBytes, Math.round((to - audioStartRel) * SAMPLE_RATE) * 2)
    if (endByte <= startByte) {
      res.writeHead(204).end()
      return
    }
    const all = Buffer.concat(pcmChunks, pcmBytes)
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'x-from-rel': String(Math.max(from, audioStartRel)),
    })
    res.end(all.subarray(startByte, endByte))
    return
  }
  res.writeHead(404).end()
})

const wss = new WebSocketServer({ server, path: '/ws' })
wss.on('connection', (sock) => {
  console.log('[audio] websocket connected')
  sock.on('message', (msg) => {
    try {
      const evt = JSON.parse(msg.toString())
      if (evt?.event !== 'audio_mixed_raw.data') return
      const b64 = evt?.data?.data?.buffer
      const rel = evt?.data?.data?.timestamp?.relative
      if (!b64) return
      if (audioStartRel === null && typeof rel === 'number') {
        audioStartRel = rel
        wallStartMs = Date.now()
        console.log(`[audio] stream started at rel=${rel.toFixed(2)}s`)
      }
      const buf = Buffer.from(b64, 'base64')
      pcmChunks.push(buf)
      pcmBytes += buf.length
      jobQueue.push(...chunker.feed(buf))
      void processQueue()
    } catch {
      /* ignore malformed frames */
    }
  })
  sock.on('close', () => {
    console.log('[audio] websocket closed — source ended, flushing tail chunk')
    liveEnded = true
    if (endedAt === null) endedAt = Date.now()
    const tail = chunker.flush()
    if (tail) {
      jobQueue.push(tail)
      void processQueue()
    }
  })
})

server.listen(PORT, () =>
  console.log(
    `live-ivrit-broadcast on http://localhost:${PORT} (model=${runpodOpts.model}, buffer=${BUFFER_SEC}s)`
  )
)
