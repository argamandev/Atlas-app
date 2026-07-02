# Transcription Resilience Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the finished-transcript pipeline from discarding a successful IVRIT transcription when the formatter (Gemini) hits a transient outage, default IVRIT to the accurate model, and make failed/retried calls cheap to re-run.

**Architecture:** Two files do the work. `src/lib/transcription.ts` gets (a) accurate-model-first IVRIT with a turbo fallback, and (b) a hardened Gemini call that falls back to GPT-4.1, both feeding the same markdown parser. `src/app/api/transcripts/route.ts` persists the transcript+timings+audio *before* formatting and adds a reformat-only path that skips download+transcription on retry.

**Tech Stack:** TypeScript, Next.js 14 route handlers, Supabase (`supabaseAdmin`), OpenAI SDK (`openai`, already installed, reuses `OPENAI_API_KEY`), Gemini REST, Node built-in test runner via `tsx`.

**Verification note:** End-to-end runs cost RunPod/Gemini/OpenAI calls and need a real video, so they are **not** run during implementation — they are the manual step in the spec's Testing section, done with Sagi after merge. Automated gates here are `npx tsc --noEmit` (type safety) and `npm test` (the parser contract).

---

### Task 1: Lock the GPT↔parser contract with a test

The GPT-4.1 fallback must emit markdown that the existing `parseGeminiOutput` reads identically. Pin that with a test. `parseGeminiOutput` is currently module-private — export it.

**Files:**
- Modify: `src/lib/transcription.ts` (export `parseGeminiOutput`)
- Create: `src/lib/transcription.test.ts`
- Modify: `package.json` (add the new test file to the `test` script)

- [ ] **Step 1: Export the parser**

In `src/lib/transcription.ts`, change the declaration (currently around line 405):

```ts
// from:
function parseGeminiOutput(
// to:
export function parseGeminiOutput(
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/transcription.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGeminiOutput } from './transcription'

test('parseGeminiOutput parses ## Name headers (GPT-4.1 fallback format)', () => {
  const md = `## דנה כהן

שלום לכולם וברוכים הבאים לשיחת המשקיעים. נתחיל בסקירת הרבעון.

## יוסי לוי

תודה דנה. ההכנסות צמחו ב-12 אחוז ברבעון.`
  const { mgmtLines, qaLines, speakers } = parseGeminiOutput(md, [])
  assert.equal(speakers.length, 2)
  assert.equal(speakers[0].name, 'דנה כהן')
  assert.equal(mgmtLines.length, 2)
  assert.equal(mgmtLines[0].speakerId, speakers[0].id)
  assert.equal(qaLines.length, 0)
})

test('parseGeminiOutput parses **Name:** headers too', () => {
  const md = `**דנה כהן:**

פסקה ראשונה של דנה.`
  const { mgmtLines, speakers } = parseGeminiOutput(md, [])
  assert.equal(speakers.length, 1)
  assert.equal(speakers[0].name, 'דנה כהן')
  assert.equal(mgmtLines.length, 1)
})
```

- [ ] **Step 3: Wire the test into `npm test`**

In `package.json`, update the `test` script to include the new file:

```json
"test": "node --import tsx --test src/lib/correction.test.ts src/lib/transcription.test.ts scripts/lib/measure-core.test.ts"
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all tests PASS, including the two new `parseGeminiOutput` tests. (If the import had failed because the export was missing, this is where it would surface.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/transcription.ts src/lib/transcription.test.ts package.json
git commit -m "test(transcription): pin GPT-4.1 markdown → parseGeminiOutput contract"
```

---

### Task 2: IVRIT accurate model by default, turbo as fallback

**Files:**
- Modify: `src/lib/transcription.ts` (model constants, `runIvritJob`, `transcribeWithIvrit`, `transcribeAudio`)

- [ ] **Step 1: Update the model constants**

Replace the single constant (currently line 18):

```ts
const IVRIT_MODEL = process.env.RUNPOD_IVRIT_MODEL || 'ivrit-ai/whisper-large-v3-ct2'
const IVRIT_FALLBACK_MODEL = 'ivrit-ai/whisper-large-v3-turbo-ct2'
```

- [ ] **Step 2: Parameterize `runIvritJob` by model**

Change the signature and body (currently around line 140):

```ts
async function runIvritJob(transcribeArgs: Record<string, unknown>, model: string): Promise<unknown> {
  const runRes = await fetch(`https://api.runpod.ai/v2/${RUNPOD_IVRIT_ENDPOINT_ID}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RUNPOD_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { model, streaming: false, transcribe_args: transcribeArgs } }),
  })
  if (!runRes.ok) throw new Error(`RunPod submit failed ${runRes.status}: ${await runRes.text()}`)
  const { id: jobId } = (await runRes.json()) as { id: string }
  console.log(`[ivrit] job submitted: ${jobId}`)

  const maxWaitMs = 30 * 60 * 1000
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 5000))
    const statusRes = await fetch(`https://api.runpod.ai/v2/${RUNPOD_IVRIT_ENDPOINT_ID}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
    })
    if (!statusRes.ok) continue
    const status = (await statusRes.json()) as { status: string; output?: unknown; error?: unknown }
    console.log(`[ivrit] status: ${status.status}`)
    if (status.status === 'COMPLETED') return status.output
    if (status.status === 'FAILED') throw new Error(`RunPod job failed: ${JSON.stringify(status.error)}`)
  }
  throw new Error('IVRIT transcription timed out after 30 minutes')
}
```

- [ ] **Step 3: Split `transcribeWithIvrit` into a per-model attempt + accurate→turbo wrapper**

Replace the whole `transcribeWithIvrit` function (currently around line 239–271) with:

```ts
// Run the rich→plain attempts against ONE model. Throws if both yield nothing.
async function ivritTranscribeWithModel(publicUrl: string, model: string): Promise<{ text: string; segments?: IvritSegment[] }> {
  // Attempt 1: rich request — per-word timestamps (+ optional diarization).
  try {
    const output = await runIvritJob({
      url: publicUrl,
      language: 'he',
      ...(IVRIT_DIARIZE ? { diarize: true } : {}),
      output_options: { word_timestamps: true, extra_data: true },
    }, model)
    console.log(`[ivrit:${model}] raw output (rich): ${JSON.stringify(output).slice(0, 800)}`)
    const segments = parseIvritSegments(output)
    const text = segments.length ? segments.map((s) => s.text).join(' ').trim() : extractIvritText(output)
    const withWords = segments.filter((s) => s.words.length).length
    if (text) {
      console.log(`[ivrit:${model}] rich done — ${text.length} chars, ${segments.length} segs, ${withWords} with word timings`)
      return { text, segments: withWords ? segments : undefined }
    }
    console.warn(`[ivrit:${model}] rich request returned no text — falling back to plain_text`)
  } catch (err) {
    console.warn(`[ivrit:${model}] rich request failed — falling back to plain_text: ${(err as Error).message}`)
  }

  // Attempt 2 (safe fallback): plain-text request.
  const output = await runIvritJob({ url: publicUrl, language: 'he', transcription: 'plain_text' }, model)
  const text = extractIvritText(output)
  if (!text) throw new Error('IVRIT returned empty transcript')
  console.log(`[ivrit:${model}] plain done — ${text.length} chars`)
  return { text }
}

async function transcribeWithIvrit(audioPath: string): Promise<{ text: string; segments?: IvritSegment[]; audioUrl: string; model: string }> {
  // Audio is uploaded to Storage AND kept (not deleted) so the live page can play it back.
  const { publicUrl } = await uploadAudioToStorage(audioPath)
  console.log(`[ivrit] uploaded audio (persisted), size: ${fs.statSync(audioPath).size} bytes`)

  // Accurate model first; on failure retry once with the faster, proven turbo model.
  try {
    const { text, segments } = await ivritTranscribeWithModel(publicUrl, IVRIT_MODEL)
    return { text, segments, audioUrl: publicUrl, model: IVRIT_MODEL }
  } catch (err) {
    if (IVRIT_MODEL === IVRIT_FALLBACK_MODEL) throw err
    console.warn(`[ivrit] model ${IVRIT_MODEL} failed — retrying with ${IVRIT_FALLBACK_MODEL}: ${(err as Error).message}`)
    const { text, segments } = await ivritTranscribeWithModel(publicUrl, IVRIT_FALLBACK_MODEL)
    return { text, segments, audioUrl: publicUrl, model: IVRIT_FALLBACK_MODEL }
  }
}
```

- [ ] **Step 4: Report the model that actually ran**

In `transcribeAudio` (currently around line 287–302), change the IVRIT branch to use the returned model:

```ts
export async function transcribeAudio(audioPath: string): Promise<TranscriptionResult> {
  if (RUNPOD_API_KEY && RUNPOD_IVRIT_ENDPOINT_ID) {
    try {
      console.log(`[transcribe] using IVRIT/RunPod (model: ${IVRIT_MODEL}, diarize: ${IVRIT_DIARIZE})`)
      const { text, segments, audioUrl, model } = await transcribeWithIvrit(audioPath)
      return { text, engine: 'ivrit', model, segments, audioUrl }
    } catch (err) {
      console.error('[transcribe] IVRIT failed — falling back to Whisper:', (err as Error).message)
    }
  } else {
    console.log('[transcribe] using OpenAI Whisper (no RunPod config)')
  }

  const text = await whisperTranscribe(audioPath)
  return { text, engine: 'whisper', model: 'whisper-1' }
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/transcription.ts
git commit -m "feat(transcribe): accurate IVRIT model by default with turbo fallback"
```

---

### Task 3: Harden Gemini, fall back to GPT-4.1

**Files:**
- Modify: `src/lib/transcription.ts` (shared prompt builder, `formatWithGeminiFlash`, new `formatWithGPT`, orchestration in `formatTranscript`)

- [ ] **Step 1: Extract the shared prompt builder (keeps Gemini's prompt byte-identical)**

Add this function immediately above `formatWithGeminiFlash` (currently around line 349). The returned string is exactly the prompt Gemini uses today:

```ts
// Shared formatting prompt. Gemini uses this verbatim (unchanged from before);
// the GPT fallback appends one explicit-format line so parseGeminiOutput can read it.
function buildFormatPrompt(rawText: string, company: string, business: string): string {
  const businessDesc = business ? `${business} company` : 'Israeli public company'
  return `The text below is a raw IVRIT speech-to-text with no speaker labels. The speaker names are already in the text.

your mission is to understand the context of the call, organize it beautifully with speaker names, paragraphs of each speaker and fix specific typos or wrong words based on the context you understand.

This is an investors call transcript -of a company called "${company}" which is an Israeli ${businessDesc}. It's very important you dont "guess" the fix to a typo and you don't change the number of words in the raw transcript.

Don't rephrase and dont summorize!

Just organize everything, fix specific words you are confident they are wrong based on the context!

${rawText}`
}
```

- [ ] **Step 2: Make `formatWithGeminiFlash` use the builder and back off**

Replace `formatWithGeminiFlash` (currently around line 350–402) with:

```ts
// Call Gemini 3.5 Flash with the company-aware formatting prompt.
// Retries with exponential backoff so a transient 503/overload spike can clear.
async function formatWithGeminiFlash(rawText: string, company: string, business: string): Promise<string> {
  const GEMINI_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set')
  const prompt = buildFormatPrompt(rawText, company, business)

  const backoffsMs = [5000, 15000, 40000] // waits BETWEEN the 4 attempts
  let lastErr: Error | undefined
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await withTimeout(
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 65536, temperature: 1 },
            }),
          }
        ),
        3 * 60 * 1000,
        'Gemini format'
      )
      const json = await res.json() as {
        candidates?: Array<{ content: { parts: Array<{ text?: string }> } }>
        error?: unknown
      }
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(json.error ?? json)}`)
      const text = (json.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('')
      if (!text) throw new Error('Gemini returned empty response')
      console.log(`[format] Gemini output: ${text.length} chars`)
      return text
    } catch (err) {
      lastErr = err as Error
      if (attempt < 4) {
        const wait = backoffsMs[attempt - 1]
        console.warn(`[format] Gemini attempt ${attempt} failed — retrying in ${wait / 1000}s: ${lastErr.message}`)
        await new Promise(r => setTimeout(r, wait))
      }
    }
  }
  throw lastErr!
}
```

- [ ] **Step 3: Add the GPT-4.1 fallback formatter**

Add immediately below `formatWithGeminiFlash`. Reuses the `openai` client already created at the top of the file. Add the model constant near the other module constants (e.g. just under `IVRIT_FALLBACK_MODEL`): `const FORMAT_FALLBACK_MODEL = process.env.OPENAI_FORMAT_MODEL || 'gpt-4.1'`.

```ts
// Fallback formatter when Gemini is unavailable. Reuses OPENAI_API_KEY (already used by
// the Whisper fallback). GPT-4.1 has 32k output tokens — comfortable for real calls.
async function formatWithGPT(rawText: string, company: string, business: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
  const prompt = buildFormatPrompt(rawText, company, business) +
    `\n\nFormat the result as Markdown: begin each speaker's turn with a header line "## <speaker name>" on its own line, followed by that speaker's paragraphs. Use the speaker names exactly as they appear in the text. Do not add any commentary before or after the transcript.`

  const res = await withTimeout(
    openai.chat.completions.create({
      model: FORMAT_FALLBACK_MODEL,
      max_tokens: 32768,
      messages: [{ role: 'user', content: prompt }],
    }),
    8 * 60 * 1000,
    'GPT format'
  )
  const choice = res.choices[0]
  if (choice?.finish_reason === 'length') {
    throw new Error('GPT formatting truncated (finish_reason=length) — transcript too long for the fallback')
  }
  const text = choice?.message?.content ?? ''
  if (!text) throw new Error('GPT returned empty response')
  console.log(`[format] GPT (${FORMAT_FALLBACK_MODEL}) output: ${text.length} chars`)
  return text
}
```

- [ ] **Step 4: Orchestrate Gemini → GPT in `formatTranscript`**

In `formatTranscript` (currently around line 498–500), replace the single Gemini call:

```ts
  // Step 2: format and organize — Gemini 3.5 Flash, with a GPT-4.1 fallback if Gemini is down.
  console.log('[format] formatting with Gemini 3.5 Flash...')
  let formattedMarkdown: string
  try {
    formattedMarkdown = await formatWithGeminiFlash(rawText, meta.company ?? '', meta.business ?? '')
    console.log('[format] formatted via gemini')
  } catch (gemErr) {
    console.warn(`[format] Gemini failed after retries — falling back to ${FORMAT_FALLBACK_MODEL}: ${(gemErr as Error).message}`)
    formattedMarkdown = await formatWithGPT(rawText, meta.company ?? '', meta.business ?? '')
    console.log(`[format] formatted via ${FORMAT_FALLBACK_MODEL}`)
  }

  // Step 3: parse into structured sections
  const { mgmtLines, qaLines, speakers } = parseGeminiOutput(formattedMarkdown, meta.speakers ?? [])
```

(Delete the old `const geminiOutput = await formatWithGeminiFlash(...)` and the line that passed `geminiOutput` to `parseGeminiOutput`.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If the OpenAI SDK rejects `max_tokens`, switch that field to `max_completion_tokens: 32768` and re-run.

- [ ] **Step 6: Run tests (parser contract still green)**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/transcription.ts
git commit -m "feat(format): exponential-backoff Gemini, then GPT-4.1 fallback formatter"
```

---

### Task 4: Persist before formatting + reformat-only re-runs

**Files:**
- Modify: `src/app/api/transcripts/route.ts` (existing-row select, failed-reset branch, fire-and-forget branch, `runPipeline` upd3/upd4, new `reformatPipeline`)

- [ ] **Step 1: Select `raw_transcript` when checking the existing row**

Change the existing-row select (currently around line 52–56) to include `raw_transcript`:

```ts
  const { data: existingRows, error: selectErr } = await supabaseAdmin
    .from('transcripts')
    .select('id, status, created_at, raw_transcript')
    .eq('id', videoId)
    .limit(1)
  const existing = existingRows?.[0] ?? null
```

- [ ] **Step 2: In the failed-reset branch, set the right starting step**

Replace the "Reset failed records" block (currently around line 121–129) with:

```ts
    // Reset failed records. If the transcript already exists, re-run formatting only
    // (cheap — skips download + IVRIT). Otherwise restart the full pipeline.
    const hasTranscript = !!existing.raw_transcript
    const { error: updateErr } = await supabaseAdmin
      .from('transcripts')
      .update({ status: 'processing', processing_step: hasTranscript ? 'formatting' : 'downloading', error_message: null })
      .eq('id', videoId)
    if (updateErr) {
      console.error('[POST] update failed:', updateErr)
      return NextResponse.json({ error: `Supabase update failed: ${updateErr.message}` }, { status: 500 })
    }
```

- [ ] **Step 3: Branch the fire-and-forget on reformat-only**

Replace the shared fire-and-forget block (currently around line 151–160) with:

```ts
  // Fire-and-forget. A failed/reset row that already has a transcript only needs
  // reformatting; everything else runs the full pipeline. (force already returned above.)
  const reformatOnly = !!existing && !!existing.raw_transcript
  setImmediate(() => {
    const run = reformatOnly ? reformatPipeline(videoId) : runPipeline(videoId, url)
    run.catch(async (err: Error) => {
      console.error('[pipeline] FAILED:', err.message)
      await supabaseAdmin
        .from('transcripts')
        .update({ status: 'failed', error_message: err.message })
        .eq('id', videoId)
    })
  })
```

- [ ] **Step 4: Persist timings + audio BEFORE formatting in `runPipeline`**

In `runPipeline`, change the upd3 update (currently around line 200–205) to also persist `word_segments` and `audio_url`:

```ts
    const { error: upd3err } = await supabaseAdmin
      .from('transcripts')
      .update({ raw_transcript: rawText, word_segments: segments ?? null, audio_url: audioUrl ?? null, processing_step: 'formatting' })
      .eq('id', videoId)
      .select()
    if (upd3err) console.error(`[pipeline:${videoId}] update3 error:`, upd3err)
```

- [ ] **Step 5: Drop the now-redundant audio/segments write from upd4**

Change the final update (currently around line 211–222) so it no longer re-writes `audio_url`/`word_segments` (already saved in Step 4):

```ts
    const { error: upd4err } = await supabaseAdmin
      .from('transcripts')
      .update({
        formatted_data: formatted,
        status: 'completed',
        processing_step: 'completed',
      })
      .eq('id', videoId)
      .select()
    if (upd4err) console.error(`[pipeline:${videoId}] update4 error:`, upd4err)
```

- [ ] **Step 6: Add `reformatPipeline`**

Add this function directly below `runPipeline` (after its closing brace):

```ts
// Re-run ONLY the formatting step on a row that already has a stored transcript.
// Used when a call failed at formatting — skips download + IVRIT entirely.
async function reformatPipeline(videoId: string) {
  const t0 = Date.now()
  console.log(`[reformat:${videoId}] start (skipping download + transcription)`)

  const { data: row, error } = await supabaseAdmin
    .from('transcripts')
    .select('raw_transcript, youtube_title, word_segments')
    .eq('id', videoId)
    .single()
  if (error || !row?.raw_transcript) {
    throw new Error(`reformat: row ${videoId} has no raw_transcript (${error?.message ?? 'empty'})`)
  }

  const engine = row.word_segments ? 'ivrit' : 'whisper'
  const formatted = await formatTranscript(row.raw_transcript as string, videoId, (row.youtube_title as string) ?? '', { engine })
  formatted.processingSecs = Math.round((Date.now() - t0) / 1000)

  const { error: updErr } = await supabaseAdmin
    .from('transcripts')
    .update({ formatted_data: formatted, status: 'completed', processing_step: 'completed' })
    .eq('id', videoId)
    .select()
  if (updErr) console.error(`[reformat:${videoId}] update error:`, updErr)
  console.log(`[reformat:${videoId}] DONE (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/transcripts/route.ts
git commit -m "feat(pipeline): persist transcript before formatting + cheap reformat-only re-runs"
```

---

### Task 5: Document the optional env override + final verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document the formatter-fallback override**

Open `.env.example` and add, near the existing `OPENAI_API_KEY` line, the optional override (OpenAI key is already required for the Whisper fallback — no new key):

```bash
# Optional: override the GPT model used as the formatting fallback when Gemini is down (default: gpt-4.1)
OPENAI_FORMAT_MODEL=
```

- [ ] **Step 2: Full type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Full test run**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs(env): document optional OPENAI_FORMAT_MODEL formatter-fallback override"
```

---

## Manual / integration verification (with Sagi, after merge — not run here)

These cost real API calls and need a real video; run them together after the code lands:

1. **Happy path:** submit a YouTube link; confirm logs show the accurate IVRIT model and a completed, well-structured transcript.
2. **Gemini-failure path:** temporarily make `formatWithGeminiFlash` throw; confirm the pipeline completes via `gpt-4.1` with the same speaker/section structure.
3. **Cheap re-run:** re-submit a row that failed at formatting; confirm logs show no download/IVRIT and a fast `[reformat:…]` pass.
4. **ZIM call:** force re-transcribe `2gXp90F8s6w` (admin path, or delete the row and resubmit) so it gets a fresh accurate-model transcript; review quality + speakers + RTL.
5. Run the `/transcript-review` skill on the ZIM result before declaring done.
6. Confirm `ANTHROPIC_API_KEY` is **not** needed (we chose GPT-4.1) and that Railway has `RUNPOD_IVRIT_MODEL=ivrit-ai/whisper-large-v3-ct2` (already set).
