# Transcription Resilience — accurate IVRIT, formatter fallback, cheap re-runs

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

**Date:** 2026-06-16
**Status:** Approved design → ready for implementation plan
**Author:** Claude + Sagi (founder)
**Branch:** `fix/transcribe-fallback`

## Goal

Stop the finished-transcript pipeline from throwing away a successful, expensive
transcription when the formatting step hits a transient provider outage, and raise
transcription quality by defaulting to the more accurate IVRIT model. Concretely:

1. **Accurate transcription by default**, with the fast model and Whisper as safety nets.
2. **Formatting survives a Gemini overload** — retry harder, then fall back to a second
   provider (GPT-4.1) so the call still completes.
3. **Failed/retried calls are cheap to re-run** — never re-download + re-transcribe just
   because formatting failed.

## Why this matters (the incident)

On 2026-06-15 a real submission (Knesset economic-committee call on the ZIM
privatization, video `2gXp90F8s6w`, ~42,790 chars) ran the full pipeline successfully
through transcription and then **died at formatting**:

```
12:08:31 transcription OK (418.8s) — 42790 chars via ivrit, 923 segs, 923 with word timings
12:10:57 [format] Gemini attempt 1 failed — retrying: Gemini 503 "high demand ... UNAVAILABLE"
12:11:17 [pipeline] FAILED: Gemini 503
```

Root cause, two parts:

- **Gemini 3.5 Flash was momentarily overloaded (503).** `formatWithGeminiFlash`
  (`src/lib/transcription.ts`) retries only **twice, 3 s apart, with no second provider**,
  so both quick attempts hit the same spike and the pipeline threw.
- **A pipeline throw discards everything.** ~11 minutes of work (266 s download + 419 s
  IVRIT, plus RunPod cost) was lost. `raw_transcript` had been persisted, but
  `word_segments` and `audio_url` had not, and there is no reformat-only path — a retry
  re-runs the whole pipeline.

Two non-issues we explicitly ruled out:

- The "fast turbo model" in the logs is **not a bug** — `ivrit-ai/whisper-large-v3-turbo-ct2`
  is the code default, and production was using it because Railway had **no**
  `RUNPOD_IVRIT_MODEL` set. `.env.local` already pointed at the accurate
  `ivrit-ai/whisper-large-v3-ct2`. The accurate model is now set on Railway too; this spec
  also makes it the code default so a fresh deploy can't regress.
- IVRIT itself succeeded perfectly (full transcript + per-word timings).

## Scope

### 1. IVRIT: accurate model by default, with automatic fallback (`src/lib/transcription.ts`)

- Change the default model constant from `…-turbo-ct2` to **`ivrit-ai/whisper-large-v3-ct2`**
  (env `RUNPOD_IVRIT_MODEL` still overrides). Add a separate fallback constant
  `IVRIT_FALLBACK_MODEL = 'ivrit-ai/whisper-large-v3-turbo-ct2'`.
- Parameterize `runIvritJob(transcribeArgs, model)` (model is currently hard-coded to
  `IVRIT_MODEL` in the request body).
- In `transcribeWithIvrit`, attempt the **accurate** model (rich request → plain-text
  request, as today). If the whole accurate attempt throws, **retry once with the turbo
  model** (rich → plain). Resulting transcription chain: **accurate → turbo → Whisper**
  (Whisper fallback already exists in `transcribeAudio`).
- `transcribeWithIvrit` returns the **model actually used**; `transcribeAudio` reports that
  in `TranscriptionResult.model` (keeps the admin `engine`/`model` diagnostics honest
  instead of always claiming the configured model).
- Known trade-off (documented, not fixed here): the accurate model is slower
  (~15–20 min vs ~7 min observed). Still inside the existing 30-min RunPod poll cap
  (`maxWaitMs`). A future very long (3 h+) call may need that cap raised — out of scope.

### 2. Formatting: harden Gemini, then fall back to GPT-4.1 (`src/lib/transcription.ts`)

- **Harden `formatWithGeminiFlash`:** ~4 attempts with exponential backoff
  (≈5 s → 15 s → 40 s) instead of 2 attempts / 3 s, giving a demand spike time to clear.
  This alone would have completed the ZIM call.
- **Add `formatWithGPT(rawText, company, business)`** using the **existing** OpenAI client
  (`openai`, already instantiated for the Whisper fallback — reuses `OPENAI_API_KEY`, **no
  new dependency, no new key**):
  - Model `gpt-4.1`, `max_tokens` 32768.
  - Same company-aware formatting prompt as Gemini, **plus one explicit instruction** to
    emit `## SpeakerName` / `**SpeakerName:**` headers, so the existing `parseGeminiOutput`
    parses GPT output identically. **Gemini's prompt stays byte-for-byte unchanged**
    (protects the gold-measured quality).
  - **Truncation guard:** if `finish_reason === 'length'`, treat as failure (log it) rather
    than returning a cut-off transcript — fails safe on the rare oversized call.
  - Generous request timeout (stream if needed) so a long generation doesn't hit the SDK's
    default HTTP timeout.
- **Orchestration:** `formatTranscript` calls Gemini first; on total failure it calls
  GPT-4.1. Both return the same markdown contract consumed by `parseGeminiOutput`. Log
  which formatter produced the result (e.g. `[format] formatted via gemini|gpt-4.1`).

### 3. Cheap re-runs (`src/app/api/transcripts/route.ts`)

- **Persist transcription artifacts before formatting.** Move `word_segments` + `audio_url`
  into the pre-format DB update (alongside the existing `raw_transcript` write), so a
  formatting failure leaves a row that has everything needed to reformat.
- **Reformat-only path.** When the POST handler resets an existing/failed row, branch on
  whether `raw_transcript` is already present:
  - **present** → run a reformat-only pass (`formatTranscript` on the stored text; keep
    `audio_url`/`word_segments`; mark `completed`). Seconds, no download, no RunPod cost.
  - **absent** (failed earlier, at download/transcribe) → full `runPipeline` as today.
- Optional convenience: `scripts/reformat.mjs <id>` mirroring `scripts/reprocess-audio.mjs`,
  for manual reformatting from the CLI.

### 4. Re-run the ZIM call

- Its saved transcript is the **turbo** one, so a cheap reformat would keep turbo text. To
  get the accurate model, re-run it through the **admin "force re-transcribe"** path
  (`POST /api/transcripts` with `force: true` → fresh `_r…` row, full pipeline). Verify the
  result: accurate-model transcript, formatted (via Gemini, GPT-4.1 only if Gemini is down),
  status `completed`.

### 5. Deploy / config (Sagi)

- `RUNPOD_IVRIT_MODEL=ivrit-ai/whisper-large-v3-ct2` on Railway — **done.**
- No new env var or dependency for the formatter fallback (reuses `OPENAI_API_KEY`).

## Error handling summary

- IVRIT accurate fails → turbo → Whisper. Only if all three fail does transcription throw.
- Gemini fails after backoff → GPT-4.1. Only if **both** formatters fail does the pipeline
  mark the row `failed` — and now the transcript + timings + audio are persisted, so the
  retry is a cheap reformat.
- GPT-4.1 truncation (`finish_reason: length`) is treated as a formatter failure, not a
  silent partial publish.

## Testing

- **Unit-ish / local:** run a known YouTube link through `POST /api/transcripts` locally;
  confirm logs show the accurate model and a completed, well-structured transcript.
- **Gemini-failure simulation:** temporarily force `formatWithGeminiFlash` to throw and
  confirm the pipeline completes via GPT-4.1 with the same section/speaker structure.
- **Cheap re-run:** take a row that failed at formatting, re-submit it, confirm the logs
  show no download/IVRIT and a fast reformat.
- **ZIM call:** force re-transcribe and eyeball the transcript quality + speakers + RTL.
- Use the `/transcript-review` skill on the ZIM result before calling it done.

## Out of scope

- Raising the 30-min RunPod poll cap for 3 h+ calls.
- Switching the **primary** formatter off Gemini (Gemini stays primary; GPT-4.1 is only the
  fallback).
- Chunked formatting for transcripts that exceed 32k output tokens (the truncation guard
  fails safe instead; revisit if a real call ever trips it).
- Recording the formatter used as a structured field in `formatted_data` (logging only for now).
