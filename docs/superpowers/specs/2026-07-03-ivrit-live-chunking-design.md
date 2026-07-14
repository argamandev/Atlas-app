# IVRIT Live Pipeline — Chunking Strategy Design

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

**Date:** 2026-07-03 · **Lane:** I (ivrit-pipeline, branch `feat/ivrit-pipeline`)
**Status:** APPROVED by the founder 2026-07-03 (assumptions A1–A4 confirmed). Goal restated
by the founder: turn audio into text and show it live on-platform with a 3–5 min buffer
(tuned to measured performance), without relying on Recall for the text — Recall is an
audio tap only.

## Goal

A second, independent live audio→text pipeline: Recall sends **audio only**
(`audio_mixed_raw` websocket); our ivrit-ai RunPod model produces the text **with word
timestamps**, feeding the same karaoke UX the product already has
(`src/lib/live/syncEngine.ts`). Milestone 1: replayed archived audio → IVRIT text with word
timings → karaoke renders in sync, invariants unit-tested.

## Why chunking is the crux

IVRIT/RunPod today (`src/lib/transcription.ts`) transcribes *whole files* — one job, minutes
of latency. Live audio never ends, so we must cut the stream into pieces, transcribe each,
and stitch per-chunk word timestamps into one non-decreasing stream-relative timeline.
The viewer watches `LIVE_BUFFER_SEC` (default 300s) behind live, so a caption for audio at
time T is "on time" if it exists by T+300s — a generous budget (Recall's own captions lag up
to 203s and the buffer absorbs it).

## Assumed product decisions (FOUNDER TO CONFIRM)

| # | Decision | Assumed answer | Why |
|---|----------|----------------|-----|
| A1 | Chunk size bias | Medium, 30–45s, cut at natural pauses | Quality-biased; buffer hides latency; sentence-sized caption batches |
| A2 | Gemini live correction | OFF for M1 | Measure raw IVRIT vs Recall first; correction is a separable later layer |
| A3 | Live diarization | OFF for M1 | Current karaoke shows no speakers; IVRIT word sync doesn't depend on it |
| A4 | Viewer contract | Unchanged — same `/state` + `/pcm` API on :8788 | Existing viewer page and app pages work as-is on either pipeline |

## Approaches considered

**A. Fixed-interval chunks** — hard cut every N seconds. Simplest, but every boundary can
slice a word in half; the model transcribes half-words at both edges → guaranteed boundary
errors many times per call.

**B. Silence-aligned chunks (CHOSEN)** — accumulate PCM; after `MIN_CHUNK_SEC` (20s), cut at
the first sustained quiet moment (simple RMS energy over the 16-bit samples, e.g. ≥400ms
below threshold; starting point ≈2% of full scale, tuned on the archived call); force a cut at `MAX_CHUNK_SEC` (45s) if no silence shows up. Words are
almost never cut (people pause between sentences); no overlap means stitching is trivial
(offset addition) and timestamp monotonicity is structural.

**C. Overlapping chunks + dedup stitch** — chunks overlap ~5s; boundary words transcribed
twice and merged by fuzzy timestamp matching. Most robust at boundaries in theory, but the
dedup of Hebrew word pairs by approximate timestamps is a bug farm and can *introduce*
duplicated/dropped words — the exact failure the invariant tests exist to prevent.

Chosen: **B**, with C's overlap idea kept as a later upgrade only if boundary errors show up
in the quality comparison.

## Architecture

```
Recall ws (audio_mixed_raw)          [test: replay-audio-feeder.mjs streams the
        │                             archived PCM in the same ws message format]
        ▼
scripts/live-ivrit-broadcast.ts  (run via node --import tsx; :8788, single-owner)
  ├── audio store: pcmChunks[] + /pcm slice serving   (same as live-broadcast.mjs)
  ├── Chunker (pure, src/lib/live/pcmChunker.ts):
  │     feed(pcmBuffer) → emits {pcm, startSec, endSec} chunks
  │     cut rule: ≥MIN 20s + ≥400ms RMS silence, hard cap 45s, flush on stream end
  ├── Transcriber (one chunk at a time, FIFO):
  │     chunk PCM → WAV bytes (16k mono s16le; 44-byte header, no ffmpeg)
  │     → RunPod job (word_timestamps: true, language: he, no diarize)
  │     → parseIvritSegments (extracted to src/lib/live/ivritParse.ts; transcription.ts imports it — the functions were module-private before, so nothing external breaks)
  ├── Stitcher (pure, src/lib/live/ivritStitcher.ts):
  │     chunk-relative word times + chunk.startSec → stream-relative;
  │     clamp to non-decreasing; emit one line per chunk {id, raw, words:[{text,start}]}
  └── HTTP: /state + /pcm — byte-identical contract to live-broadcast.mjs
        ▼
existing viewer page / app live page (karaoke via syncEngine)
```

### Sequencing & failure rules

- **FIFO, concurrency 1.** RunPod turbo transcribes a 45s chunk in well under 45s, so a
  serial queue drains faster than realtime. Lines are therefore emitted in order — no
  out-of-order completion to handle. If queue depth ever exceeds ~3 chunks, log loudly
  (escalate to concurrency 2 only if reality demands it).
- **A failed chunk (after 2 retries) is a logged gap, never a stall**: emit the line with
  empty words (karaoke shows no highlight for that span), continue with the next chunk.
- **Latency accounting per chunk**: log per-chunk readiness; invariant is
  `readyAt ≤ chunkStartSec + LIVE_BUFFER_SEC − 60` (captionOnTime in ivritStitcher.ts)

## Testing (definition of "works")

Test bench: archived real call `scripts/out/sessions/2026-07-01-tamis-live/`
(387s PCM + Recall lines.jsonl) — copied into the worktree's `scripts/out/`, replayed with
`scripts/live-replay-engine.mjs` (UI) and fed via the new feeder (pipeline input). No Zoom.

1. **Unit tests** (Node test runner via tsx, registered in package.json test line, style of
   `liveTiming.test.ts`) over the pure modules:
   - chunker: cuts within [MIN, MAX]; cuts at silence when present; no byte lost or
     duplicated between consecutive chunks; flush on end.
   - stitcher: word starts non-decreasing (ties allowed) across chunk boundaries; word count
     preserved from IVRIT output; offsets exact.
   - coverage: stitched words span the speech duration (vs known fixture).
   - drift: for a simulated job-latency profile, caption ready-time stays within the
     buffer budget.
2. **Quality delta vs Recall** on the same archived audio (`run-experiment.ts` pattern,
   `measure-core` tokenize/LCS): report on the board.
3. **/verify-app**: watch the karaoke mid-replay with my own eyes on :3002.

## Technical spikes (first implementation steps, before the full build)

- **S1 — RunPod blob input**: can the ivrit worker take base64 audio (`blob`) instead of a
  URL? If yes: no storage churn. If no: upload each chunk WAV to the existing `audio-temp`
  Supabase bucket (additive, already-used bucket) and pass the URL.
- **S2 — real chunk latency**: measure submit→COMPLETED for a 30–45s WAV on the current
  endpoint (incl. cold start). Validates the concurrency-1 choice; the current 5s poll
  interval may need tightening (e.g. 1s) for small jobs.

## Out of scope (M1)

Gemini correction layer · diarization · bot creation for real Zoom calls (exists in
live-broadcast.mjs, reused later) · Next.js page changes (viewer contract unchanged) ·
replacing the Recall-text pipeline (this runs beside it).

## Risks

- IVRIT word timestamps may be sparse/absent on some chunks (seen on the archive path) —
  fallback: distribute the chunk's words evenly across the chunk span, flag the line.
- :8788 single-owner — claim in cross-cutting.md before any run.
- `parseIvritSegments` extraction touches shared `src/lib/transcription.ts` → append to
  cross-cutting.md before the change.

## Spike results (2026-07-03)

Measured with `scripts/spike-ivrit-live.ts` against the real endpoint
(`ivrit-ai/whisper-large-v3-turbo-ct2`, 35s WAV chunk = 1,120,044 bytes inline base64).

- **S1 — blob input: SUPPORTED.** The worker accepts base64 `blob` in `transcribe_args`;
  no per-chunk storage upload needed. `transcribeUrl` stays in `scripts/lib/runpod-live.ts`
  as an unused fallback.
- **S2 — latency for a 35s chunk** (submit → COMPLETED, incl. 1s-poll granularity):
  - cold (worker spin-up): **16,091 ms** and **21,029 ms** across two separate runs
  - warm (immediately after): **2,519 ms** and **2,635 ms**
  - Both are far inside the <240s budget (`LIVE_BUFFER_SEC − 60`); warm ≈ 2.6s per 35s chunk
    confirms FIFO concurrency-1 drains much faster than realtime. Cold start only bites the
    first chunk of a call.
- **Poll interval: 1s** (client default `pollMs = 1000`). At ~2.6s warm jobs, the old 5s
  poll would add up to ~2.4s dead time per chunk; 1s keeps overhead <1s and is gentle
  (≤3 status calls per warm job).
- **Fixture**: `scripts/fixtures/ivrit-live-spike.json` — real response for the archive's
  0–35s speech-heavy window: 9 segments, 46 words, all 46 with numeric per-word `start`
  (Task 5's parser tests read this file). Note: the brief's original 60–95s window was
  mostly silence/music (2 words); the spike script now defaults to 0–35s
  (`SPIKE_START_SEC` overrides).
- **Response shape** (for Task 6's parser): top level is `[{ result: [ [segment, …], … ] }]`
  — an array of segment *batches*; each segment has `text`, `start`, `end`,
  `words: [{ word, start, end, probability, speaker }]`, plus `extra_data` and an empty
  `speakers` array (diarization off).
