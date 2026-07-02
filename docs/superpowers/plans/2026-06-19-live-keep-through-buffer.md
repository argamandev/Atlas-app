# Live: keep "LIVE" through the buffer drain → clean finish — Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`. Each task is
> its own commit on `feat/live-phase2` (NOT merged to main until the founder tests). Spec:
> `docs/superpowers/specs/2026-06-19-live-keep-through-buffer-design.md`.

**Goal:** When the source audio stops, the live view stays LIVE and drains the buffer (no cutoff); it stays
discoverable as live on Home/company through the drain; at drain-end it becomes a finished call (raw
transcript → auto-swaps to organized); the "ended/processing" message lives only in an auto-dismissing card;
and the finish organizes only the current call.

**Architecture:** Re-wire the already-tested drain helpers (`delayedLiveEdge`/`viewerEnded`/`hostedLiveOver`)
that the free-recording pass stopped calling. The engine exposes `endedAt` (wall-clock ms the source ended)
so every client computes the same drain progress. `LiveBroadcastView` renders LIVE through the drain then a
raw "over" recording; `LiveSession` auto-swaps to the organized `LiveTranscriptView` once it's ready.

**Tech stack:** Next.js 14, TypeScript, the Node spike engine `scripts/live-broadcast.mjs`, `node --test`.

**File map:**
- `scripts/live-broadcast.mjs` — expose `endedAt`; truncate capture files on startup.
- `src/app/api/live/state/route.ts` — add `endedAt:null` to the offline fallback.
- `src/lib/live/liveTiming.test.ts` — composition test.
- `src/components/live/LiveBroadcastView.tsx` — drain re-wire, header/player "over" mode, two callbacks.
- `src/components/live/LiveSession.tsx` — `liveOver`, auto-swap, raw-until-organized, 5s auto-dismiss.
- `src/components/app/LiveNowPanel.tsx` + `src/components/company/CompanyOverview.tsx` — live through drain.

---

### Task 1: liveTiming composition test (TDD)

**Files:** Modify `src/lib/live/liveTiming.test.ts`

- [ ] **Step 1: Add the failing test.** Append (the file already imports from `./liveTiming` with
  `node:test`/`node:assert` — match its existing import style):

```ts
test('live → drains for bufferSec after end → over (compose delayedLiveEdge + hostedLiveOver)', () => {
  const buffer = 180
  const liveEdge = 600 // frozen at end
  const endedAt = 1_000_000

  // while live (endedAt null): edge held bufferSec behind, not over
  const liveNow = delayedLiveEdge(liveEdge, buffer, null, endedAt)
  assert.equal(liveNow, liveEdge - buffer)
  assert.equal(hostedLiveOver(true, liveNow, liveEdge), false)

  // 1 min into the drain: edge advanced ~60s, still not over
  const mid = delayedLiveEdge(liveEdge, buffer, endedAt, endedAt + 60_000)
  assert.equal(Math.round(mid), liveEdge - buffer + 60)
  assert.equal(hostedLiveOver(true, mid, liveEdge), false)

  // bufferSec after end: edge reached the true end → over
  const end = delayedLiveEdge(liveEdge, buffer, endedAt, endedAt + buffer * 1000)
  assert.equal(end, liveEdge)
  assert.equal(hostedLiveOver(true, end, liveEdge), true)
})
```

- [ ] **Step 2: Run it.** `npm test` → the new test PASSES (the helpers already implement this; the test
  documents the compose invariant). If it fails, fix the test to match the helper semantics in
  `liveTiming.ts` — do not change the helpers.
- [ ] **Step 3: Commit.**
```bash
git add src/lib/live/liveTiming.test.ts
git commit -m "test(live): drain+over composition invariant"
```

---

### Task 2: Engine — expose `endedAt`, reset capture per run

**Files:** Modify `scripts/live-broadcast.mjs`

- [ ] **Step 1: Truncate the capture files on startup.** After `if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR,
  { recursive: true })` (line ~32) add:
```js
// Each engine run = one call (we restart the engine per call). Reset the capture so the finish
// organizes ONLY this call, never the accumulated history of every past call.
writeFileSync(LINES_FILE, '')
writeFileSync(PCM_FILE, Buffer.alloc(0))
```
(`writeFileSync` is already imported on line 18.)

- [ ] **Step 2: Add the `endedAt` state.** Next to `let liveEnded = false` (line ~123) add:
```js
let endedAt = null // wall-clock ms when the source audio stopped (drives the client buffer drain)
```

- [ ] **Step 3: Set it when the source ends.** In the websocket `close` handler (line ~229-232) change:
```js
  sock.on('close', () => {
    console.log('[audio] websocket closed (call likely ended)')
    liveEnded = true
    if (endedAt === null) endedAt = Date.now()
  })
```

- [ ] **Step 4: Expose it in `/state`.** Change the `/state` response (line ~188) to include `endedAt`:
```js
    res.end(JSON.stringify({ audioStartRel, liveEdgeRel: liveEdgeRel(), liveEnded, endedAt, sampleRate: SAMPLE_RATE, lines }))
```

- [ ] **Step 5: Verify.** Restart the engine, then:
  `curl -s http://localhost:8788/state` → expect `{"audioStartRel":null,...,"liveEnded":false,"endedAt":null,...,"lines":[]}`
  and `lines:[]` (files were truncated). (No tsc — it's a `.mjs` script.)

- [ ] **Step 6: Commit.**
```bash
git add scripts/live-broadcast.mjs
git commit -m "feat(live-engine): expose endedAt; reset capture files per run"
```

---

### Task 3: State route — `endedAt` in the offline fallback

**Files:** Modify `src/app/api/live/state/route.ts`

- [ ] **Step 1: Add the field.** In the `catch` fallback object (lines ~17-24) add `endedAt: null,`:
```ts
    return NextResponse.json({
      audioStartRel: null,
      liveEdgeRel: null,
      liveEnded: false,
      endedAt: null,
      sampleRate: 16000,
      lines: [],
      offline: true,
    })
```
(The success path already passes the engine JSON through verbatim, so `endedAt` rides along.)

- [ ] **Step 2: tsc.** `npx tsc --noEmit` → clean.
- [ ] **Step 3: Commit.**
```bash
git add src/app/api/live/state/route.ts
git commit -m "feat(live): pass endedAt through the state proxy"
```

---

### Task 4: Live view — keep LIVE through the drain, then a raw "over" recording

**Files:** Modify `src/components/live/LiveBroadcastView.tsx`

- [ ] **Step 1: Import the drain helpers.** Change line 17:
```ts
import { interpolatedEdge, bufferGate, delayedLiveEdge, hostedLiveOver, LIVE_BUFFER_SEC } from '@/lib/live/liveTiming'
```

- [ ] **Step 2: Add `endedAt` to `LiveState` + a prop `onLiveOver`.** In the `LiveState` interface (lines
  25-32) add `endedAt: number | null`. In the component prop list (lines 45-54) add `onLiveOver?: () => void`
  next to `onSourceEnded`, and destructure it (line ~44).

- [ ] **Step 3: Track `endedAt` reactively.** Add a state near the others (line ~61):
```ts
  const [endedAt, setEndedAt] = useState<number | null>(null)
```
In `refresh()` after `setLiveEnded(st.liveEnded)` (line ~136) add:
```ts
        setEndedAt(st.endedAt ?? null)
```

- [ ] **Step 4: Drain the pump's allowed end.** Replace the `allowedEnd` line (line ~159):
```ts
      // delaySec behind the edge while live; after the source ends, drain at 1x toward the true end.
      const allowedEnd = delayedLiveEdge(st.liveEdgeRel ?? 0, delaySec, st.endedAt ?? null, Date.now())
```

- [ ] **Step 5: Drained edge + `over` in render scope.** Replace `broadcastEdge` (line ~361):
```ts
  // Front of the playable window: delaySec behind the edge while live, draining to the true end after the
  // source ends. Recomputed each 100ms tick (setLiveEdge/setPlayingRel re-render) so it ramps smoothly.
  const broadcastEdge = delayedLiveEdge(liveEdge, delaySec, endedAt, Date.now())
  // The hosted call is over for everyone once the drain reaches the true end → flip to finished.
  const over = hostedLiveOver(liveEnded, broadcastEdge, liveEdge)
```

- [ ] **Step 6: Fire both signals.** Replace the source-ended effect (line ~364):
```ts
  // Source stopped → start the finish (the wrapper shows the auto-dismissing card). View stays LIVE.
  useEffect(() => { if (liveEnded) onSourceEnded?.() }, [liveEnded]) // eslint-disable-line react-hooks/exhaustive-deps
  // Buffer fully drained → tell the wrapper the live experience is over (swap to finished when ready).
  useEffect(() => { if (over) onLiveOver?.() }, [over]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 7: Seek + goLive use the drained edge.** Replace `seek`'s maxEnd (line ~284):
```ts
    const maxEnd = broadcastEdge
```
and `goLive` (line ~296):
```ts
    seek(broadcastEdge)
```
(Both now reference the render-scope `broadcastEdge`; `seek`/`goLive` are defined above it, so lift
`broadcastEdge`/`over` to just after `const behind = ...` at line ~358 — i.e., compute them before `seek`.
Move the two `const` lines from Step 5 to directly follow `const behind = Math.max(0, liveEdge - playingRel)`
and keep `seek`/`goLive` referencing them.)

> NOTE for the implementer: `seek` and `goLive` are declared (lines 281-297) *above* where `broadcastEdge`
> currently sits (line 361). Define `broadcastEdge` + `over` once, near the top of the component body (right
> after `playingRel`/`liveEdge` state, before `seek`), and delete the later duplicate. Everything else
> references the single definition.

- [ ] **Step 8: Header — LIVE through the drain, no badge once over.** Replace the top-right block (the
  `{liveEnded ? (ended status) : (LIVE pill)}` added last round, lines ~399-413) with:
```tsx
        {/* top-right: LIVE pill through the whole live+drain window; once the drain is over the badge
            drops (the view is becoming a finished recording; the "ended/processing" note is in the card). */}
        <div className="flex shrink-0 items-center gap-3">
          {!over && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-live/10 px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
              <span className="text-2xs font-bold tracking-wide text-live">{dict.live.liveBadge}</span>
            </span>
          )}
          <IconButton label={dict.common.close} size={30} onClick={() => router.push('/app/home')}>
            <CloseIcon size={17} />
          </IconButton>
        </div>
```

- [ ] **Step 9: Behind-indicator shows through the drain.** Change its guard (line ~393) from
  `{phase === 'playing' && !liveEnded && (` to `{phase === 'playing' && !over && (` so the
  "-M:SS behind…" pill stays during the drain (shrinking toward 0) and disappears only when over.

- [ ] **Step 10: Player stays live through the drain.** Change the `MediaPlayer` props (lines ~483-488):
```tsx
        chapter={over ? undefined : 'Live session'}
        currentTime={playingRel}
        duration={broadcastEdge}
        playing={phase === 'playing' && !paused}
        isLive={!over}
        onGoLive={goLive}
```

- [ ] **Step 11: tsc.** `npx tsc --noEmit` → clean. (`viewerEnded` may be unused; that's fine — it's an
  exported helper. Do not import it if unused, to avoid a lint error.)
- [ ] **Step 12: Commit.**
```bash
git add src/components/live/LiveBroadcastView.tsx
git commit -m "feat(live): keep LIVE through the buffer drain; raw 'over' recording at drain-end"
```

---

### Task 5: Wrapper — auto-swap at drain-end, raw-until-organized, 5s auto-dismiss

**Files:** Modify `src/components/live/LiveSession.tsx`

- [ ] **Step 1: Track drain-over.** Add state near the others (line ~26):
```ts
  const [liveOver, setLiveOver] = useState(false)
```

- [ ] **Step 2: Auto-dismiss the processing card after 5s.** After the existing state, add:
```ts
  // The "source ended — AI is processing" card is a transient heads-up: auto-close after 5s (or ✕).
  useEffect(() => {
    if (!(sourceEnded && phase === 'live' && finishStatus === 'processing' && !dismissed['processing'])) return
    const t = setTimeout(() => setDismissed((d) => ({ ...d, processing: true })), 5000)
    return () => clearTimeout(t)
  }, [sourceEnded, phase, finishStatus, dismissed])
```

- [ ] **Step 3: Auto-swap to the organized finished view at drain-end.** Add:
```ts
  // Stay LIVE through the whole drain (liveOver=false). Once the drain is over AND the organized
  // transcript is ready, swap to the finished view in place. If it's not ready yet, the drained
  // LiveBroadcastView (now a raw, badge-less recording) stays until it is — "default text" first.
  useEffect(() => {
    if (liveOver && finishedCall) setPhase('finished')
  }, [liveOver, finishedCall])
```

- [ ] **Step 4: Pass the callback to the live view.** In the `<LiveBroadcastView .../>` render (line ~133)
  add `onLiveOver={() => setLiveOver(true)}` alongside `onSourceEnded={onSourceEnded}`.

- [ ] **Step 5: Don't tempt a jump during the drain.** The `showCard` gate (lines ~125-129) currently shows
  the `ready`/`failed` cards while `phase === 'live'`. Keep the processing card; gate the `ready` card so it
  only appears once `liveOver` (so during the drain we show only the auto-dismissing processing card, never a
  "View" button that would skip the live drain):
```ts
  const showCard =
    sourceEnded &&
    phase === 'live' &&
    !dismissed[cardKey] &&
    ((finishStatus === 'processing') ||
      (liveOver && (finishStatus === 'ready' || finishStatus === 'failed')))
```

- [ ] **Step 6: tsc.** `npx tsc --noEmit` → clean.
- [ ] **Step 7: Commit.**
```bash
git add src/components/live/LiveSession.tsx
git commit -m "feat(live): drain-end auto-swap to organized; raw-until-ready; 5s card auto-dismiss"
```

---

### Task 6: Home + company stay LIVE through the drain

**Files:** Modify `src/components/app/LiveNowPanel.tsx`, `src/components/company/CompanyOverview.tsx`

- [ ] **Step 1: LiveNowPanel — live until the drain is over.** Add the import (line ~5):
```ts
import { delayedLiveEdge, hostedLiveOver, LIVE_BUFFER_SEC } from '@/lib/live/liveTiming'
```
Replace the `setLive(...)` line (line ~20):
```ts
        if (alive) {
          const edge = st.liveEdgeRel ?? 0
          const drained = delayedLiveEdge(edge, LIVE_BUFFER_SEC, st.endedAt ?? null, Date.now())
          const over = hostedLiveOver(!!st.liveEnded, drained, edge)
          setLive(st.audioStartRel !== null && !over)
        }
```

- [ ] **Step 2: CompanyOverview — same change.** Add the same import (line ~9 area), and replace the
  `setEngineLive(...)` line (line ~40):
```ts
        if (alive) {
          const edge = s.liveEdgeRel ?? 0
          const drained = delayedLiveEdge(edge, LIVE_BUFFER_SEC, s.endedAt ?? null, Date.now())
          const over = hostedLiveOver(!!s.liveEnded, drained, edge)
          setEngineLive(s.audioStartRel !== null && !over)
        }
```

- [ ] **Step 3: tsc.** `npx tsc --noEmit` → clean.
- [ ] **Step 4: Commit.**
```bash
git add src/components/app/LiveNowPanel.tsx src/components/company/CompanyOverview.tsx
git commit -m "feat(live): Home + company stay LIVE through the buffer drain"
```

---

### Task 7: Verify + live test

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** `npm test` → all pass (incl. Task 1).
- [ ] **Step 3:** `npm run build` → clean.
- [ ] **Step 4:** Update `PROGRESS.md` (new entry: keep-live-through-drain + clean finish, commits, awaiting
  test) and commit (`docs: ...`).
- [ ] **Step 5:** Restart engine (clean state) + dev server; founder runs cloudflared + a Zoom call. Verify
  on a real call: live drains through the buffer after the source stops (no cutoff); stays in Home/company
  through the drain; at drain-end the LIVE badge drops and it becomes a finished recording → auto-swaps to
  the organized transcript when ready; the processing card auto-dismisses after 5s; the finished transcript
  is **this** call.

## Known scope note (flag to founder)
The drained `LiveBroadcastView` ("over" mode: raw captions, scrubbable, no LIVE badge) is the "default text"
shown between drain-end and organized-ready, then it auto-swaps to the organized `LiveTranscriptView`. A user
who navigates **away** and returns during the narrow post-drain/pre-organized window (~1–2 min, since the
finish starts at source-end and usually completes near drain-end) is covered by Home/company showing the call
as live through the drain; a dedicated raw "finished" entry + the latest-call-link-before-organized is a small
optional follow-up (it needs the company list to surface the in-flight row + a client poll on that page).

## Self-Review
- **Spec coverage:** #1 drain→Task 4; #2 home/company→Task 6; #3 no-processing-state→inherent (no surface
  added); #4 raw-until-organized→Task 5 (drained LBV → auto-swap); #5 header→card→Task 4 step 8; #6 5s
  auto-dismiss→Task 5 step 2; #7 capture reset→Task 2. `endedAt` plumbing→Tasks 2/3/4. ✓
- **Placeholders:** none — every step has concrete code/commands. ✓
- **Type consistency:** `endedAt: number | null` used identically in engine JSON, route fallback, `LiveState`,
  and both panels (`st.endedAt ?? null`); `delayedLiveEdge(edge, buffer, endedAt, nowMs)` and
  `hostedLiveOver(ended, drained, edge)` match `liveTiming.ts` signatures exactly. `over`/`liveOver` naming
  consistent across LBV (`over`) and LiveSession (`liveOver`). ✓
