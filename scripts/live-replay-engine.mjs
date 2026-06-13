// Serve a recorded broadcast session as a fake-LIVE feed on :8788 — so the live UI can be
// tested without a Zoom call. Reads scripts/out/broadcast-audio.pcm + broadcast-lines.jsonl.
//   REPLAY_OFFSET=<sec>  start the live edge already advanced (default 0)
//   REPLAY_SPEED=<x>     advance the live edge faster than realtime (default 1)
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'out')
const SR = 16000

const lines = readFileSync(join(OUT, 'broadcast-lines.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
const pcm = readFileSync(join(OUT, 'broadcast-audio.pcm'))
const totalDur = pcm.length / 2 / SR

const SPEED = Number(process.env.REPLAY_SPEED || 1)
const OFFSET = Number(process.env.REPLAY_OFFSET || 0)
const t0 = Date.now()
const liveEdge = () => Math.min(totalDur, OFFSET + ((Date.now() - t0) / 1000) * SPEED)

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/state') {
    const edge = liveEdge()
    const visible = lines.filter((l) => (l.words?.[0]?.start ?? 0) <= edge)
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ audioStartRel: 0, liveEdgeRel: edge, liveEnded: edge >= totalDur, sampleRate: SR, lines: visible }))
    return
  }
  if (url.pathname === '/pcm') {
    const from = Number(url.searchParams.get('from'))
    const to = Number(url.searchParams.get('to'))
    const cappedTo = Math.min(to, liveEdge())
    if (!isFinite(from) || !isFinite(to) || cappedTo <= from) {
      res.writeHead(204).end()
      return
    }
    const startByte = Math.max(0, Math.round(from * SR) * 2)
    const endByte = Math.min(pcm.length, Math.round(cappedTo * SR) * 2)
    if (endByte <= startByte) {
      res.writeHead(204).end()
      return
    }
    res.writeHead(200, { 'content-type': 'application/octet-stream' })
    res.end(pcm.subarray(startByte, endByte))
    return
  }
  res.writeHead(404).end()
})

server.listen(8788, () => console.log(`[replay] :8788 dur=${totalDur.toFixed(0)}s speed=${SPEED} offset=${OFFSET} lines=${lines.length}`))
