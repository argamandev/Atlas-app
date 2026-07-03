# IVRIT Live Pipeline — Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replayed archived call audio → chunked IVRIT/RunPod transcription with word timestamps → the existing karaoke live UX renders in sync, with the timing invariants unit-tested.

**Architecture:** A new engine (`scripts/live-ivrit-broadcast.ts`, :8788, same `/state`+`/pcm` contract as `live-broadcast.mjs`) receives raw PCM over websocket, cuts it into 20–45s silence-aligned chunks (pure `PcmChunker`), transcribes each chunk on RunPod (FIFO, concurrency 1), and stitches chunk-relative word timestamps into one non-decreasing stream timeline (pure `ivritStitcher`). The Next app already proxies :8788 (`src/app/api/live/{state,pcm}/route.ts`), so no UI changes.

**Tech Stack:** TypeScript run via `node --import tsx` · `ws` · RunPod serverless (ivrit-ai whisper) · node:test.

Approved spec: `docs/superpowers/specs/2026-07-03-ivrit-live-chunking-design.md`.

## Global Constraints

- Worktree `C:\Users\Sagi\Desktop\Atlas-ivrit`, branch `feat/ivrit-pipeline`, dev port **3002**. Never push main.
- Engine port **:8788 is fleet-single-owner** — APPEND a claim line to `C:/Users/Sagi/Desktop/Atlas/agent-memory/cross-cutting.md` before the first engine run (Task 6), release when Task 9 ends.
- `src/lib/transcription.ts` is shared — APPEND to cross-cutting.md BEFORE modifying it (Task 3).
- Audio format everywhere: **16 kHz mono s16le** → 32,000 bytes/sec.
- Line shape consumed by the viewer: `{ id, raw, words: [{ text, start }] }`, `start` in stream-relative seconds; word starts must be non-decreasing across the whole stream.
- Latency budget: caption for a chunk must exist before viewers (buffer default 300s) reach it: `readyAtSec ≤ chunkStartSec + bufferSec − 60`.
- Test bench source (read-only, lives in the MAIN checkout, not this worktree): `C:/Users/Sagi/Desktop/Atlas/scripts/out/sessions/2026-07-01-tamis-live/{broadcast-audio.pcm,broadcast-lines.jsonl}` (387s of real Hebrew call audio + Recall's captions).
- New test files must be appended to the `"test"` script line in `package.json` (runner is `node --import tsx --test`).
- Env (`.env.local`): `RUNPOD_API_KEY`, `RUNPOD_IVRIT_ENDPOINT_ID`; live model env `RUNPOD_IVRIT_LIVE_MODEL` defaults to `ivrit-ai/whisper-large-v3-turbo-ct2`.
- Gemini correction and diarization are OUT of M1 (founder decision A2/A3).

---

### Task 1: WAV encoder (`pcmToWav`)

**Files:**
- Create: `src/lib/live/wavEncode.ts`
- Test: `src/lib/live/wavEncode.test.ts`
- Modify: `package.json` (append test file to the `"test"` line)

**Interfaces:**
- Consumes: nothing.
- Produces: `pcmToWav(pcm: Buffer, sampleRate?: number): Buffer` — raw s16le mono PCM wrapped in a 44-byte-header WAV container. Used by Tasks 2 and 6.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/live/wavEncode.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pcmToWav } from './wavEncode'

test('wav is 44-byte header + payload, with correct magics', () => {
  const pcm = Buffer.alloc(32000) // 1s of silence @16k mono s16le
  const wav = pcmToWav(pcm)
  assert.equal(wav.length, 44 + 32000)
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE')
  assert.equal(wav.toString('ascii', 12, 16), 'fmt ')
  assert.equal(wav.toString('ascii', 36, 40), 'data')
})

test('wav header fields encode 16k mono s16le and the payload size', () => {
  const pcm = Buffer.alloc(64000) // 2s
  const wav = pcmToWav(pcm)
  assert.equal(wav.readUInt32LE(4), 36 + 64000) // RIFF size
  assert.equal(wav.readUInt16LE(20), 1) // PCM
  assert.equal(wav.readUInt16LE(22), 1) // mono
  assert.equal(wav.readUInt32LE(24), 16000) // sample rate
  assert.equal(wav.readUInt32LE(28), 32000) // byte rate
  assert.equal(wav.readUInt16LE(32), 2) // block align
  assert.equal(wav.readUInt16LE(34), 16) // bits per sample
  assert.equal(wav.readUInt32LE(40), 64000) // data size
})

test('payload bytes pass through untouched', () => {
  const pcm = Buffer.from([1, 2, 3, 4])
  assert.deepEqual([...pcmToWav(pcm).subarray(44)], [1, 2, 3, 4])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/live/wavEncode.test.ts`
Expected: FAIL — cannot find module `./wavEncode`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/live/wavEncode.ts
// Wrap raw PCM (s16le mono) in a minimal WAV container — enough for whisper/ffmpeg to read.
export function pcmToWav(pcm: Buffer, sampleRate = 16000): Buffer {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0, 'ascii')
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVE', 8, 'ascii')
  h.write('fmt ', 12, 'ascii')
  h.writeUInt32LE(16, 16) // fmt chunk size
  h.writeUInt16LE(1, 20) // PCM
  h.writeUInt16LE(1, 22) // mono
  h.writeUInt32LE(sampleRate, 24)
  h.writeUInt32LE(sampleRate * 2, 28) // byte rate (16-bit mono)
  h.writeUInt16LE(2, 32) // block align
  h.writeUInt16LE(16, 34) // bits per sample
  h.write('data', 36, 'ascii')
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/live/wavEncode.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Register in the suite and commit**

In `package.json`, append ` src/lib/live/wavEncode.test.ts` to the end of the `"test"` script string. Then:

```bash
npm test   # whole suite green
git add src/lib/live/wavEncode.ts src/lib/live/wavEncode.test.ts package.json
git commit -m "feat(ivrit-live): wav encoder for pcm chunks"
```

---

### Task 2: RunPod live client + spikes S1 (blob input) & S2 (chunk latency)

**Files:**
- Create: `scripts/lib/runpod-live.ts`
- Create: `scripts/spike-ivrit-live.ts`
- Create (output): `scripts/fixtures/ivrit-live-spike.json` (real RunPod response — becomes the Task 5 test fixture)
- Modify: `docs/superpowers/specs/2026-07-03-ivrit-live-chunking-design.md` (record spike results)

**Interfaces:**
- Consumes: `pcmToWav` (Task 1).
- Produces: `transcribeWav(wav: Buffer, opts: RunpodLiveOpts): Promise<unknown>` with `RunpodLiveOpts = { apiKey: string; endpointId: string; model: string; pollMs?: number; timeoutMs?: number }` — returns the raw RunPod output (Task 6 parses it with `parseIvritSegments`).

- [ ] **Step 1: Write the client**

```ts
// scripts/lib/runpod-live.ts — small-chunk RunPod client for the live pipeline.
// Unlike transcription.ts (whole files, 5s poll), this polls fast: jobs are 20-45s of audio.
export interface RunpodLiveOpts {
  apiKey: string
  endpointId: string
  model: string
  pollMs?: number
  timeoutMs?: number
}

async function runJob(opts: RunpodLiveOpts, transcribeArgs: Record<string, unknown>): Promise<unknown> {
  const { apiKey, endpointId, model, pollMs = 1000, timeoutMs = 180_000 } = opts
  const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { model, streaming: false, transcribe_args: transcribeArgs } }),
  })
  if (!res.ok) throw new Error(`RunPod submit ${res.status}: ${await res.text()}`)
  const { id } = (await res.json()) as { id: string }
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollMs))
    const st = await fetch(`https://api.runpod.ai/v2/${endpointId}/status/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!st.ok) continue
    const s = (await st.json()) as { status: string; output?: unknown; error?: unknown }
    if (s.status === 'COMPLETED') return s.output
    if (s.status === 'FAILED') throw new Error(`RunPod job failed: ${JSON.stringify(s.error)}`)
  }
  throw new Error(`RunPod job timed out after ${timeoutMs / 1000}s`)
}

/** Transcribe a WAV buffer sent inline as base64 (S1 verifies the worker accepts `blob`). */
export function transcribeWav(wav: Buffer, opts: RunpodLiveOpts): Promise<unknown> {
  return runJob(opts, {
    blob: wav.toString('base64'),
    language: 'he',
    output_options: { word_timestamps: true, extra_data: true },
  })
}

/** URL fallback if S1 finds `blob` unsupported — same args, audio fetched by the worker. */
export function transcribeUrl(url: string, opts: RunpodLiveOpts): Promise<unknown> {
  return runJob(opts, {
    url,
    language: 'he',
    output_options: { word_timestamps: true, extra_data: true },
  })
}
```

- [ ] **Step 2: Write the spike script**

```ts
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
  const slice = pcm.subarray(60 * BPS, 95 * BPS) // 35s from a speech-heavy region
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
main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Run the spike (twice-in-one — cold then warm)**

Run: `node --import tsx scripts/spike-ivrit-live.ts`
Expected: `blob OK` twice with latencies printed, fixture file written, preview shows Hebrew segments with `words` arrays carrying numeric `start`/`end`.
Contingency: exit code 2 → S1 verdict is URL-fallback. Then Task 6 uses `transcribeUrl` + a per-chunk upload to the existing `audio-temp` Supabase bucket (copy `uploadAudioToStorage` from `src/lib/transcription.ts:134-146` into the engine, upload `chunk-<id>.wav`); latency re-measured with a URL job before proceeding.

- [ ] **Step 4: Sanity-check the fixture has usable word timings**

Run: `node --import tsx -e "import fs from 'fs'; const j=JSON.parse(fs.readFileSync('scripts/fixtures/ivrit-live-spike.json','utf8')); console.log(JSON.stringify(j).match(/\"start\"/g)?.length ?? 0, 'start fields')"`
Expected: dozens of `start` fields (per-word). If 0 → STOP, investigate `output_options` before continuing (this is a 5-strike-rule candidate; the archive path proved word_timestamps works, so expect success).

- [ ] **Step 5: Record spike results and commit**

Append to the spec (`docs/superpowers/specs/2026-07-03-ivrit-live-chunking-design.md`) a `## Spike results (2026-07-03)` section stating: blob supported yes/no, cold ms, warm ms, chosen poll interval. Then:

```bash
git add scripts/lib/runpod-live.ts scripts/spike-ivrit-live.ts scripts/fixtures/ivrit-live-spike.json docs/superpowers/specs/2026-07-03-ivrit-live-chunking-design.md
git commit -m "feat(ivrit-live): runpod live client + S1/S2 spike results and fixture"
```

---

### Task 3: Extract `parseIvritSegments` into a light shared module

**Files:**
- Create: `src/lib/live/ivritParse.ts`
- Modify: `src/lib/transcription.ts` (delete the moved functions, import them instead)

**Interfaces:**
- Consumes: `IvritSegment`/`IvritWord` types from `./syncEngine`.
- Produces: `parseIvritSegments(output: unknown): IvritSegment[]` and `extractIvritText(output: unknown): string` — exactly today's behavior, importable without transcription.ts's heavy deps (openai/ffmpeg). Task 6 imports `parseIvritSegments`.

- [ ] **Step 1: Append the shared-lib alert BEFORE touching the file**

```bash
echo "[2026-07-03] Lane I — moving parseIvritSegments/extractIvritText out of src/lib/transcription.ts into src/lib/live/ivritParse.ts (pure extraction, transcription.ts re-imports; public behavior unchanged)" >> C:/Users/Sagi/Desktop/Atlas/agent-memory/cross-cutting.md
```

- [ ] **Step 2: Create `src/lib/live/ivritParse.ts`**

Move — character-for-character — these four functions from `src/lib/transcription.ts:175-263` into the new file, adding `export` to `parseIvritSegments` and `extractIvritText` (keep `asNum` and `collectRawSegments` module-private), with the type import:

```ts
// src/lib/live/ivritParse.ts
// IVRIT/RunPod output → word-timed segments. Extracted from transcription.ts so the live
// engine can import it without pulling openai/ffmpeg. Behavior is identical.
import type { IvritSegment, IvritWord } from './syncEngine'

function asNum(v: unknown): number | null { /* moved as-is from transcription.ts */ }
function collectRawSegments(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] { /* moved as-is */ }
export function parseIvritSegments(output: unknown): IvritSegment[] { /* moved as-is */ }
export function extractIvritText(output: unknown): string { /* moved as-is */ }
```

(The bodies are the exact lines currently at `transcription.ts:175-263` — including the diarization speaker-fallback comment block. Do not edit them.)

- [ ] **Step 3: Rewire `transcription.ts`**

Delete the four moved functions from `src/lib/transcription.ts` and add to its imports:

```ts
import { parseIvritSegments, extractIvritText } from './live/ivritParse'
```

(`IvritWord` may become an unused import in transcription.ts — remove it from the type-import line if tsc complains.)

- [ ] **Step 4: Prove no regression**

Run: `npx tsc --noEmit` — expected: clean.
Run: `npm test` — expected: all pass (transcription.test.ts unchanged and green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/live/ivritParse.ts src/lib/transcription.ts
git commit -m "refactor(ivrit-live): extract parseIvritSegments to light module for the live engine"
```

---

### Task 4: Silence-aligned incremental chunker (`PcmChunker`)

**Files:**
- Create: `src/lib/live/pcmChunker.ts`
- Test: `src/lib/live/pcmChunker.test.ts`
- Modify: `package.json` (append test file to the `"test"` line)

**Interfaces:**
- Consumes: nothing (pure over bytes).
- Produces:
  ```ts
  interface PcmChunk { pcm: Buffer; startSec: number; endSec: number; reason: 'silence' | 'max' | 'flush' }
  interface ChunkerOpts { sampleRate?: number; minChunkSec?: number; maxChunkSec?: number; silenceMs?: number; silenceRms?: number }
  class PcmChunker { constructor(opts?: ChunkerOpts); feed(buf: Buffer): PcmChunk[]; flush(): PcmChunk | null }
  ```
  `startSec`/`endSec` are relative to the first fed byte (the engine adds `audioStartRel`). Defaults: 16000 Hz, min 20s, max 45s, silence 400ms, RMS threshold 0.02 (≈2% full scale). Task 6 consumes this.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/live/pcmChunker.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PcmChunker } from './pcmChunker'

const SR = 16000
// Synthetic s16le mono: "loud" = constant amplitude 8000, "quiet" = zeros.
function pcmOf(sec: number, amplitude: number): Buffer {
  const buf = Buffer.alloc(Math.round(sec * SR) * 2)
  for (let i = 0; i < buf.length; i += 2) buf.writeInt16LE(amplitude, i)
  return buf
}
// Small limits so tests stay fast: min 2s, max 4s, 400ms silence.
const opts = { minChunkSec: 2, maxChunkSec: 4, silenceMs: 400, silenceRms: 0.02 }

test('cuts at the first sustained silence after minChunkSec', () => {
  const c = new PcmChunker(opts)
  const chunks = [
    ...c.feed(pcmOf(2.5, 8000)), // speech past min
    ...c.feed(pcmOf(0.6, 0)), // pause
    ...c.feed(pcmOf(1.0, 8000)),
  ]
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].reason, 'silence')
  assert.equal(chunks[0].startSec, 0)
  assert.ok(chunks[0].endSec > 2.5 && chunks[0].endSec <= 3.1, `cut at ${chunks[0].endSec}`)
})

test('forces a cut at maxChunkSec when nobody pauses', () => {
  const c = new PcmChunker(opts)
  const chunks = c.feed(pcmOf(9, 8000))
  assert.equal(chunks.length, 2)
  assert.equal(chunks[0].reason, 'max')
  assert.equal(chunks[0].endSec, 4)
  assert.equal(chunks[1].startSec, 4)
  assert.equal(chunks[1].endSec, 8)
})

test('no silence cut before minChunkSec', () => {
  const c = new PcmChunker(opts)
  const chunks = [...c.feed(pcmOf(1, 8000)), ...c.feed(pcmOf(0.6, 0)), ...c.feed(pcmOf(0.2, 8000))]
  assert.equal(chunks.length, 0) // 1.8s total: under min, silence ignored
})

test('every fed byte lands in exactly one chunk, contiguously', () => {
  const c = new PcmChunker(opts)
  const feeds = [pcmOf(2.5, 8000), pcmOf(0.6, 0), pcmOf(4.5, 8000), pcmOf(1.3, 8000)]
  const fedBytes = feeds.reduce((n, b) => n + b.length, 0)
  const chunks = feeds.flatMap((b) => c.feed(b))
  const tail = c.flush()
  if (tail) chunks.push(tail)
  assert.equal(chunks.reduce((n, ch) => n + ch.pcm.length, 0), fedBytes)
  for (let i = 1; i < chunks.length; i++) assert.equal(chunks[i].startSec, chunks[i - 1].endSec)
  assert.equal(chunks[chunks.length - 1].reason, 'flush')
})

test('flush on an empty buffer returns null', () => {
  const c = new PcmChunker(opts)
  assert.equal(c.flush(), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/live/pcmChunker.test.ts`
Expected: FAIL — cannot find module `./pcmChunker`.

- [ ] **Step 3: Implement**

```ts
// src/lib/live/pcmChunker.ts
// Incremental silence-aligned chunker over s16le mono PCM. Accumulates fed bytes, scans
// fixed 100ms windows for RMS energy, and cuts a chunk when (a) >= minChunkSec buffered AND
// a sustained quiet run just ended a sentence, or (b) maxChunkSec is reached. Pure: no IO,
// no clocks — startSec/endSec are relative to the first fed byte.
export interface PcmChunk {
  pcm: Buffer
  startSec: number
  endSec: number
  reason: 'silence' | 'max' | 'flush'
}
export interface ChunkerOpts {
  sampleRate?: number
  minChunkSec?: number
  maxChunkSec?: number
  silenceMs?: number
  silenceRms?: number // 0..1 of full scale
}

const WINDOW_MS = 100

export class PcmChunker {
  private readonly bytesPerSec: number
  private readonly windowBytes: number
  private readonly minSec: number
  private readonly maxSec: number
  private readonly quietWindowsNeeded: number
  private readonly rmsThreshold: number
  private buf = Buffer.alloc(0)
  private scanPos = 0 // next unscanned byte within buf (window-aligned)
  private quietRun = 0
  private emittedSec = 0

  constructor(opts: ChunkerOpts = {}) {
    const sr = opts.sampleRate ?? 16000
    this.bytesPerSec = sr * 2
    this.windowBytes = Math.round((sr * WINDOW_MS) / 1000) * 2
    this.minSec = opts.minChunkSec ?? 20
    this.maxSec = opts.maxChunkSec ?? 45
    this.quietWindowsNeeded = Math.max(1, Math.round((opts.silenceMs ?? 400) / WINDOW_MS))
    this.rmsThreshold = opts.silenceRms ?? 0.02
  }

  feed(incoming: Buffer): PcmChunk[] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, incoming]) : Buffer.from(incoming)
    const out: PcmChunk[] = []
    while (this.scanPos + this.windowBytes <= this.buf.length) {
      let sumSq = 0
      const samples = this.windowBytes / 2
      for (let i = 0; i < this.windowBytes; i += 2) {
        const s = this.buf.readInt16LE(this.scanPos + i) / 32768
        sumSq += s * s
      }
      const rms = Math.sqrt(sumSq / samples)
      this.quietRun = rms < this.rmsThreshold ? this.quietRun + 1 : 0
      this.scanPos += this.windowBytes
      const bufferedSec = this.scanPos / this.bytesPerSec
      if (bufferedSec >= this.minSec && this.quietRun >= this.quietWindowsNeeded) {
        out.push(this.cut(this.scanPos, 'silence'))
      } else if (bufferedSec >= this.maxSec) {
        out.push(this.cut(this.scanPos, 'max'))
      }
    }
    return out
  }

  flush(): PcmChunk | null {
    if (this.buf.length === 0) return null
    return this.cut(this.buf.length, 'flush')
  }

  private cut(atBytes: number, reason: PcmChunk['reason']): PcmChunk {
    const durSec = atBytes / this.bytesPerSec
    const chunk: PcmChunk = {
      pcm: Buffer.from(this.buf.subarray(0, atBytes)),
      startSec: this.emittedSec,
      endSec: this.emittedSec + durSec,
      reason,
    }
    this.buf = Buffer.from(this.buf.subarray(atBytes))
    this.scanPos = 0
    this.quietRun = 0
    this.emittedSec = chunk.endSec
    return chunk
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/live/pcmChunker.test.ts`
Expected: PASS (5 tests). Note the max-cut test expects `endSec` exactly 4 — window-aligned cuts land exactly on 4.0s with 100ms windows.

- [ ] **Step 5: Register in the suite and commit**

Append ` src/lib/live/pcmChunker.test.ts` to `package.json`'s `"test"` line. Then:

```bash
npm test
git add src/lib/live/pcmChunker.ts src/lib/live/pcmChunker.test.ts package.json
git commit -m "feat(ivrit-live): silence-aligned incremental pcm chunker"
```

---

### Task 5: Timeline stitcher (`ivritStitcher`)

**Files:**
- Create: `src/lib/live/ivritStitcher.ts`
- Test: `src/lib/live/ivritStitcher.test.ts`
- Modify: `package.json` (append test file to the `"test"` line)

**Interfaces:**
- Consumes: `IvritSegment` from `./syncEngine`; the real-response fixture `scripts/fixtures/ivrit-live-spike.json` (Task 2) parsed via `parseIvritSegments` (Task 3).
- Produces (Task 6 consumes):
  ```ts
  interface LiveWord { text: string; start: number }
  interface LiveLine {
    id: number; raw: string; words: LiveWord[]
    chunkStartSec: number; chunkEndSec: number
    fallbackTiming?: boolean; failed?: boolean
  }
  function stitchChunk(id: number, segments: IvritSegment[], chunk: { startSec: number; endSec: number }, prevMaxStart: number): LiveLine
  function lastWordStart(line: LiveLine, prevMaxStart: number): number
  function captionOnTime(chunkStartSec: number, readyAtSec: number, bufferSec: number, marginSec?: number): boolean
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/live/ivritStitcher.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { stitchChunk, lastWordStart, captionOnTime } from './ivritStitcher'
import { parseIvritSegments } from './ivritParse'
import type { IvritSegment } from './syncEngine'

const seg = (text: string, words: [string, number, number][]): IvritSegment => ({
  text, start: words[0][1], end: words[words.length - 1][2], speaker: null,
  words: words.map(([word, start, end]) => ({ word, start, end })),
})

test('offsets chunk-relative word times to stream time', () => {
  const line = stitchChunk(1, [seg('שלום עולם', [['שלום', 0.5, 0.9], ['עולם', 1.0, 1.4]])],
    { startSec: 100, endSec: 130 }, 0)
  assert.deepEqual(line.words.map((w) => w.start), [100.5, 101.0])
  assert.equal(line.raw, 'שלום עולם')
  assert.equal(line.fallbackTiming, undefined)
})

test('clamps to non-decreasing across chunk boundary and within a chunk', () => {
  // prev chunk ended with a word at 131.2 (IVRIT overshoot); this chunk starts at 130
  const line = stitchChunk(2, [seg('א ב ג', [['א', 0.4, 0.6], ['ב', 0.2, 0.5], ['ג', 0.9, 1.1]])],
    { startSec: 130, endSec: 160 }, 131.2)
  assert.deepEqual(line.words.map((w) => w.start), [131.2, 131.2, 131.2]) // 130.4→131.2, 130.2→131.2, 130.9→131.2
})

test('caps word times at chunk end (IVRIT overshoot)', () => {
  const line = stitchChunk(3, [seg('א', [['א', 35.0, 35.4]])], { startSec: 0, endSec: 30 }, 0)
  assert.deepEqual(line.words.map((w) => w.start), [30])
})

test('text without word timings falls back to even distribution, flagged', () => {
  const line = stitchChunk(4, [{ text: 'אחת שתיים שלוש ארבע', start: 0, end: 0, speaker: null, words: [] }],
    { startSec: 200, endSec: 220 }, 0)
  assert.equal(line.fallbackTiming, true)
  assert.equal(line.words.length, 4)
  assert.deepEqual(line.words.map((w) => w.start), [200, 205, 210, 215]) // 20s / 4 words
})

test('empty segments produce an empty (gap) line', () => {
  const line = stitchChunk(5, [], { startSec: 300, endSec: 330 }, 0)
  assert.equal(line.raw, '')
  assert.deepEqual(line.words, [])
})

test('lastWordStart advances the running monotonic cursor', () => {
  const line = stitchChunk(6, [seg('א', [['א', 1, 2]])], { startSec: 10, endSec: 40 }, 0)
  assert.equal(lastWordStart(line, 0), 11)
  const gap = stitchChunk(7, [], { startSec: 40, endSec: 70 }, 11)
  assert.equal(lastWordStart(gap, 11), 11) // gap keeps the cursor
})

test('captionOnTime enforces the buffer budget with margin', () => {
  assert.equal(captionOnTime(0, 65, 300), true) // ready 65s ≤ 0+300−60
  assert.equal(captionOnTime(0, 250, 300), false) // too late
  assert.equal(captionOnTime(100, 330, 300), true) // 330 ≤ 100+300−60
})

test('REAL FIXTURE: spike response stitches to non-decreasing words covering the chunk', () => {
  const raw = JSON.parse(fs.readFileSync('scripts/fixtures/ivrit-live-spike.json', 'utf8'))
  const segments = parseIvritSegments(raw)
  assert.ok(segments.length > 0, 'fixture parses to segments')
  const line = stitchChunk(1, segments, { startSec: 60, endSec: 95 }, 0)
  assert.ok(line.words.length >= 20, `real 35s chunk should have many words, got ${line.words.length}`)
  for (let i = 1; i < line.words.length; i++)
    assert.ok(line.words[i].start >= line.words[i - 1].start, `word ${i} goes backwards`)
  assert.ok(line.words[0].start >= 60 && line.words[line.words.length - 1].start <= 95)
  // coverage: words span most of the speech chunk
  const span = line.words[line.words.length - 1].start - line.words[0].start
  assert.ok(span >= 0.6 * 35, `words span ${span}s of a 35s chunk`)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/live/ivritStitcher.test.ts`
Expected: FAIL — cannot find module `./ivritStitcher`.

- [ ] **Step 3: Implement**

```ts
// src/lib/live/ivritStitcher.ts
// Chunk-relative IVRIT word times → one stream-relative, non-decreasing caption timeline.
// Pure; the engine owns ids, offsets and the running prevMaxStart cursor.
import type { IvritSegment } from './syncEngine'

export interface LiveWord { text: string; start: number }
export interface LiveLine {
  id: number
  raw: string
  words: LiveWord[]
  chunkStartSec: number
  chunkEndSec: number
  fallbackTiming?: boolean
  failed?: boolean
}

export function stitchChunk(
  id: number,
  segments: IvritSegment[],
  chunk: { startSec: number; endSec: number },
  prevMaxStart: number
): LiveLine {
  const raw = segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim()
  const ivritWords = segments.flatMap((s) => s.words)

  let words: LiveWord[]
  let fallbackTiming: boolean | undefined
  if (ivritWords.length > 0) {
    let cursor = prevMaxStart
    words = ivritWords.map((w) => {
      const abs = Math.min(chunk.startSec + w.start, chunk.endSec)
      cursor = Math.max(cursor, abs)
      return { text: w.word, start: cursor }
    })
  } else if (raw) {
    // IVRIT gave text but no timings (seen occasionally): spread words evenly, flag the line.
    const toks = raw.split(/\s+/)
    const step = (chunk.endSec - chunk.startSec) / toks.length
    let cursor = prevMaxStart
    words = toks.map((text, i) => {
      cursor = Math.max(cursor, chunk.startSec + i * step)
      return { text, start: cursor }
    })
    fallbackTiming = true
  } else {
    words = []
  }

  return { id, raw, words, chunkStartSec: chunk.startSec, chunkEndSec: chunk.endSec, fallbackTiming }
}

/** The monotonic cursor after this line: last word start, or carried prevMaxStart for gap lines. */
export function lastWordStart(line: LiveLine, prevMaxStart: number): number {
  return line.words.length ? line.words[line.words.length - 1].start : prevMaxStart
}

/** Caption for a chunk must exist before delayed viewers reach the chunk's start. */
export function captionOnTime(
  chunkStartSec: number,
  readyAtSec: number,
  bufferSec: number,
  marginSec = 60
): boolean {
  return readyAtSec <= chunkStartSec + bufferSec - marginSec
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/live/ivritStitcher.test.ts`
Expected: PASS (8 tests, incl. the real-fixture one).

- [ ] **Step 5: Register in the suite and commit**

Append ` src/lib/live/ivritStitcher.test.ts` to `package.json`'s `"test"` line. Then:

```bash
npm test
git add src/lib/live/ivritStitcher.ts src/lib/live/ivritStitcher.test.ts package.json
git commit -m "feat(ivrit-live): stitcher — chunk words to a monotonic stream timeline"
```

---

### Task 6: The engine — `scripts/live-ivrit-broadcast.ts`

**Files:**
- Create: `scripts/live-ivrit-broadcast.ts`

**Interfaces:**
- Consumes: `PcmChunker` (Task 4), `stitchChunk`/`lastWordStart`/`captionOnTime` (Task 5), `pcmToWav` (Task 1), `parseIvritSegments` (Task 3), `transcribeWav` (Task 2).
- Produces: HTTP on :8788 — `/state` returning `{ audioStartRel, liveEdgeRel, liveEnded, endedAt, sampleRate, lines }` and `/pcm?from=&to=` returning s16le bytes — byte-compatible with `live-broadcast.mjs` (the app's `/api/live/*` proxies and the karaoke page work unchanged). WS intake at `/ws` accepting Recall `audio_mixed_raw.data` messages. Writes `scripts/out/ivrit-lines.jsonl` (own filename — never truncates the Recall engine's `broadcast-*` files).

- [ ] **Step 1: Claim :8788 on the fleet log**

```bash
echo "[2026-07-03] Lane I CLAIMS :8788 (live engine) for ivrit pipeline test runs — will release when /verify-app pass completes" >> C:/Users/Sagi/Desktop/Atlas/agent-memory/cross-cutting.md
```

- [ ] **Step 2: Write the engine**

```ts
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
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
if (!runpodOpts.apiKey || !runpodOpts.endpointId) throw new Error('RUNPOD_API_KEY / RUNPOD_IVRIT_ENDPOINT_ID missing')

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
  return wallStartMs === null || audioStartRel === null ? 0 : audioStartRel + (Date.now() - wallStartMs) / 1000
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
        try { output = await transcribeWav(pcmToWav(chunk.pcm), runpodOpts); lastErr = null; break }
        catch (e) { lastErr = e as Error; console.warn(`[job] chunk@${chunk.startSec.toFixed(0)}s attempt ${attempt} failed: ${lastErr.message}`) }
      }
      if (lastErr) throw lastErr
      line = stitchChunk(nextId++, parseIvritSegments(output), streamChunk, prevMaxStart)
    } catch (e) {
      // A failed chunk is a logged gap, never a stall.
      console.error(`[job] chunk@${chunk.startSec.toFixed(0)}s GAP after retries: ${(e as Error).message}`)
      line = { id: nextId++, raw: '', words: [], chunkStartSec: streamChunk.startSec, chunkEndSec: streamChunk.endSec, failed: true }
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
  console.log(`[status] audio=${edge === null ? 'NOT STARTED' : (edge - (audioStartRel ?? 0)).toFixed(0) + 's'} | lines=${lines.length} | queue=${jobQueue.length}${liveEnded ? ' | SOURCE ENDED' : ''}`)
}, 30_000)

// ---- HTTP: same contract as live-broadcast.mjs ----
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  if (url.pathname === '/state') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ audioStartRel, liveEdgeRel: liveEdgeRel(), liveEnded, endedAt, sampleRate: SAMPLE_RATE, lines }))
    return
  }
  if (url.pathname === '/pcm') {
    const from = Number(url.searchParams.get('from'))
    const to = Number(url.searchParams.get('to'))
    if (audioStartRel === null || !isFinite(from) || !isFinite(to) || to <= from) { res.writeHead(416).end(); return }
    const startByte = Math.max(0, Math.round((from - audioStartRel) * SAMPLE_RATE) * 2)
    const endByte = Math.min(pcmBytes, Math.round((to - audioStartRel) * SAMPLE_RATE) * 2)
    if (endByte <= startByte) { res.writeHead(204).end(); return }
    const all = Buffer.concat(pcmChunks, pcmBytes)
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'x-from-rel': String(Math.max(from, audioStartRel)) })
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
    } catch { /* ignore malformed frames */ }
  })
  sock.on('close', () => {
    console.log('[audio] websocket closed — source ended, flushing tail chunk')
    liveEnded = true
    if (endedAt === null) endedAt = Date.now()
    const tail = chunker.flush()
    if (tail) { jobQueue.push(tail); void processQueue() }
  })
})

server.listen(PORT, () => console.log(`live-ivrit-broadcast on http://localhost:${PORT} (model=${runpodOpts.model}, buffer=${BUFFER_SEC}s)`))
```

- [ ] **Step 3: Typecheck and boot-smoke**

Run: `npx tsc --noEmit` — expected: clean.
Run: `node --import tsx scripts/live-ivrit-broadcast.ts` (background), then `curl -s http://localhost:8788/state` — expected: `{"audioStartRel":null,"liveEdgeRel":null,"liveEnded":false,"endedAt":null,"sampleRate":16000,"lines":[]}`. Kill the engine.

- [ ] **Step 4: Commit**

```bash
git add scripts/live-ivrit-broadcast.ts
git commit -m "feat(ivrit-live): engine — audio ws -> chunker -> runpod -> stitched /state lines"
```

---

### Task 7: Replay feeder + end-to-end smoke

**Files:**
- Create: `scripts/replay-audio-feeder.mjs`

**Interfaces:**
- Consumes: the engine's `/ws` endpoint (Task 6); archived PCM (Global Constraints path).
- Produces: Recall-format `audio_mixed_raw.data` ws messages at `REPLAY_SPEED`× realtime — the no-Zoom stand-in for a live call.

- [ ] **Step 1: Write the feeder**

```js
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
```

- [ ] **Step 2: End-to-end smoke (fast, ~90s wall)**

Terminal A: `node --import tsx scripts/live-ivrit-broadcast.ts`
Terminal B: `REPLAY_SPEED=8 node scripts/replay-audio-feeder.mjs` (387s of audio in ~48s; the FIFO drains after).
Wait for the feeder to finish and the engine queue to empty, then:
`curl -s http://localhost:8788/state | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);console.log('lines',s.lines.length,'ended',s.liveEnded);const w=s.lines.flatMap(l=>l.words);console.log('words',w.length,'monotonic',w.every((x,i)=>i===0||x.start>=w[i-1].start),'first',w[0]?.start,'last',w[w.length-1]?.start)})"`
Expected: `lines` ≥ 9 (387s / 45s max), `ended true`, `words` in the hundreds, `monotonic true`, first ≈ 10–15, last ≤ 397. (At 8× the `LATE vs buffer` log lines are meaningless — wall clock outruns stream time by design; ignore them in this run.)

- [ ] **Step 3: Keep the run's outputs**

```bash
mkdir -p scripts/out/sessions/2026-07-03-ivrit-smoke
cp scripts/out/ivrit-lines.jsonl scripts/out/sessions/2026-07-03-ivrit-smoke/
```

- [ ] **Step 4: Commit**

```bash
git add scripts/replay-audio-feeder.mjs
git commit -m "feat(ivrit-live): replay feeder — archived pcm as recall ws messages"
```

---

### Task 8: Quality comparison vs Recall captions

**Files:**
- Create: `scripts/compare-live-quality.ts`

**Interfaces:**
- Consumes: `scripts/out/ivrit-lines.jsonl` (Task 7 full-archive run) and the archive's `broadcast-lines.jsonl` (Recall); `tokenize`, `lcsGoldMatched` from `scripts/lib/measure-core` (existing, already tested).
- Produces: printed agreement stats for the board. (No gold transcript exists — this measures IVRIT↔Recall agreement + where they diverge; the human quality read is Task 9's eyes + later /transcript-review.)

- [ ] **Step 1: Write the comparator**

```ts
// scripts/compare-live-quality.ts — IVRIT-pipeline transcript vs Recall captions, same audio.
// Run: node --import tsx scripts/compare-live-quality.ts
import fs from 'fs'
import { tokenize, lcsGoldMatched } from './lib/measure-core'

const OURS = process.env.OURS || 'scripts/out/ivrit-lines.jsonl'
const RECALL = process.env.RECALL || 'C:/Users/Sagi/Desktop/Atlas/scripts/out/sessions/2026-07-01-tamis-live/broadcast-lines.jsonl'

const readLines = (p: string) => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
const ourText = readLines(OURS).map((l: { raw: string }) => l.raw).join(' ')
const recallText = readLines(RECALL).map((l: { raw: string }) => l.raw).join(' ')

const a = tokenize(ourText)
const g = tokenize(recallText)
const inBoth = lcsGoldMatched(a, g).filter(Boolean).length
console.log(`IVRIT tokens: ${a.length} | Recall tokens: ${g.length} | LCS overlap: ${inBoth}`)
console.log(`agreement vs Recall: ${((100 * inBoth) / g.length).toFixed(1)}% | vs ours: ${((100 * inBoth) / a.length).toFixed(1)}%`)

// show the first 10 disagreement windows for the human read
const matched = lcsGoldMatched(a, g)
let shown = 0
for (let i = 0; i < g.length && shown < 10; i++) {
  if (!matched[i]) {
    console.log(`  recall-only @${i}: …${g.slice(Math.max(0, i - 3), i + 4).join(' ')}…`)
    shown++
  }
}
```

- [ ] **Step 2: Run it on the Task 7 full-archive output**

Run: `node --import tsx scripts/compare-live-quality.ts`
Expected: token counts of the same order of magnitude, agreement percentages printed, 10 divergence windows for eyeballing. Interpretation note: disagreement is not automatically our error — Recall's raw captions have their own mistakes; skim the windows and judge.

- [ ] **Step 3: Report the delta on the board and commit**

Update the Lane I section of `C:/Users/Sagi/Desktop/Atlas/agent-memory/BOARD.md` with the numbers (tokens, agreement %, subjective read of the divergence windows). Then:

```bash
git add scripts/compare-live-quality.ts
git commit -m "feat(ivrit-live): quality comparator vs recall captions"
```

---

### Task 9: /verify-app — watch the karaoke with your own eyes

**Files:** none (verification only).

- [ ] **Step 1: Boot the full stack at realtime with a short buffer**

Terminal A: `node --import tsx scripts/live-ivrit-broadcast.ts`
Terminal B: `node scripts/replay-audio-feeder.mjs` (SPEED=1, realtime)
Terminal C: `NEXT_PUBLIC_LIVE_BUFFER_SEC=60 npm run dev -- -p 3002` (buffer inlined at dev start per live rules; 60s so the karaoke is watchable ~1 min in)

- [ ] **Step 2: Run the /verify-app skill (ivrit-pipeline recipe)**

Invoke `/verify-app`: Chrome MCP to the live view on `localhost:3002`, join the broadcast after the 60s buffer fills, and confirm with screenshots: karaoke words highlight in sync with audible speech (current word white, upcoming gray), RTL rendering correct, zero console errors, drift stays within the buffer budget over several minutes mid-replay. Hard-refresh after any dev restart (stale-bundle gotcha).

- [ ] **Step 3: Release :8788 and file the evidence**

```bash
echo "[2026-07-03] Lane I RELEASES :8788 — ivrit pipeline /verify-app pass complete" >> C:/Users/Sagi/Desktop/Atlas/agent-memory/cross-cutting.md
```

Update the board's Lane I `last verified:` with what was seen (screenshots referenced).

---

### Task 10: Ship Milestone 1

- [ ] **Step 1: Full battery**

Run: `npm test` (all green) · `npx tsc --noEmit` (clean) · `npm run build` (passes).

- [ ] **Step 2: /ship**

Invoke the `/ship` skill: sync main, verification battery, push `feat/ivrit-pipeline`, APPEND the review request to `C:/Users/Sagi/Desktop/Atlas/agent-memory/ready-queue.md`. Never push main.

- [ ] **Step 3: Close the loop on the board + state file**

Update Lane I board section (status → M1 shipped to review queue; next → M2 candidates: Gemini correction layer, diarization, real-Zoom run) and `agent-memory/state-ivrit.md` (facts learned: real RunPod latencies, blob-vs-url verdict, agreement numbers).
