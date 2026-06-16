# Live Transcript UX — "one call that matures" (design)

**Date:** 2026-06-16
**Status:** Design approved by founder (brainstorm). Phase 1 being built + executed for an
overnight admin test. Phase 2 specced here but not built.
**Supersedes / extends:** the parked "Thread A" block in `PROGRESS.md` (2026-06-15).

---

## 1. The vision — one call that *matures* (not two things)

A call has ONE identity. While it's on, it's **LIVE** — streaming raw captions, audio playing
~5 min behind real-time, already quotable/shareable/Ask-Atlas-able. When it ends, the SAME call
runs through Gemini and becomes the **finished** transcript on the company page, with full
functionality. Live or finished is *the same kind of page*; one is just streaming and behind.

The end-state (founder's "A"): **one transcript page running in live-mode or finished-mode.** Audio
lives in the app shell so it survives navigation in both; quote / share / Ask-Atlas sit on the one
page, so the two modes are identical by construction and can't drift. We reach it via **C→A**: two
phases that converge on that one page.

**Success criterion for the whole feature:** a user cannot tell the live page from the finished
page except for three honest live-only signals (a LIVE pill, a forward "wall," and a jump-to-live
control).

---

## 2. Locked decisions (carried in from Thread A + this brainstorm)

- **The LIVE view must FEEL like the finished view.** Same layout, same karaoke, same toolbar.
- **Anchor = follow the playhead.** Live = "the finished page, still being written." Karaoke tracks
  the audio you're hearing; new captions accumulate ahead of you.
- **Three cursors, reconciled:** *playhead* (where you listen, drives karaoke) · *live edge* (where
  captions have reached, ~5 min behind real-time, the forward wall) · *scroll* (free, anywhere up to
  the wall). The ● LIVE control snaps playhead+scroll to the edge (wherever it is *now*).
- **Scrub freely behind the edge; you cannot seek past it** (nothing captured there yet). This is the
  single mechanical difference from finished (which is seekable end-to-end).
- **"Live" means the freshest *available* moment, not real-time.** The ~5-min buffer is what lets
  captions be ready/correct by the time you hear the audio. (Locked "raw-live, polish-after" + 5-min
  buffer model.)
- **Live text is RAW; the quality jump is the finish hand-off.** No LLM in the live path (scales to
  many concurrent calls). Gemini polishes only the finished transcript.
- **Speaker turns live WHEN the feed carries speakers, gracefully degrade to one block when it
  doesn't.** Recall provides per-participant speaker; an audio-only source does not.
- **Quotes = anchors ("auto-upgrade & deep-link").** A quote stores *which words + the moment*, not
  frozen text; it renders best-available text (raw while live, corrected once polished) and
  deep-links to the exact spot + audio. Falls back to the saved snapshot only if a chunk's word
  count changed.
- **Build path = C→A** (two phases below).

---

## 3. Ingestion is decoupled — one normalized contract, swappable adapters

The live page **never** talks to Recall or RTMP directly. It consumes **one normalized live feed**;
ingestion is a swappable adapter behind it (the same move as the MayaClient interface).

**The normalized contract (a streaming form of the finished `word_segments`):**

```
{ words:  [{ text, start, end?, speaker?: string|null }],   // timed words; end & speaker optional
  audio:  PCM chunks (S16LE / sample-rate),                 // raw audio
  liveEdge: number,                                         // seconds reached
  buffer:  number }                                         // latency the UX shows on the pill
```

Every source resolves to **audio** plus *optionally* **transcription + speakers**:

| Source | Audio | Transcription | Speakers | Notes |
|---|---|---|---|---|
| Recall bot (default when admitted) | ✅ | ✅ (bundled) | ✅ participant | richest |
| RTMP / Zoom-app audio-only | ✅ | ✗ → **we run streaming STT (IVRIT / Gladia)** | ✗ (acoustic later) | degrade-to-block |
| Recorded session (replay) | ✅ | ✅ (captured) | ✗ in this asset | **what we build/demo on now** |

**Three things vary behind the boundary, and the UX degrades gracefully on all three:**
speakers present/absent → turns vs. one block; word timings present/absent → word- vs. line-level
karaoke (`hasWordTimings`); buffer size → a config value, not a hardcoded 5 min (the pill shows
whatever it is).

**Decision recorded:** Recall is the *default* ingestion when a bot is admitted; an audio-only feed
goes to **IVRIT** (best Hebrew we control) or Gladia — *not* back through Recall (Recall's value is
being the in-meeting bot). Which is "default" may flip if the IR deal yields clean per-company
feeds. We do **not** build any ingestion adapter in this work — only the replay adapter.

---

## 4. The live UX (the page)

Layout parity is the discipline: the live page is the finished page **plus exactly three** pieces of
chrome — a **● LIVE pill** (shows "behind by ~5:00"), a **forward wall** at the live edge, and a
**jump-to-live** control (the pill doubles as the button). Strip those and it's the finished page.

- **Captions:** raw text streams in at the live edge; karaoke'd and scrubbable immediately. Speaker
  turns appear when the feed carries a speaker (reusing the finished speaker-turn rendering); roles
  (מנכ"ל/CFO/מנחה) are added later by Gemini at the finish. No-speaker feed → one running block.
- **Toolbar on live (Phase 2):** the same selection toolbar — Save Quote / Ask Atlas / Share — on
  live text. Quote-as-anchor (above) is the headline cross-phase behavior. Ask Atlas chats over the
  transcript-so-far (up to the live edge).
- **Audio survives navigation (Phase 2):** the live Web-Audio engine is lifted into the app shell
  (like `PlayerProvider`), so live audio keeps playing across pages, with the Return-to-transcript
  chip — the exact parity the finished page already keeps.
- **The finish moment:** call ends → ● LIVE pill drops, the wall is removed, text becomes
  polished + speaker-attributed + role-tagged, the whole call is seekable end-to-end, and live-saved
  quotes auto-upgrade to the polished text + deep-link.

---

## 5. Phase 1 — the finish hand-off (THE SPINE, built first)

Turn an ended live call into a normal finished `transcripts` row so the **existing** finished UX
(`/app/live/[id]` → `loadCompletedCall` → `LiveTranscriptView`) renders it for free — audio karaoke,
click-word-to-seek, speakers/sections, and the Save-Quote / Ask-Atlas / Share toolbar.

**Pipeline (no IVRIT re-transcription, no YouTube download — reuses only Gemini + output shapes):**

1. **Capture** the live feed's raw text + words (per-word timestamps; speaker when present). *The
   only irreversible step in production.* For the demo this is already captured on disk.
2. **Build `word_segments`** (`IvritSegment[]`) from the feed words. Synthesize `end` from the next
   word's start when absent; `speaker: null` when the feed has none. **These words are what the
   finished view displays + karaokes.**
3. **Encode** the captured PCM → MP3 (`fluent-ffmpeg` + the bundled `@ffmpeg-installer/ffmpeg`,
   S16LE/mono/16 kHz), trimmed to the captured span → upload to the `audio-temp` bucket → `audio_url`.
4. **Gemini polish:** `formatTranscript(rawText, id, title, …)` (the same `formatWithGeminiFlash`
   prompt as the IVRIT path), with the correct company context. Output is `formatted_data`; its only
   role on the word-timed path is supplying **speaker turns + names**, mapped proportionally onto the
   timed words by `buildFromIvritWithGeminiNames`.
5. **Upsert** the `transcripts` row: `formatted_data` + `audio_url` + `word_segments` + `company_id`
   + `duration` + `raw_transcript`, `status='completed'`. Idempotent on a synthetic text `id`.

**Reused as-is (no changes):** `formatTranscript`/`formatWithGeminiFlash`, the `transcripts` schema,
`word_segments`/`audio_url`, `loadCompletedCall`, `buildFromIvritWithGeminiNames`,
`LiveTranscriptView`, the quotes table.

**Demo-asset reality (`scripts/out/sessions/tamis-2026-06-14.{jsonl,pcm}`):** word **start** times
only (no `end`), **no speaker**, and it is **two concatenated capture sessions** (the per-word
`start` resets at record 3). Phase 1 uses the **first monotonic session** and trims the MP3 to it so
audio↔text stay aligned. The recording is a rough test capture (its spoken content is a different
test company), so the row is attached to **תמיס** (ticker `1097229`) for a real company link + the
existing live view's company; the body text won't perfectly match the header — a known quirk of this
asset, **not** a pipeline issue. Phase 1 against it therefore exercises the **degraded path**
(no speaker, no word-`end`), which is exactly the robustness we want to prove first.

**What Phase 1 checks (the morning test):** from the recording, does an ended call become a finished
transcript that the existing page renders with (1) Gemini-organized speaker turns, (2) a working
`audio_url`, (3) `word_segments`-driven karaoke in sync, (4) click-word-to-seek + Save-Quote /
Ask-Atlas / Share working, (5) no crash on the degraded input?

---

## 6. Phase 2 — live-mode richness (specced, not built here)

- **Toolbar on the live view:** Save Quote / Ask Atlas / Share on a streaming caption.
- **Quote-as-anchor across the boundary:** a quote saved live auto-upgrades to the polished text +
  deep-links into the finished transcript once the call ends (the headline cross-phase magic).
- **Live audio survives navigation:** lift the live engine into the app shell + Return-to-transcript.
- **The same-page live→finished transition:** ● LIVE drops, wall removed, text firms in place.

All Phase 2 work is demoable by replaying the recording as a fake-live feed
(`scripts/live-replay-engine.mjs`) — still no live Zoom needed.

---

## 7. Non-goals (explicitly out of scope now)

- Building any production ingestion adapter (Recall / RTMP / Zoom-app / streaming STT).
- Live Gemini correction (locked out for scale — live is raw).
- Acoustic (voice) diarization for audio-only feeds.
- Auto-triggering the finish at real call-end (Phase 1 is run on demand against the recording;
  wiring it to a real call's end is later, with Core 1 productionization).
- Hebrew-in-markdown-table alignment and other parked chat-polish items.

---

## 8. Implementation map (Phase 1)

- `src/lib/live/finishLiveCall.ts` — the reusable finish logic. **Pure, unit-tested transforms:**
  `normalizeFeedWords` (cut at first start-reset → first session), `synthesizeWordEnds`,
  `buildWordSegments`, `feedDurationSec`, `pcmByteLength`. **Orchestration:** `encodePcmToMp3`,
  `uploadMp3`, `finishLiveCall(input)` (build → encode/upload → Gemini → upsert).
- `src/lib/live/finishLiveCall.test.ts` — `node:test` cases for the pure transforms.
- `scripts/finish-live-call.ts` — reads the recorded session, calls `finishLiveCall`, prints the
  `/app/live/<id>` URL. Run: `node --env-file=.env.local --import tsx scripts/finish-live-call.ts`.

Outcome state after execution: **Phase 1 executed — awaiting admin test** (a real finished
`transcripts` row exists, renderable at `/app/live/<id>`).
