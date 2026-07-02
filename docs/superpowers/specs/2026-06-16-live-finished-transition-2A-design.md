# Phase 2A — Live→Finished Transition (inline swap) — design

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

**Date:** 2026-06-16
**Status:** Design approved by founder (inline-swap architecture). Spec → plan → build → test.
**Builds on:** the live-view fixes (`liveTiming.ts`, `LiveBroadcastView`) and Phase 1's finish
pipeline (`finishLiveCall`). Part of Phase 2 (decomposition: **2A transition** → 2B toolbar-on-live →
2C quote-anchor → 2D unified player).

---

## 1. The experience (the "one call matures" payoff)

A viewer watches the **live** transcript (raw karaoke captions, audio ~5 min behind real-time). When
the **source call finishes airing**, the same page — **no reload, no new URL** — turns into the
organized **finished** transcript:

1. Source ends → the call's full text + audio go through Gemini (`finishLiveCall`) to organize it.
2. While it processes, the page shows the live transcript with a banner:
   **"השיחה הסתיימה, בינה מלאכותית מעבדת אותה כדי להציג אותה בצורה מקצועית…"** + a loading state. The
   already-buffered audio keeps playing (the viewer can finish listening / scrub).
3. When the finished transcript is ready **and** the viewer's buffer has drained, the page
   **inline-swaps** to `LiveTranscriptView` (the existing finished page) — audio continues from the
   same spot, the text re-flows into speaker turns, the full timeline unlocks.

Most of the time the swap is **instant**: the pipeline is triggered the moment the source ends and
runs *during* the ~5-min buffer drain, so it's usually ready by the time the viewer reaches the end.
The "מעבדים…" state only shows in the rare case it isn't ready yet.

## 2. Architecture — inline swap (not full unify)

A thin **client wrapper** owns the transition; the two existing views stay as-is:

```
/app/live/[id]  (id==='live')
  └─ <LiveSession>                         ← NEW client wrapper
       ├─ phase 'live'      → <LiveBroadcastView … onPlayheadChange/ended signals/>
       └─ phase 'finished'  → <LiveTranscriptView call={fetchedFinishedCall} initialSeek={playhead}/>
```

- `LiveSession` renders `LiveBroadcastView` while live. When the source ends it kicks off the finish
  and watches its status; once **finished-ready AND buffer-drained**, it renders `LiveTranscriptView`
  in place (same route), passing the current **playhead** as `initialSeek` so the global audio player
  resumes at that spot. React unmounts the live Web-Audio engine and mounts the finished player — a
  contained, sub-second audio handoff. (Truly gapless audio is **2D / full-unify**, deferred.)
- **Drain-based "finished" mode** replaces the playhead-based `viewerEnded` for the mode/badge/
  return-to-live: `hostedLiveOver = backendEnded && delayedLiveEdge(...) >= liveEdge − ε`. Once the
  buffer has fully drained this stays true (monotonic), which also **fixes the return-to-live-after-
  ended bug** (no live button when there's no live edge left).

## 3. Trigger + pipeline (process during the drain)

- **`POST /api/live/finish`** (idempotent): marks/creates the finished `transcripts` row
  (`status='processing'`) and fires `finishLiveCall` fire-and-forget (mirrors the existing
  `POST /api/transcripts` → `runPipeline` pattern). Returns `{ id }`. If the row is already
  `completed`, returns immediately. **Demo source of data:** reads the recorded session
  (`scripts/out/sessions/tamis-2026-06-14.*`) via the same logic as `scripts/finish-live-call.ts`.
  *(Production later: the live engine's captured buffer — out of scope for 2A.)*
- **Status:** the client polls the existing `GET /api/transcripts/[id]` for `status`
  (`processing` → `completed`).
- **`GET /api/live/finished-call/[id]`** (NEW): returns the `LiveCall` JSON (`loadCompletedCall(id)`)
  so the client wrapper can render `LiveTranscriptView` (a client component taking a `call` prop)
  without a server navigation.
- **Timing:** `LiveSession` calls `POST /api/live/finish` once, when the source first reports
  `liveEnded` — so Gemini runs *during* the drain. The swap waits for **both** `completed` **and**
  `hostedLiveOver`.

## 4. Data flow

```
liveEnded=true ─▶ POST /api/live/finish (once) ─▶ finishLiveCall (Gemini) ─▶ transcripts row 'completed'
     │                                                                              │
LiveSession polls GET /api/transcripts/[id] ◀──────────────────────────────────────┘
     │ status='completed'  AND  hostedLiveOver (buffer drained)
     ▼
GET /api/live/finished-call/[id] → LiveCall ─▶ render <LiveTranscriptView call initialSeek={playhead}/>
```

## 5. Components & files

- **Create** `src/components/live/LiveSession.tsx` — the wrapper (phase machine: live → processing →
  finished; owns the finish trigger, polling, playhead capture, inline swap).
- **Modify** `src/components/live/LiveBroadcastView.tsx` — (a) adopt `hostedLiveOver` (drain-based)
  for the badge / `isLive` / return-to-live button; (b) surface `liveEnded` + the current playhead +
  `hostedLiveOver` to the parent via callbacks (so `LiveSession` can drive the swap); (c) the
  "מעבדים…" banner while processing.
- **Create** `src/app/api/live/finish/route.ts` — the idempotent finish trigger (demo: recorded
  session).
- **Create** `src/app/api/live/finished-call/[id]/route.ts` — returns `loadCompletedCall(id)` JSON.
- **Modify** `src/app/app/live/[id]/page.tsx` — render `<LiveSession>` for `id==='live'`.
- **Reuse as-is:** `finishLiveCall`, `loadCompletedCall`, `LiveTranscriptView`, `liveTiming`.
- Pure logic to add + unit-test in `liveTiming.ts`: `hostedLiveOver(backendEnded, delayedEdge, liveEdge, ε)`.

## 6. Demo / test (Or Yam under תמיס)

Replay the Or Yam session near its end (`REPLAY_OFFSET` high). Expected: watch live → source ends →
"מעבדים…" briefly (Gemini runs) → page **auto-swaps** to the organized finished transcript, audio
continuing from the same spot, full timeline + speaker turns + (finished) toolbar. The finished row
is the same `live-finish-demo-tamis-2026-06-14` id (idempotent upsert).

## 7. What 2A checks

The same page goes **live → "processing" → organized finished**, automatically, with no reload and
audio continuity — and the return-to-live button is gone once the call is truly over.

## 8. Non-goals (deferred)

- **Full unify / truly-gapless audio** (one engine throughout) — that's the 2D / mode-A north star.
- **Production live-data finish trigger** (real captured buffer instead of the recorded session).
- Toolbar-on-live (2B) and quote-anchor carry-over (2C) — later sub-projects.
- Preserving the viewer's *scroll* position across the swap (audio position is preserved; scroll may
  reset to the finished layout — acceptable for 2A).
