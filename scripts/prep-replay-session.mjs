// Prep a recorded session for the live replay engine: extract ONLY the first capture session
// (the real Or Yam / אור ים call; the file may hold a second, irrelevant test session) and write
// broadcast-lines.jsonl + a trimmed broadcast-audio.pcm into scripts/out/ where
// live-replay-engine.mjs reads them. Trimming to the session-1 span keeps audio↔captions aligned
// AND stops the second session's audio from bleeding in.
//   node scripts/prep-replay-session.mjs [basePathWithoutExt]
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'out')
const SR = 16000
const base = process.argv[2] || join(OUT, 'sessions', 'tamis-2026-06-14')

const recs = readFileSync(`${base}.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))

// First session = records until a record's first word start jumps backward (the second session
// resets its timeline to ~0).
const sess = []
let lastStart = -Infinity
for (const r of recs) {
  const first = r.words?.[0]?.start ?? lastStart
  if (lastStart - first > 5) break
  sess.push(r)
  lastStart = r.words?.[r.words.length - 1]?.start ?? first
}

const allStarts = sess.flatMap((r) => r.words.map((w) => w.start))
const durSec = Math.max(...allStarts) + 3
const wantBytes = Math.floor(durSec * SR) * 2

const pcm = readFileSync(`${base}.pcm`)
const trimmed = pcm.subarray(0, Math.min(pcm.length, wantBytes))

writeFileSync(join(OUT, 'broadcast-lines.jsonl'), sess.map((r) => JSON.stringify(r)).join('\n') + '\n')
writeFileSync(join(OUT, 'broadcast-audio.pcm'), trimmed)
console.log(`[prep] session1: ${sess.length}/${recs.length} records, ${allStarts.length} words, dur≈${durSec.toFixed(0)}s, pcm ${trimmed.length} bytes (${(trimmed.length / 2 / SR).toFixed(0)}s)`)
