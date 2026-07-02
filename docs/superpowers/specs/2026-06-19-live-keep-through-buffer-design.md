# Live: keep "LIVE" through the buffer drain → clean finish — Design

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

**Date:** 2026-06-19 · **Status:** approved by founder, ready for implementation plan
**Branch target:** `feat/live-phase2` (continues the phase-2 live work; not merged to `main` until tested)

## Problem

After a real 4-min-buffer Zoom test, two gaps surfaced in the end-of-call flow:

1. **The call vanishes mid-finish.** Home "Live Now" + the company page show a call as live only while
   `audioStartRel !== null && !liveEnded`. The instant the source audio stops (`liveEnded = true`) the call
   disappears from both surfaces, and the only "back to it" affordance (the processing card) lives *inside*
   the live view — so a user who navigates away is stranded (browser-back only).
2. **Abrupt live cutoff.** The current build (the "free-recording" experiment) cuts the live experience the
   instant the source stops, even though every watching viewer is still `buffer` minutes behind and has
   minutes of un-played call ahead. Tested with the founder's brother → "too buggy". Confirmed again in the
   4-min test: source ended at edge 415s while a viewer at the live edge was only ~175s in, with ~240s of
   buffered call discarded.
3. **(separate bug) Wrong finished transcript.** The finish reads `scripts/out/broadcast-lines.jsonl` +
   `broadcast-audio.pcm`, which the engine **only appends to, never resets** — so it organizes the
   accumulated pile of *every past call*, dominated by stale content.

## The model: a call is either **LIVE** (incl. the buffer drain) or **FINISHED**

```
source audio arrives ─▶ LIVE (buffer countdown) ─▶ LIVE (synced audio+captions)
   ─▶ source audio STOPS ─▶ STILL LIVE, same UX, buffer drains at 1x for `buffer` more seconds
   ─▶ buffer fully drained ─▶ FINISHED (raw transcript → auto-swaps to organized when ready)
```

This **reverts the free-recording cutoff** and re-enables the buffer drain. There is **no "processing"
state** on Home/company — a call is only ever Live or Finished. The "AI is processing" message is a
transient, auto-dismissing card, not a discovery state.

Two facts already make this tractable:
- The pure timing helpers in `src/lib/live/liveTiming.ts` — `delayedLiveEdge(liveEdge, bufferSec,
  endedAtWallMs, nowMs)`, `viewerEnded(...)`, `hostedLiveOver(backendEnded, delayedEdge, liveEdge)` — are
  intact + unit-tested. The free-recording pass merely stopped *calling* them. We re-wire them.
- `delayedLiveEdge` needs `endedAtWallMs` (wall-clock ms the source ended). The engine doesn't expose that
  yet; adding it is the one new piece of data the whole design hangs on.

## Components & changes

### 1. Engine exposes `endedAt` + resets capture per run — `scripts/live-broadcast.mjs`
- Add module var `let endedAt = null`. In the websocket `close` handler (currently `liveEnded = true`,
  line ~231) also set `endedAt = Date.now()`.
- Add `endedAt` to the `/state` JSON (line ~188): `{ audioStartRel, liveEdgeRel: liveEdgeRel(), liveEnded,
  endedAt, sampleRate, lines }`.
- **Capture reset:** on startup (right after `mkdirSync(OUT_DIR)`, line ~32) truncate both capture files —
  `writeFileSync(LINES_FILE, '')` and `writeFileSync(PCM_FILE, Buffer.alloc(0))` — so each engine run (= each
  call, since we restart the engine per call) finishes only *its own* capture. (Production multi-call
  isolation — reset per-recording rather than per-process — is deferred to the MAYA work.)
- **Clock note:** `endedAt` is the engine's wall clock; clients compute drain progress with their own
  `Date.now()`. On localhost (engine + browser same machine) skew is ~0. Acceptable for the demo; a
  production engine would send elapsed-since-end instead.

### 2. State plumbing — `/api/live/state` + types
- `src/app/api/live/state/route.ts` already passes the engine JSON through verbatim — `endedAt` rides along
  for free. Add `endedAt: null` to the graceful "offline" fallback object.
- Add `endedAt: number | null` to the `LiveState` interface in `LiveBroadcastView.tsx`.

### 3. Live view keeps LIVE through the drain — `src/components/live/LiveBroadcastView.tsx`
- Re-import `delayedLiveEdge`, `viewerEnded` (and `hostedLiveOver`) from `liveTiming`.
- Track `endedAt` from `/state`; expose it to the 100ms ticker.
- Replace the free-recording edges with the draining edge:
  - pump `allowedEnd = delayedLiveEdge(st.liveEdgeRel ?? 0, delaySec, st.endedAt, Date.now())`
  - `broadcastEdge = delayedLiveEdge(liveEdge, delaySec, endedAt, now)` (drive the ticker so it ramps
    smoothly; recompute in the 100ms tick like `interpolatedEdge`)
  - `seek` maxEnd + `goLive` target use the same draining edge.
- **Header stays LIVE through the drain** (this is change #5/#1 from the polish pass): the top-right shows the
  LIVE badge — never the "ended" text — until the view flips to finished. `behind` shrinks toward 0 as the
  viewer catches the draining edge. Remove the `liveEnded`-keyed "ended status" branch from the header.
- **Two distinct signals to the wrapper:**
  - `onSourceEnded()` — fire when `liveEnded` first becomes true (source stopped). Starts the finish + the
    auto-dismissing card. View stays live.
  - `onLiveOver()` — fire when `hostedLiveOver(liveEnded, delayedEdge, liveEdge)` first becomes true (buffer
    drained, viewer reached the true end). Triggers the swap to finished.

### 4. Wrapper: drain-end → finished, raw-until-organized — `src/components/live/LiveSession.tsx`
- Keep `onSourceEnded` (POST `/api/live/finish`, start polling, show the card).
- Add `onLiveOver` → set `phase = 'finished'` (auto-swap; no manual button needed). The button can stay as a
  no-op-after-drain affordance or be removed — finished is now reached by the drain, not a click.
- **Finished render, raw-until-organized:**
  - If the organized `finishedCall` is ready → render `LiveTranscriptView` (organized) as today.
  - If not ready yet → render the **raw captured transcript** (read-only, the captured words + the full
    recording audio) as the "default text", and keep polling `/api/live/finish`; the moment it completes,
    pre-load `finished-call/[id]` and swap to the organized view in place (the existing 2A pre-load + swap).
  - The same raw-until-organized behavior applies when a user navigates **fresh** to the finished call from
    Home/company before processing completes (see #6).

### 5. Notification card auto-dismisses — `src/components/live/LiveSession.tsx`
- The "Sourced Investor Call ended — AI is processing your transcript" (`processing`) card auto-closes after
  **5 seconds** (a `setTimeout` that marks it dismissed), or immediately on ✕. The `ready` card (with the
  black View button) is **not** auto-dismissed — it carries an action. (The card already only appears once
  THIS session saw the source end.)
- Because the header now stays LIVE through the drain (#3), this card is the *only* place the "ended /
  processing" message appears.

### 6. Home + company stay LIVE through the drain — `LiveNowPanel.tsx` + `CompanyOverview.tsx`
- Both currently gate on `s.audioStartRel !== null && !s.liveEnded`. Change to keep the call live until the
  drain completes:
  - compute `over = hostedLiveOver(s.liveEnded, delayedLiveEdge(s.liveEdgeRel ?? 0, LIVE_BUFFER_SEC,
    s.endedAt, Date.now()), s.liveEdgeRel ?? 0)`
  - show live while `s.audioStartRel !== null && !over`.
- This is consistent across users because `endedAt` comes from the engine (a fresh page load mid-drain
  computes the same remaining drain). When `over` is true the panel hides → the company's **latest finished
  call** (the transcript row) takes over as the entry point.
- **Latest-call link before organized is ready:** the company "latest call" row links to
  `/app/live/{transcriptId}`. That page must render raw-until-organized too — show the raw transcript +
  poll, swap to organized when complete — mirroring #4. (Plan will confirm `loadCompletedCall` /
  `/app/live/[id]/page.tsx` handling for a `processing` row.)

### 7. Capture-reset is the fix for the wrong-transcript bug
Covered by #1: truncating `broadcast-*` on engine startup means the finish organizes only the current run.
The hardcoded `DEMO_CALL_ID` / company / quarter stay (the live route is hardwired to the תמיס demo); real
per-call identity arrives with MAYA and is **out of scope** here.

## Data flow (end-to-end)

```
source stops → engine: liveEnded=true, endedAt=now  ──/state──▶ clients
  LiveBroadcastView: onSourceEnded → POST /api/live/finish (processing) ; card shows (auto-dismiss 5s)
  LiveBroadcastView: keeps LIVE, draining edge = delayedLiveEdge(...) ramps to true end over `buffer`s
  Home/company: still show LIVE (hostedLiveOver=false)
buffer drained (now ≈ endedAt + buffer):
  LiveBroadcastView: onLiveOver → LiveSession phase='finished'
  Home/company: hostedLiveOver=true → drop "Live Now"; latest finished call becomes the entry point
  Finished view: raw transcript (default text) → auto-swaps to organized when /api/live/finish = completed
```

## Error handling / edge cases
- **Finish slower than the buffer** (typical: ~5-min finish vs 3–4-min buffer): the finished view shows raw
  text first, then auto-upgrades — by design.
- **User joins mid-drain:** `bufferGate` already returns `ready` once ended; they drop in at the draining
  edge and ride it to the end. Home/company compute the same `over` from `endedAt`.
- **Refresh during drain:** `/state` still reports `liveEnded` + `endedAt`; the draining edge is recomputed
  from `endedAt`, so the view resumes mid-drain rather than jumping to the end.
- **Engine offline:** `/api/live/state` returns `offline` with `endedAt:null` → panels show "no live", live
  view shows "connecting" (unchanged).

## Testing
- **Unit:** `liveTiming` helpers already covered. Add a focused test asserting `delayedLiveEdge` +
  `hostedLiveOver` compose as "live through `buffer`s after end, then over" using a fixed `endedAt`/`now`.
- **tsc + full `next build` + `npm test`** green before any commit (per the workflow).
- **Live Zoom test** (the real gate): keep-live-through-drain feels continuous; call stays in Home/company
  through the drain; at drain-end it becomes the latest finished call; finished shows raw → organized;
  the processing card auto-dismisses after 5s; the finished transcript is **this** call (capture reset).

## Out of scope (deferred to MAYA / production)
- Real per-call ids/company/quarter (drop the hardcoded `DEMO_CALL_ID`).
- Per-recording (not per-process) capture isolation + copy-to-storage.
- HLS migration (Quartr-style) — tracked separately as 2D.

## Self-review
- Covers all 7 confirmed changes (drain, home/company live-through-drain, no processing state, raw→organized
  finished, #1 header→card, 5s auto-dismiss, capture reset). ✓
- Reuses tested helpers (`delayedLiveEdge`/`viewerEnded`/`hostedLiveOver`); one new engine field (`endedAt`)
  is the only new data. ✓
- Ambiguities resolved: "default text" = raw captured transcript; #1's ended text moves entirely into the
  auto-dismissing card; capture reset is per-engine-run for the demo. ✓
- Scope: single coherent end-of-call feature on `feat/live-phase2`; production identity explicitly deferred. ✓
