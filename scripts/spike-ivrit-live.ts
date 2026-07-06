// scripts/spike-ivrit-live.ts — S1: does the worker take base64 `blob` input?
//                               S2: real latency for a ~35s chunk (cold + warm).
// Run: node --import tsx scripts/spike-ivrit-live.ts
import fs from 'fs'
import path from 'path'
import { pcmToWav } from '../src/lib/live/wavEncode'
import { transcribeWav, transcribeUrl } from './lib/runpod-live'

const ROOT = process.cwd()
function env(k: string): string {
  const txt = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const m = txt.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}

const SRC =
  process.env.SPIKE_SRC ||
  'C:/Users/Sagi/Desktop/Atlas/scripts/out/sessions/2026-07-01-tamis-live/broadcast-audio.pcm'
const BPS = 32000 // bytes/sec @16k mono s16le

const opts = {
  apiKey: env('RUNPOD_API_KEY'),
  endpointId: env('RUNPOD_IVRIT_ENDPOINT_ID'),
  model: process.env.RUNPOD_IVRIT_LIVE_MODEL || 'ivrit-ai/whisper-large-v3-turbo-ct2',
}

async function once(label: string, wav: Buffer) {
  const t0 = Date.now()
  const output = await transcribeWav(wav, opts)
  const ms = Date.now() - t0
  console.log(`[${label}] blob OK — ${ms}ms`)
  return { output, ms }
}

async function main() {
  const pcm = fs.readFileSync(SRC)
  // 60-95s turned out to be mostly silence ("תודה רבה" twice) — the archive's dense speech
  // is at 0-31s (44 words in broadcast-lines.jsonl), so default to the 0-35s window.
  const startSec = Number(process.env.SPIKE_START_SEC || 0)
  const slice = pcm.subarray(startSec * BPS, (startSec + 35) * BPS) // 35s, speech-heavy
  const wav = pcmToWav(slice)
  console.log(`chunk: 35s, wav ${wav.length} bytes, model ${opts.model}`)

  let result: { output: unknown; ms: number }
  try {
    result = await once('cold', wav) // S1: blob accepted?
  } catch (e) {
    console.error(`blob input REJECTED — ${(e as Error).message}`)
    console.error('S1 verdict: URL fallback required. Upload chunk WAVs to the audio-temp bucket')
    console.error('(supabaseAdmin.storage pattern in src/lib/transcription.ts uploadAudioToStorage)')
    console.error('and switch the engine (Task 6) to transcribeUrl(). Aborting spike here.')
    process.exit(2)
  }
  const warm = await once('warm', wav) // S2: warm latency (worker already up)

  fs.mkdirSync(path.join(ROOT, 'scripts/fixtures'), { recursive: true })
  fs.writeFileSync(
    path.join(ROOT, 'scripts/fixtures/ivrit-live-spike.json'),
    JSON.stringify(warm.output, null, 2)
  )
  const preview = JSON.stringify(warm.output).slice(0, 600)
  console.log(`saved fixture scripts/fixtures/ivrit-live-spike.json\npreview: ${preview}`)
  console.log(`S2: cold=${result.ms}ms warm=${warm.ms}ms for a 35s chunk (budget: <240s) `)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
