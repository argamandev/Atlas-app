# Live Transcript Phase 1 (finish hand-off) Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, this session).
> Steps use checkbox (`- [ ]`) syntax. **COMMITS ARE DEFERRED** — build into the working tree; do
> NOT `git commit` (founder reviews the tree in the morning; the tree has prior uncommitted work).

**Goal:** Turn the recorded live תמיס session into a normal finished `transcripts` row so the
existing finished page (`/app/live/[id]`) renders it with synced-audio karaoke + the full toolbar.

**Architecture:** A reusable `finishLiveCall` module — pure, unit-tested transforms (normalize words,
synthesize word-ends, build `word_segments`, duration, PCM byte length) + orchestration (PCM→MP3 via
the bundled ffmpeg, upload to `audio-temp`, Gemini polish via the existing `formatTranscript`, upsert
a completed row). A thin runner script feeds the recorded session through it. No IVRIT, no YouTube,
no live ingestion.

**Tech Stack:** TypeScript, Node 24 + `tsx`, `node:test`, `fluent-ffmpeg` + `@ffmpeg-installer/ffmpeg`,
`@supabase/supabase-js` (service role), Gemini 3.5 Flash (reused).

---

### Task 1: Pure transforms + unit tests (TDD)

**Files:**
- Create: `src/lib/live/finishLiveCall.ts` (transforms only in this task)
- Test: `src/lib/live/finishLiveCall.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/live/finishLiveCall.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeFeedWords, synthesizeWordEnds, buildWordSegments, feedDurationSec, pcmByteLength,
  type FeedWord,
} from './finishLiveCall'

test('normalizeFeedWords passes a monotonic stream through unchanged', () => {
  const w: FeedWord[] = [{ text: 'a', start: 1 }, { text: 'b', start: 2 }, { text: 'c', start: 5 }]
  assert.equal(normalizeFeedWords(w).length, 3)
})

test('normalizeFeedWords cuts at a session reset (big backward jump)', () => {
  const w: FeedWord[] = [{ text: 'a', start: 100 }, { text: 'b', start: 200 }, { text: 'x', start: 0.25 }]
  assert.deepEqual(normalizeFeedWords(w).map(x => x.text), ['a', 'b'])
})

test('normalizeFeedWords tolerates small non-monotonic jitter (< reset threshold)', () => {
  const w: FeedWord[] = [{ text: 'a', start: 10 }, { text: 'b', start: 9.7 }, { text: 'c', start: 11 }]
  assert.equal(normalizeFeedWords(w).length, 3)
})

test('normalizeFeedWords handles empty', () => {
  assert.deepEqual(normalizeFeedWords([]), [])
})

test('synthesizeWordEnds fills end from next start, last from tailPad', () => {
  const w: FeedWord[] = [{ text: 'a', start: 1 }, { text: 'b', start: 3 }]
  const out = synthesizeWordEnds(w, 0.5)
  assert.deepEqual(out, [{ word: 'a', start: 1, end: 3 }, { word: 'b', start: 3, end: 3.5 }])
})

test('synthesizeWordEnds respects a provided end', () => {
  const out = synthesizeWordEnds([{ text: 'a', start: 1, end: 2 }], 0.5)
  assert.equal(out[0].end, 2)
})

test('buildWordSegments makes one null-speaker segment with joined text', () => {
  const segs = buildWordSegments([{ text: 'שלום', start: 1 }, { text: 'עולם', start: 2 }], 0.5)
  assert.equal(segs.length, 1)
  assert.equal(segs[0].speaker, null)
  assert.equal(segs[0].words.length, 2)
  assert.equal(segs[0].text, 'שלום עולם')
  assert.equal(segs[0].start, 1)
})

test('feedDurationSec returns last end (synthesized from tailPad)', () => {
  assert.equal(feedDurationSec([{ text: 'a', start: 1 }, { text: 'b', start: 4 }], 0.5), 4.5)
})

test('pcmByteLength is sample-aligned bytes for S16LE mono', () => {
  assert.equal(pcmByteLength(1, 16000, 2), 32000)
  assert.equal(pcmByteLength(0, 16000, 2), 0)
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `node --import tsx --test src/lib/live/finishLiveCall.test.ts`
Expected: FAIL — `Cannot find module './finishLiveCall'` / exports undefined.

- [ ] **Step 3: Implement the transforms**

```ts
// src/lib/live/finishLiveCall.ts  (transforms section)
import type { IvritWord, IvritSegment } from './syncEngine'

/** One word from the normalized live feed. `end`/`speaker` optional (degrades gracefully). */
export interface FeedWord {
  text: string
  start: number
  end?: number
  speaker?: string | null
}

/**
 * Keep the first contiguous capture session: drop everything after the first large backward
 * jump in `start` (a concatenated second session resets to ~0). Tolerates minor jitter below
 * `resetDropSec`. Pure.
 */
export function normalizeFeedWords(words: FeedWord[], resetDropSec = 5): FeedWord[] {
  if (words.length === 0) return []
  const out: FeedWord[] = [words[0]]
  for (let i = 1; i < words.length; i++) {
    if (words[i - 1].start - words[i].start > resetDropSec) break
    out.push(words[i])
  }
  return out
}

/** Give each word an `end`: the next word's start, or `start + tailPad` for the last/edge cases. */
export function synthesizeWordEnds(words: FeedWord[], tailPad = 0.5): IvritWord[] {
  return words.map((w, i) => {
    const next = words[i + 1]
    const end = w.end != null ? w.end : next && next.start > w.start ? next.start : w.start + tailPad
    return { word: w.text, start: w.start, end }
  })
}

/**
 * Build `word_segments` (IvritSegment[]) for a no-diarization feed: one segment, speaker=null.
 * Gemini's formatted_data drives the speaker turns proportionally at load
 * (`buildFromIvritWithGeminiNames`). Pure.
 */
export function buildWordSegments(words: FeedWord[], tailPad = 0.5): IvritSegment[] {
  if (words.length === 0) return []
  const iwords = synthesizeWordEnds(words, tailPad)
  return [{
    text: iwords.map(w => w.word).join(' '),
    start: iwords[0].start,
    end: iwords[iwords.length - 1].end,
    speaker: null,
    words: iwords,
  }]
}

/** Captured span in seconds (last word's end). Pure. */
export function feedDurationSec(words: FeedWord[], tailPad = 0.5): number {
  if (words.length === 0) return 0
  const last = words[words.length - 1]
  return last.end ?? last.start + tailPad
}

/** Sample-aligned PCM byte length for trimming. bytesPerFrame = 2 (S16LE) * channels. Pure. */
export function pcmByteLength(durationSec: number, sampleRate = 16000, bytesPerFrame = 2): number {
  return Math.max(0, Math.floor(durationSec * sampleRate) * bytesPerFrame)
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `node --import tsx --test src/lib/live/finishLiveCall.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Leave in working tree (no commit).**

---

### Task 2: Orchestration (encode → upload → Gemini → upsert)

**Files:**
- Modify: `src/lib/live/finishLiveCall.ts` (append orchestration below the transforms)

- [ ] **Step 1: Append imports + I/O helpers + `finishLiveCall`**

```ts
// src/lib/live/finishLiveCall.ts  (append below the transforms)
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from '@ffmpeg-installer/ffmpeg'
import { supabaseAdmin } from '@/lib/supabase'
import { formatTranscript, formatDuration } from '@/lib/transcription'

ffmpeg.setFfmpegPath(ffmpegPath.path)

function encodePcmToMp3(
  pcmPath: string, outMp3: string, sampleRate: number, channels: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(pcmPath)
      .inputOptions(['-f', 's16le', '-ar', String(sampleRate), '-ac', String(channels)])
      .audioCodec('libmp3lame')
      .audioBitrate('32k')
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(outMp3)
  })
}

async function uploadMp3(mp3Path: string): Promise<string> {
  const fileName = `live_finish_${Date.now()}_${path.basename(mp3Path)}`
  const buf = fs.readFileSync(mp3Path)
  const { error } = await supabaseAdmin.storage
    .from('audio-temp')
    .upload(fileName, buf, { contentType: 'audio/mpeg', upsert: true })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  const { data } = supabaseAdmin.storage.from('audio-temp').getPublicUrl(fileName)
  return data.publicUrl
}

export interface FinishInput {
  callId: string                    // synthetic transcripts id (idempotent upsert key)
  companyTicker?: string | null     // links company_id via companies.tase_security_id
  companyName: string               // header + Gemini context
  quarter: string                   // e.g. "Q1 2026"
  rawText: string                   // fed to Gemini
  words: FeedWord[]                 // feed words -> word_segments (karaoke)
  pcmPath: string
  sampleRate?: number               // default 16000
  channels?: number                 // default 1
  userId: string
  tailPad?: number                  // default 0.5
}

export interface FinishResult {
  id: string; url: string; audioUrl: string; durationSec: number; wordCount: number
}

/** Phase 1 spine: ended live call -> finished transcripts row (renderable by LiveTranscriptView). */
export async function finishLiveCall(input: FinishInput): Promise<FinishResult> {
  const sampleRate = input.sampleRate ?? 16000
  const channels = input.channels ?? 1
  const tailPad = input.tailPad ?? 0.5

  const words = normalizeFeedWords(input.words)
  if (words.length === 0) throw new Error('finishLiveCall: no words after normalization')
  const segments = buildWordSegments(words, tailPad)
  const durationSec = feedDurationSec(words, tailPad)

  // 1. trim captured PCM to the span, encode to mp3, upload
  const pcm = fs.readFileSync(input.pcmPath)
  const wantBytes = pcmByteLength(durationSec, sampleRate, 2 * channels)
  const trimmed = pcm.subarray(0, Math.min(pcm.length, wantBytes))
  const tmpPcm = path.join(os.tmpdir(), `finish_${input.callId}_${Date.now()}.pcm`)
  const tmpMp3 = `${tmpPcm}.mp3`
  fs.writeFileSync(tmpPcm, trimmed)
  try {
    await encodePcmToMp3(tmpPcm, tmpMp3, sampleRate, channels)
    var audioUrl = await uploadMp3(tmpMp3)
  } finally {
    if (fs.existsSync(tmpPcm)) fs.unlinkSync(tmpPcm)
    if (fs.existsSync(tmpMp3)) fs.unlinkSync(tmpMp3)
  }

  // 2. Gemini polish — same formatter as the IVRIT path. Title yields company+quarter.
  const title = `${input.companyName} ${input.quarter}`.trim()
  const formatted = await formatTranscript(input.rawText, input.callId, title, {
    engine: 'recall-live', model: 'live-finish',
  })
  const durationStr = formatDuration(Math.round(durationSec))
  formatted.duration = durationStr

  // 3. resolve company_id from the ticker (optional)
  let companyId: string | null = null
  if (input.companyTicker) {
    const { data } = await supabaseAdmin
      .from('companies').select('id').eq('tase_security_id', input.companyTicker).maybeSingle()
    companyId = (data?.id as string) ?? null
  }

  // 4. upsert the completed row (idempotent on id)
  const { error } = await supabaseAdmin.from('transcripts').upsert({
    id: input.callId,
    youtube_url: `live://${input.callId}`,
    youtube_title: title,
    status: 'completed',
    processing_step: 'completed',
    user_id: input.userId,
    company_id: companyId,
    raw_transcript: input.rawText,
    formatted_data: formatted,
    audio_url: audioUrl,
    word_segments: segments,
    duration: durationStr,
  }, { onConflict: 'id' })
  if (error) throw new Error(`transcripts upsert failed: ${error.message}`)

  return { id: input.callId, url: `/app/live/${input.callId}`, audioUrl, durationSec, wordCount: words.length }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `finishLiveCall.ts`.

- [ ] **Step 3: Re-run the pure tests (still green)**

Run: `node --import tsx --test src/lib/live/finishLiveCall.test.ts`
Expected: PASS (9 tests) — orchestration imports must not break the transform tests.

- [ ] **Step 4: Leave in working tree (no commit).**

---

### Task 3: Runner script

**Files:**
- Create: `scripts/finish-live-call.ts`

- [ ] **Step 1: Write the runner**

```ts
// scripts/finish-live-call.ts
// Run: node --env-file=.env.local --import tsx scripts/finish-live-call.ts
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { finishLiveCall, normalizeFeedWords, type FeedWord } from '../src/lib/live/finishLiveCall'
import { DEMO_USER_ID } from '../src/lib/api/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SESS = path.join(ROOT, 'scripts', 'out', 'sessions')
const JSONL = path.join(SESS, 'tamis-2026-06-14.jsonl')
const PCM = path.join(SESS, 'tamis-2026-06-14.pcm')

interface Rec { id: number; raw: string; corrected: string | null; words: { text: string; start: number; rawText?: string }[] }

function readRecords(): Rec[] {
  return fs.readFileSync(JSONL, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as Rec)
}

async function main() {
  const recs = readRecords()
  const allWords: FeedWord[] = recs.flatMap((r) => r.words.map((w) => ({ text: w.text, start: w.start })))
  const sessionWords = normalizeFeedWords(allWords) // single source of truth for the session cut

  // Derive the matching raw text: the records covering the first sessionWords.length words.
  let covered = 0
  const sessRecs: Rec[] = []
  for (const r of recs) {
    if (covered >= sessionWords.length) break
    sessRecs.push(r)
    covered += r.words.length
  }
  const rawText = sessRecs.map((r) => r.raw).join('\n\n')
  console.log(`[finish] ${sessRecs.length}/${recs.length} records (first session), ${sessionWords.length} words`)

  const res = await finishLiveCall({
    callId: 'live-finish-demo-tamis-2026-06-14',
    companyTicker: '1097229', // תמיס
    companyName: 'תמיס',
    quarter: 'Q1 2026',
    rawText,
    words: sessionWords,
    pcmPath: PCM,
    sampleRate: 16000,
    channels: 1,
    userId: DEMO_USER_ID,
  })
  console.log(`[finish] DONE -> ${res.url}`)
  console.log(`[finish] audio=${res.audioUrl}  dur=${Math.round(res.durationSec)}s  words=${res.wordCount}`)
}

main().catch((e) => { console.error('[finish] FAILED:', e); process.exit(1) })
```

- [ ] **Step 2: Typecheck the script**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms `DEMO_USER_ID` is exported from `@/lib/api/types` and the import path resolves.)

- [ ] **Step 3: Leave in working tree (no commit).**

---

### Task 4: Wire the test into `npm test` + full verification

**Files:**
- Modify: `package.json:9` (append the new test file to the `test` script)

- [ ] **Step 1: Append the test file**

Change the `"test"` script to:

```json
"test": "node --import tsx --test src/lib/correction.test.ts scripts/lib/measure-core.test.ts src/lib/live/finishLiveCall.test.ts"
```

- [ ] **Step 2: Run the whole test suite**

Run: `npm test`
Expected: all suites PASS (existing + 9 new).

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit` then `npx next build`
Expected: `tsc` clean; `next build` green (the new lib must not break the app bundle — it's only imported by a script + lazily by nothing in the client).

- [ ] **Step 4: Leave in working tree (no commit).**

---

### Task 5: Execute the finish against the recording (create the demo row)

- [ ] **Step 1: Run the pipeline**

Run: `node --env-file=.env.local --import tsx scripts/finish-live-call.ts`
Expected output (shape):
```
[finish] 3/7 records (first session), 759 words
[format] Gemini output: NNNN chars
[format] parsed NN lines (mgmt: NN, qa: NN)
[finish] DONE -> /app/live/live-finish-demo-tamis-2026-06-14
[finish] audio=https://....supabase.co/storage/v1/object/public/audio-temp/live_finish_....mp3  dur=~Ns  words=759
```

- [ ] **Step 2: Verify the row + audio**

Run a check (tsx one-off or `node --env-file`): select the row's `status`, `audio_url`, and
`word_segments` length; HTTP HEAD the `audio_url` for `200` + `audio/mpeg`. Expected: status
`completed`, audio reachable, `word_segments[0].words.length === 759`.

- [ ] **Step 3: Confirm it renders** — `loadCompletedCall('live-finish-demo-tamis-2026-06-14')`
returns a `LiveCall` with `audioUrl` set, `transcript.hasWordTimings === true`, and ≥1 segment.

---

### Task 6: Review + PROGRESS

- [ ] **Step 1:** Dispatch the cold-context `reviewer` agent over the new files for security +
correctness. Fix any real findings.
- [ ] **Step 2:** Update `PROGRESS.md` top block to **"Phase 1 executed — awaiting admin test"**
with the demo URL, decisions taken, verification results, and morning test steps. Update `CLAUDE.md`
roadmap note for Core 3 (live→finished wired). Leave in working tree (no commit).

---

## Self-Review

**Spec coverage:** §5 (finish pipeline) → Tasks 1-3,5. §8 (file map) → Tasks 1-3. "What Phase 1
checks" → Task 5 + the morning test. Phase 2 / ingestion adapters / live UX chrome → explicitly NOT
in this plan (spec §6-§7 non-goals). Covered.

**Placeholder scan:** every code step has full code; commands have expected output. Task 5 Step 2
describes a check rather than fixed code — acceptable (it's a verification probe, exact values
depend on the run), but the assertions are concrete (`status==='completed'`, `words.length===759`).

**Type consistency:** `FeedWord`, `IvritWord`/`IvritSegment` (from `syncEngine`), `FinishInput`,
`FinishResult`, `finishLiveCall`, `normalizeFeedWords` used identically across Tasks 1-3. `formatTranscript`
/ `formatDuration` / `DEMO_USER_ID` / `supabaseAdmin` match their real signatures (verified in source).
