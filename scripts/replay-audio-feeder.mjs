// scripts/replay-audio-feeder.mjs — stream an archived PCM capture into the ivrit engine's
// websocket in Recall's audio_mixed_raw.data format. The no-Zoom live-call stand-in.
//   SRC=<pcm path>        default: the 2026-07-01 tamis archive (main checkout, absolute)
//   REPLAY_SPEED=<x>      default 1 (realtime); 8 for fast pipeline soaks
//   START_REL=<sec>       Recall-like nonzero stream epoch, default 10
import { readFileSync } from 'node:fs'
import WebSocket from 'ws'

const SRC = process.env.SRC || 'C:/Users/Sagi/Desktop/Atlas/scripts/out/sessions/2026-07-01-tamis-live/broadcast-audio.pcm'
const SPEED = Number(process.env.REPLAY_SPEED || 1)
const START_REL = Number(process.env.START_REL || 10)
const BYTES_PER_SEC = 32000
const TICK_MS = 100

const pcm = readFileSync(SRC)
const ws = new WebSocket('ws://localhost:8788/ws')

ws.on('open', () => {
  console.log(`[feeder] streaming ${(pcm.length / BYTES_PER_SEC).toFixed(0)}s at ${SPEED}x from ${SRC}`)
  let sent = 0
  const timer = setInterval(() => {
    const step = Math.round((BYTES_PER_SEC * TICK_MS * SPEED) / 1000 / 2) * 2 // sample-aligned
    const slice = pcm.subarray(sent, Math.min(pcm.length, sent + step))
    if (slice.length === 0) {
      clearInterval(timer)
      console.log('[feeder] done — closing (engine will flush + mark ended)')
      ws.close()
      return
    }
    ws.send(JSON.stringify({
      event: 'audio_mixed_raw.data',
      data: { data: { buffer: slice.toString('base64'), timestamp: { relative: START_REL + sent / BYTES_PER_SEC } } },
    }))
    sent += slice.length
  }, TICK_MS)
})
ws.on('error', (e) => { console.error('[feeder] ws error:', e.message); process.exit(1) })
