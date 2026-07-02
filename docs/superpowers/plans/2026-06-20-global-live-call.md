# Global Investor Call — Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** superpowers:executing-plans. Branch `feat/global-live-call` (off
> `feat/transcript-ui-polish`). **Isolated, rewindable** — NOT pushed/merged until the founder live-tests it.
> Guiding constraint: **do not regress the live experience** (it's excellent). Verify `tsc`/`build` at each
> step; the only true validation is a real live Zoom test (do that with the founder).

**Goal:** A user watching a LIVE investor call can navigate across the app with the audio still playing, and
return to the live call via a "Return to Live" chip — the same global-audio + return-chip UX the offline
(recorded) call already has.

## Why this is non-trivial (current architecture)
- The **recorded** player is global: `PlayerProvider` (app-shell, a hidden `<audio>`) + `GlobalPlayer`
  (docked bar) + `ReturnToTranscriptChip`. Survives navigation.
- The **live** player is NOT global: `LiveBroadcastView` owns a **Web-Audio engine** (an `AudioContext`, a
  1.5s poll of `/api/live/state`, a pump that fetches `/api/live/pcm` chunks and schedules them via
  `AudioBufferSourceNode`, plus the buffer-gate/drain math). It lives inside the page component, so navigating
  away **unmounts it and the audio stops**. There is no `<audio>` URL to hand to `PlayerProvider` (the audio
  is assembled from PCM chunks — HLS would change this, but that's the deferred 2D migration).

## Architecture: a parallel global provider for the live engine
Mirror the recorded-player architecture for live audio, by **lifting the Web-Audio engine out of
`LiveBroadcastView` into a new app-shell provider** so it persists across navigation. `LiveBroadcastView`
becomes a *consumer* (transcript UI + controls) instead of the engine owner.

- **`src/lib/live/LiveAudioProvider.tsx`** (NEW) — app-shell context that OWNS the engine:
  - State exposed: `active` (a live call is loaded), `companyName/companyId/quarter/logoUrl`, `words`, `phase`,
    `countdown`, `liveEnded`, `endedAt`, `playingRel`, `liveEdge`, `paused`, `volume`, `delaySec`,
    `broadcastEdge`, `behind`, `over`.
  - Controls: `start(config)` (idempotent: load a call + start polling/engine — no-op if already active for it),
    `join()`, `playPause()`, `seek(t)`, `goLive()`, `setVolume(v)`, `stop()` (tear down).
  - Internals: move VERBATIM from `LiveBroadcastView` — `stRef/ctxRef/gainRef/schedRef/playPosRef/nextAtRef/
    fetchingRef/startedRef/pausedRef/rawEdgeRef/edgeWallRef/seekTokenRef/lastSaveRef`, the `refresh`+`pump`
    1.5s loop, the 100ms ticker, `flushAudio`. The engine runs only while `active`.
  - `companyId`-keyed so navigating to a *different* page doesn't restart it; `stop()` only on explicit close
    or when the source+drain are fully over.
- **`src/app/app/layout.tsx`** — wrap the shell with `<LiveAudioProvider>` (alongside `PlayerProvider`).
- **`src/components/app/GlobalLiveBar.tsx`** (NEW) — the docked live bar (reuse `MediaPlayer`, `isLive`,
  `onGoLive`), rendered by `ShellChrome` when `active`. Mirrors `GlobalPlayer`.
- **`src/components/app/ReturnToLiveChip.tsx`** (NEW) — mirror `ReturnToTranscriptChip`: shown when `active`
  AND not on the live page → `Link` to `/app/live/live` with the same pill design/position.
- **`ShellChrome`** — render `<GlobalLiveBar />` + `<ReturnToLiveChip />` (gated on `active`).
- **`LiveBroadcastView`** — consume `useLiveAudio()`: `start(config)` on mount; render the transcript +
  in-page controls from the provider; keep UI-only local state (selection, chat, toast, autoScroll). Its
  `onSourceEnded`/`onLiveOver` come from the provider's `liveEnded`/`over` (so `LiveSession`'s finish pipeline
  still fires). On the live page, hide the duplicate global bar (the page shows the same bar in-column) OR use
  only the global bar — decide during build to avoid two bars.

## Tasks (each its own commit; tsc + build each)
0. Branch (done).
1. **Scaffold `LiveAudioProvider`** with the full engine moved out of `LiveBroadcastView` verbatim + the
   `start/stop/active` lifecycle. Export `useLiveAudio`. (No consumer yet — provider compiles standalone.)
2. **Mount it** in `src/app/app/layout.tsx`.
3. **Rewire `LiveBroadcastView`** to consume the provider (delete its engine; keep UI). `LiveSession` reads
   `liveEnded`/`over` for the finish pipeline. Verify the live page still renders + behaves on tsc/build.
4. **`GlobalLiveBar`** + render in `ShellChrome` (gated on `active`, and not duplicating the page's bar).
5. **`ReturnToLiveChip`** + render in `ShellChrome`. i18n `live.returnToLive` (EN "Return to live" / HE
   "חזרה לשידור החי").
6. **Verify** tsc/test/build. PROGRESS entry. **Hand off for a LIVE Zoom test with the founder** before trust.

## Risk + rollback
- Highest-risk change to the best feature. It is on an isolated branch; rollback = abandon the branch.
- Cannot be validated without a running live call — **must be live-tested with the founder** before merge.
- Mitigation: move engine logic verbatim (relocation, not rewrite); keep the buffer/drain math (`liveTiming`)
  untouched; tsc+build at each step; do not merge until the live test passes.

## Self-Review
- Mirrors the proven recorded-player architecture (provider + global bar + return chip). Covers global audio
  (provider persists) + return chip. The finish pipeline keeps working via provider `liveEnded`/`over`.
  The one decision flagged for build time: one bar vs two on the live page. ✓
