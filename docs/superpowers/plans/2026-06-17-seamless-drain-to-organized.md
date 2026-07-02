# Seamless Drain → Organized Transcript — Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When the live buffer finishes draining (the viewer has heard the entire call), the view should
**automatically and seamlessly become the organized/finished transcript** — instead of stopping on a dead
"ended" state with a manual "View organized transcript" button.

**Architecture:** `LiveBroadcastView` already fires `onHostedOver()` the moment the drain completes
(`ended = viewerEnded(...)` → the playhead reaches the true end). `LiveSession` currently ignores that
callback. We wire it: track `drainedOver`, pre-load the organized call as soon as the finish is `ready`,
and auto-swap to `LiveTranscriptView` the instant BOTH conditions hold (drain complete **and** organized
call loaded). The existing manual CTA stays as an early-exit during the drain.

**Tech Stack:** Next.js 14 client components, React state/effects, the existing finish pipeline.

---

## Session summary (what we did + discovered, 2026-06-16 → 17)

1. **Phase 2B (toolbar on live)** built + verified (tsc/tests/build green); founder approved ("looks amazing").
2. **Bug A — mid-call "View organized" CTA:** fixed by gating the finish UX on `sourceEnded` (this session
   seeing the source end), not on a polled status (the demo id is reused, so a prior `completed` row leaked).
3. **Real live-call validation:** Recall bot → tunnel → engine → live view proven end-to-end on real תמיס
   Zoom calls. Captions high quality (Gemini fixes real Hebrew STT errors).
4. **Bug B — finished transcript was the old demo:** fixed by `runLiveBroadcastFinish` (reads THIS call's
   captured `broadcast-*.{jsonl,pcm}`, waits for Recall's trailing captions to catch up, re-finishes the
   current call). Proven server-side: the organized row was Q2 2026 / 221s / 347 words (this call), not the
   Q1 demo.
5. **Bug C — buffer didn't survive source-end (the big one):** redesigned the post-source-end logic from a
   fragile `endedWall`/`delayedLiveEdge` drain-ramp to a **plain recording playthrough** (`liveEnded` →
   the whole buffer is playable; `ended` only once the viewer's playhead reaches the true end). **THE
   FAILURES TO REPRODUCE WERE A STALE BROWSER BUNDLE** — the founder's browser served cached old JS across
   dev restarts, so no fix (or instrumentation) ever loaded. After a hard refresh, an auto-trace
   (`/api/live/debug`) proved the drain works perfectly: `behind` drained 50→0 at 1×, audio buffered ahead,
   `ended` flipped only at the true end.
6. **This plan — the remaining UX gap:** once the drain reaches 0:00 the live experience "ends" abruptly.
   The founder wants it to **flow seamlessly into the organized transcript** instead. (Approved.)

---

### Task 1: Pure auto-swap predicate (testable)

**Files:**
- Modify: `src/lib/live/liveTiming.ts`
- Test: `src/lib/live/liveTiming.test.ts`

- [ ] **Step 1: Add the predicate** to `liveTiming.ts` (append at end):

```ts
/**
 * Seamless live→finished hand-off: swap to the organized transcript once the buffer has fully drained
 * (the viewer reached the true end) AND the organized call is loaded — so there is no dead "ended" state
 * and no manual click. Phase guard makes it a no-op after the swap.
 */
export function shouldAutoSwapToFinished(
  drainedOver: boolean,
  hasFinishedCall: boolean,
  phase: 'live' | 'finished',
): boolean {
  return drainedOver && hasFinishedCall && phase === 'live'
}
```

- [ ] **Step 2: Add the test** to `liveTiming.test.ts` (import it + a case):

```ts
test('shouldAutoSwapToFinished: only once drained AND organized call loaded AND still live', () => {
  assert.equal(shouldAutoSwapToFinished(false, false, 'live'), false) // nothing yet
  assert.equal(shouldAutoSwapToFinished(true, false, 'live'), false)  // drained, but organized not loaded
  assert.equal(shouldAutoSwapToFinished(false, true, 'live'), false)  // organized ready, but not drained
  assert.equal(shouldAutoSwapToFinished(true, true, 'live'), true)    // both → swap
  assert.equal(shouldAutoSwapToFinished(true, true, 'finished'), false) // already swapped → no-op
})
```

- [ ] **Step 3: Run** `npm test` — expect 43 pass.

---

### Task 2: Wire the seamless swap in LiveSession

**Files:**
- Modify: `src/components/live/LiveSession.tsx`

- [ ] **Step 1: Import the predicate** (top of file):

```ts
import { shouldAutoSwapToFinished } from '@/lib/live/liveTiming'
```

- [ ] **Step 2: Add `drainedOver` state + an auto-swap guard ref** (after `sourceEnded`):

```ts
  const [drainedOver, setDrainedOver] = useState(false) // the buffer fully drained (viewer hit the true end)
```
and after `pollingRef`:
```ts
  const autoSwapRef = useRef(false) // fire the seamless swap once
```

- [ ] **Step 3: Pre-load the organized call** as soon as the finish is ready, so the swap is instant.
  Add this effect (after the mount-restore effect):

```ts
  // Pre-load the organized call the moment the finish is ready, so both the manual CTA and the seamless
  // auto-swap are instant (no fetch flash).
  useEffect(() => {
    if (finishStatus !== 'ready' || finishedCall) return
    const id = idRef.current
    if (!id) return
    let alive = true
    fetch(`/api/live/finished-call/${id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => { if (alive && c) setFinishedCall(c as LiveCall) })
      .catch(() => {})
    return () => { alive = false }
  }, [finishStatus, finishedCall])
```

- [ ] **Step 4: Auto-swap** when drained + organized loaded. Add this effect:

```ts
  // Seamless hand-off: the instant the buffer has fully drained AND the organized call is loaded, swap
  // in place — no dead "ended" state, no manual click required.
  useEffect(() => {
    if (!autoSwapRef.current && shouldAutoSwapToFinished(drainedOver, !!finishedCall, phase)) {
      autoSwapRef.current = true
      setPhase('finished')
    }
  }, [drainedOver, finishedCall, phase])
```

- [ ] **Step 5: Make `viewOrganized` instant** when pre-loaded (replace the function body):

```ts
  async function viewOrganized() {
    if (finishedCall) { setPhase('finished'); return } // pre-loaded → instant
    const id = idRef.current
    if (!id) return
    try {
      const r = await fetch(`/api/live/finished-call/${id}`, { cache: 'no-store' })
      if (!r.ok) return
      setFinishedCall((await r.json()) as LiveCall)
      setPhase('finished')
    } catch { /* stay on live; user can retry */ }
  }
```

- [ ] **Step 6: Pass `onHostedOver`** to `LiveBroadcastView` (in the returned JSX):

```tsx
      onSourceEnded={onSourceEnded}
      onHostedOver={() => setDrainedOver(true)}
      notice={notice}
```

- [ ] **Step 7:** `npx tsc --noEmit` clean.

---

### Task 3: Self-verify

- [ ] `npx tsc --noEmit` clean · `npm test` (43) pass · `npx next build` green (kill dev first).
- [ ] Logic walkthrough (documented in PROGRESS.md): drain completes → `onHostedOver` → `drainedOver=true`;
  finish ready → organized call pre-loaded; both true → `setPhase('finished')` → `LiveTranscriptView` at the
  drain-end playhead. Manual CTA still works as an early exit mid-drain.
- [ ] Update PROGRESS.md: solution implemented + self-verified, **awaiting founder's joint test**.
- [ ] **Leave the temporary diagnostics** (`/api/live/debug`, the `dbgRef` trace, the green dev readout) in
  place for tomorrow's joint test; remove them as the final step before commit/push.

## Self-Review
- **Spec coverage:** drain-end dead state → auto-swap (Task 2). Pure predicate + test (Task 1). Verify (Task 3). ✓
- **No placeholders:** all code is concrete. ✓
- **Type consistency:** `shouldAutoSwapToFinished(boolean, boolean, 'live'|'finished')` used identically in
  the test and `LiveSession`. `finishedCall` is `LiveCall | null` → `!!finishedCall`. `phase` is `'live'|'finished'`. ✓
- **Edge cases:** drain completes before finish ready → waits for pre-load, then swaps (brief "ended +
  processing" only if the finish is unusually slow). Finish ready before drain → instant swap at drain-end.
  `autoSwapRef` + phase guard prevent double-swap. Manual CTA unaffected. ✓
