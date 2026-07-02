# Live View — Unified Professional UX Fixes Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, this session).
> Steps use checkbox (`- [ ]`) syntax. **COMMITS ARE DEFERRED** — build into the working tree; do
> NOT `git commit` (founder reviews the tree; the tree has prior uncommitted work).

**Goal:** Make the live transcript view a single, professional, trustworthy experience by fixing the
four founder-reported issues: (1) one unified live component for Home + Company, (2) a universal
self-adjusting buffer countdown, (3) end-of-call playback that catches up the remaining buffer
instead of cutting off, (4) stable, non-jittery timers with reliable click-word-seek + LIVE snap.

**Architecture:** Root cause is that the live UI mixes two clocks — the engine's `liveEdge` (polled
every ~1.5 s) and the Web-Audio playhead (every 100 ms) — and that two entry points pass different
`delay` values. Fix = a single source of truth for the buffer + a small set of **pure, unit-tested
timing functions** (`src/lib/live/liveTiming.ts`) that interpolate the edge smoothly, gate the
pre-roll, decide when the viewer has truly caught up, and locate the buffer's front edge. Wire them
into `LiveBroadcastView`; the streaming/Web-Audio engine is left intact.

**Tech Stack:** TypeScript, React (Next 14 client component), Web Audio API, Node `tsx` + `node:test`.

**Reviewed root causes (for the implementer):**
- **#1 & #2 (same cause):** Home and Company already open the *same* `LiveBroadcastView` via
  `/app/live/live`; Home links with `?delay=60`, Company uses the default `300`. The countdown logic
  is already correct/self-adjusting. → Unify the buffer policy; drop Home's override.
- **#3:** The full player already keeps playing after `liveEnded`; what reads wrong is that the UI
  flips to "ended" the instant the *backend* ends, while the viewer still has buffered audio. → The
  viewer's "ended" must mean *the delayed playhead reached the true end*.
- **#4:** `behind = liveEdge − playhead` and the scrubber duration step every 1.5 s (poll) while the
  playhead moves every 100 ms → sawtooth (the 5:03↔5:04 flicker; jumpy remaining-time). → Interpolate
  the edge by wall-clock between polls so both sides advance smoothly.

---

### Task 1: Pure timing helpers + unit tests — ✅ ALREADY DONE

**Files:** `src/lib/live/liveTiming.ts`, `src/lib/live/liveTiming.test.ts`

Exports: `LIVE_BUFFER_SEC = 300`, `interpolatedEdge(rawEdge, anchorWallMs, nowMs, ended)`,
`viewerEnded(backendEnded, playhead, edge, eps=1)`, `frontEdge(edge, bufferSec, backendEnded)`,
`bufferGate(audioStartRel, edge, bufferSec, backendEnded) → { phase, countdown }`.

- [x] Helpers written.
- [x] 8 unit tests written and passing (`node --import tsx --test src/lib/live/liveTiming.test.ts`).

---

### Task 2: Unify the two entry points to one buffer policy

**Files:**
- Modify: `src/components/app/LiveNowPanel.tsx:39`
- Modify: `src/app/app/live/[id]/page.tsx`

- [ ] **Step 1: Drop Home's delay override** — `LiveNowPanel.tsx`, change the link:

```tsx
href="/app/live/live"
```
(was `href="/app/live/live?delay=60"`). Now Home and Company both open the live page with no
per-entry delay, so both use the single default. `?delay=` survives only as an explicit testing knob.

- [ ] **Step 2: Make the page default the single source of truth** — `src/app/app/live/[id]/page.tsx`.
Add the import:

```tsx
import { LIVE_BUFFER_SEC } from '@/lib/live/liveTiming'
```

and replace the two `300` literals in the `id === 'live'` branch:

```tsx
const d = searchParams.delay ? Number(searchParams.delay) : LIVE_BUFFER_SEC
return (
  <AppPage>
    <LiveBroadcastView
      companyName={company?.displayName ?? 'תמיס'}
      companyId={company?.id ?? null}
      quarter="Q2 2026"
      logoUrl={company?.logoUrl ?? null}
      delaySec={Number.isFinite(d) && d > 0 ? d : LIVE_BUFFER_SEC}
    />
  </AppPage>
)
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → expect clean.

---

### Task 3: Wire the timing helpers into `LiveBroadcastView`

**File:** `src/components/live/LiveBroadcastView.tsx` (apply each edit exactly)

- [ ] **3.1 — Import helpers + default the buffer.** After the `formatDate` import add:

```tsx
import { interpolatedEdge, viewerEnded, frontEdge, bufferGate, LIVE_BUFFER_SEC } from '@/lib/live/liveTiming'
```

Change the prop default `delaySec = 300` → `delaySec = LIVE_BUFFER_SEC`.

- [ ] **3.2 — Add interpolation refs.** After `const pausedRef = useRef(false)`:

```tsx
  const rawEdgeRef = useRef(0)   // last polled live edge (recording seconds)
  const edgeWallRef = useRef(0)  // wall-clock ms at that poll — to interpolate between polls
```

- [ ] **3.3 — Decouple the transcript memo from the fast edge** (so karaoke doesn't rebuild every
100 ms). Replace the `transcript` useMemo body's `durationSec` + deps:

```tsx
  const transcript = useMemo<WordTimedTranscript>(() => {
    const w = words.map((x) => ({ text: x.text, start: x.start ?? 0, end: x.start ?? 0 }))
    return {
      segments: [
        { id: 'live', speakerId: 'live', speakerName: companyName, role: null, words: w, start: 0, end: w.at(-1)?.start ?? 0 },
      ],
      durationSec: w.at(-1)?.start ?? 0,
      hasWordTimings: true,
    }
  }, [words, companyName])
```

- [ ] **3.4 — Make `refresh()` data-only** (phase/countdown move to the 100 ms tick). Replace the whole
`async function refresh() { … }`:

```tsx
    async function refresh() {
      try {
        const r = await fetch('/api/live/state', { cache: 'no-store' })
        const st: LiveState = await r.json()
        if (!alive) return
        stRef.current = st
        setLiveEnded(st.liveEnded)
        rawEdgeRef.current = st.liveEdgeRel ?? 0
        edgeWallRef.current = Date.now()

        const newLines = st.lines.slice(seenLinesRef.current)
        if (newLines.length) {
          const add: LiveWord[] = []
          for (const l of newLines) for (const w of l.words) add.push(w)
          setWords((prev) => [...prev, ...add])
          seenLinesRef.current = st.lines.length
        }
      } catch {
        /* keep last state */
      }
    }
```

- [ ] **3.5 — Rewrite the 100 ms tick** to interpolate the edge, drive phase/countdown, and advance the
playhead. Replace the existing `const ph = setInterval(() => { … }, 100)`:

```tsx
    // 10fps tick: interpolate the live edge smoothly between the 1.5s polls (kills the "behind live"
    // + remaining-time sawtooth), drive phase/countdown, and advance the playhead.
    const ph = setInterval(() => {
      const st = stRef.current
      const ended = !!st?.liveEnded
      const edge =
        edgeWallRef.current === 0
          ? rawEdgeRef.current
          : interpolatedEdge(rawEdgeRef.current, edgeWallRef.current, Date.now(), ended)
      setLiveEdge((prev) => (ended ? edge : Math.max(prev, edge)))

      if (startedRef.current) {
        const ctx = ctxRef.current
        if (ctx && playPosRef.current !== null) {
          setPlayingRel(Math.max(0, playPosRef.current - (nextAtRef.current - ctx.currentTime)))
        }
        setPhase('playing')
        return
      }
      if (!st) {
        setPhase('connecting')
        return
      }
      if (st.offline || st.audioStartRel === null) {
        setPhase('waiting')
        return
      }
      const g = bufferGate(st.audioStartRel, edge, delaySec, st.liveEnded)
      setPhase(g.phase)
      setCountdown(g.countdown)
    }, 100)
```

- [ ] **3.6 — LIVE button snaps to the buffer's front edge.** Replace `goLive`:

```tsx
  function goLive() {
    const st = stRef.current
    seek(frontEdge(st?.liveEdgeRel ?? 0, delaySec, !!st?.liveEnded))
  }
```

- [ ] **3.7 — Derive viewer-ended + edges.** Replace the `behind` / `broadcastEdge` lines (just below
the `fmt` helper):

```tsx
  const ended = viewerEnded(liveEnded, playingRel, liveEdge) // "over" only once the delayed playhead caught up
  const behind = Math.max(0, liveEdge - playingRel)
  const broadcastEdge = frontEdge(liveEdge, delaySec, liveEnded)
```

- [ ] **3.8 — Use `ended` (not backend `liveEnded`) in the UI** so the live experience persists until
the viewer catches up. Make these four substitutions:
  - Header badge: `{ended ? 'הסתיים' : dict.live.liveBadge}` (was `{liveEnded ? …}`).
  - "behind live" indicator condition: `{phase === 'playing' && !ended && (` (was `{phase === 'playing' && (`).
  - "back to live" button condition: `{phase === 'playing' && !ended && (` (was `… && !liveEnded &&`).
  - MediaPlayer props: `chapter={ended ? undefined : 'Live session'}` and `isLive={!ended}` (were `liveEnded`).

- [ ] **3.9 — Typecheck** — `npx tsc --noEmit` → expect clean (watch for any now-unused symbol).

---

### Task 4: Verify

- [ ] **Step 1: Wire the new test into `npm test`** — `package.json`, append to the `test` script:
`src/lib/live/liveTiming.test.ts`.
- [ ] **Step 2: Run tests** — `npm test` → all suites pass (existing + finishLiveCall + liveTiming).
- [ ] **Step 3: Build** — `npx next build` → green (the live route compiles).

---

### Task 5: Re-run the Or Yam replay → founder tests the live UX

- [ ] **Step 1: (Re)start the replay engine** on `:8788` with the session-1 (Or Yam) files already
prepped in `scripts/out/`. Use realtime so the smoothing is accurate, and a small offset so the
countdown is short to watch:

```
REPLAY_OFFSET=30 REPLAY_SPEED=1 node scripts/live-replay-engine.mjs
```

- [ ] **Step 2: Confirm engine + proxy** — `curl :8788/state` and `curl :3003/api/live/state` both
return `offline=false` with an advancing `liveEdgeRel`.
- [ ] **Step 3: Founder opens** `http://localhost:3003/app/live/live?delay=60` (test override; prod is
`LIVE_BUFFER_SEC`). **Acceptance checklist:**
  - Countdown shows and ticks **down smoothly** to 0, then "join".
  - After joining: the **"behind live"** indicator is stable (no 5:03↔5:04 flicker); the player-bar
    timer + remaining-time are stable.
  - **Click a word** → audio + timer jump to it in sync. **LIVE** button snaps to the front edge.
  - Let it run to the end: when the backend call ends, playback **keeps going** until the delayed
    playhead reaches the true end (no premature cutoff), then shows "ended".

> **GATE:** stop here and hand to the founder. Do NOT run Task 6 until the founder confirms the UX.

---

### Task 6: Code review (AFTER founder confirms the UX), then fix

- [ ] **Step 1:** Dispatch the cold-context `reviewer` agent over `liveTiming.ts`, the
`LiveBroadcastView` changes, the entry-point changes, and `liveTiming.test.ts` — for correctness
(timing math, no regressions in the Web-Audio scheduling), races, and React-effect soundness.
- [ ] **Step 2:** Fix any real findings; re-run `tsc` + `npm test` + build. Then the founder does the
final acceptance test.

---

## Self-Review

**Spec coverage:** Issue 1 → Task 2. Issues 2 (countdown) → Task 1 `bufferGate` + Task 3.5. Issue 3
(end catch-up) → `viewerEnded`/`frontEdge` (Task 1) + Task 3.6/3.7/3.8. Issue 4 (jitter + seek/LIVE)
→ `interpolatedEdge` (Task 1) + Task 3.5 (smooth edge) + existing `seek` (word-click) + Task 3.6
(LIVE). All four covered. The richer "live view = finished page parity + transition" is explicitly a
*later* phase, not in this plan.

**Placeholder scan:** every code step has exact code + exact file. No TBD/TODO.

**Type consistency:** `interpolatedEdge`/`viewerEnded`/`delayedLiveEdge`/`bufferGate`/`LIVE_BUFFER_SEC`
match the implemented `liveTiming.ts` signatures. `ended` is a derived local used consistently in 3.7
and 3.8. `rawEdgeRef`/`edgeWallRef` defined in 3.2, used in 3.4/3.5.

---

### Task 7: End-of-source transition fix (buffer drains, no timeline jump) — found in test

**Problem (founder, real-call test):** when the source call ended, the scrubber instantly jumped from
the live framing (playhead pinned far-right of a `liveEdge − buffer` timeline) to a fixed full-length
timeline (playhead mid-left of 7:43), and "Return to live" leapt to the absolute end — bypassing the
~5 min of buffered audio the viewer hadn't heard. **Root cause:** `broadcastEdge` and `goLive` were
keyed to the backend `liveEnded` flag, which flips the front edge to the full `liveEdge` instantly.

**Fix:** replace the `frontEdge(edge, buffer, ended)` (instant-jump) helper with
`delayedLiveEdge(liveEdge, buffer, endedAtWallMs, nowMs)` — `liveEdge − buffer` while live, then a 1x
wall-clock **ramp** from that freeze point to the true end after the source ends (capped). The
scrubber length, playhead-pinned-right framing, seek clamp, pump fetch window, and Return-to-live all
follow this draining edge. The mode only becomes "finished" when `viewerEnded` (the playhead reaches
the true end) — unchanged.

**Files:** `src/lib/live/liveTiming.ts` (+ test), `src/components/live/LiveBroadcastView.tsx`.

- [x] **Step 1:** Replace `frontEdge` with `delayedLiveEdge` in `liveTiming.ts`; swap the unit test
  (live-tracking + post-end 1x ramp capped at the true end).
- [ ] **Step 2:** In `LiveBroadcastView`: import `delayedLiveEdge` (drop `frontEdge`); add
  `endedWallRef = useRef<number|null>(null)`; in the poll set
  `endedWallRef.current = st.liveEnded ? (endedWallRef.current ?? Date.now()) : null`; route the pump
  `allowedEnd`, the `seek` clamp, `goLive`, and `broadcastEdge` through
  `delayedLiveEdge(edge, delaySec, endedWallRef.current, Date.now())`.
- [ ] **Step 3:** Verify (`tsc` + `npm test`); HMR picks up the component (no rebuild needed mid-test).
- [ ] **Step 4:** Re-test the Or Yam replay pre-positioned near the end (`REPLAY_OFFSET≈350`) so the
  source-end transition is observable in ~1–2 min: no timeline jump, playhead stays right, "Return to
  live" follows the draining edge, "finished" only when the playhead reaches the true end.
