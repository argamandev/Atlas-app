// scripts/make-wholefile-reference.ts — whole-file IVRIT reference for the chunking-cost diff.
// Run: node --import tsx scripts/make-wholefile-reference.ts
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pcmToWav } from '../src/lib/live/wavEncode'

const ROOT = process.cwd()
for (const raw of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const eq = raw.indexOf('=')
  if (eq === -1 || raw.trim().startsWith('#')) continue
  const k = raw.slice(0, eq).trim()
  if (!process.env[k])
    process.env[k] = raw
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
}
const SRC =
  process.env.SRC ||
  'C:/Users/Sagi/Desktop/Atlas/scripts/out/sessions/2026-07-01-tamis-live/broadcast-audio.pcm'

async function main() {
  const { transcribeAudio } = await import('../src/lib/transcription')
  const wavPath = path.join(os.tmpdir(), `wholefile_ref_${Date.now()}.wav`)
  fs.writeFileSync(wavPath, pcmToWav(fs.readFileSync(SRC)))
  const { text, engine, model } = await transcribeAudio(wavPath)
  fs.writeFileSync(path.join(ROOT, 'scripts/out/ivrit-wholefile.txt'), text)
  console.log(`reference saved (${engine}/${model}, ${text.length} chars) -> scripts/out/ivrit-wholefile.txt`)
  fs.unlinkSync(wavPath)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
