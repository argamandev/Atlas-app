# Live UX — Final Polish (sync, visuals, chip) + merge Gemini fallback

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> Inline execution. **COMMITS as we go** (founder asked to push everything to main after a final test).

**Goal:** Close out the live-transcript UX: pragmatic cross-client convergence, the two visual/text
fixes, the return-to-transcript chip bug — and bring the merged Gemini fallback into this branch so
the final test (and prod) are 503-resilient. Then final test → merge to `main` → push → Phase 2.

---

### Task 0: Merge `main` (Gemini fallback) into `feat/live-ux-2a`

- [ ] `git merge main` from `feat/live-ux-2a`. Resolve conflicts — expected: `package.json` `test`
  script (combine both branches' test files), possibly `CLAUDE.md`/`PROGRESS.md`. `transcription.ts`
  comes from `main` (our branch never touched it → no conflict).
- [ ] `npx tsc --noEmit` — catch any `formatTranscript` signature drift vs `finishLiveCall`'s call;
  adapt the call if needed. Then `npm test` + `npx next build` green.

---

### Task 1: Fix 1 (pragmatic) — cross-client convergence on "return to live"

**File:** `src/components/live/LiveBroadcastView.tsx`

`goLive` currently snaps to the *locally-interpolated* edge, which differs per client. Snap to the
**engine's last-polled raw edge** (shared across clients) instead → both windows converge to within
~the poll interval (not exact lockstep — accepted for V1).

- [ ] Change `goLive`:
```tsx
  function goLive() {
    // engine's shared edge (not the per-client interpolated one) so two viewers converge on "live"
    seek(delayedLiveEdge(rawEdgeRef.current, delaySec, endedWallRef.current, Date.now()))
  }
```

---

### Task 2: Fix 2 — visual/text

**2a — `src/components/live/MediaPlayer.tsx`:** show **"LIVE"** on the far-right in live mode (instead
of the ~0 remaining-time). Replace the remaining-time span:
```tsx
            {isLive ? (
              <span className="ms-auto font-semibold text-live">LIVE</span>
            ) : (
              <span dir="ltr" className="ms-auto tabular-nums">-{formatClock(remaining)}</span>
            )}
```

**2b — `src/components/live/LiveBroadcastView.tsx`:** relabel the behind-indicator (it's the buffer =
latency behind the source call). Change `מאחורי החי` → `מאחורי שיחת המשקיעים המקורית`:
```tsx
              -{fmt(behind)} מאחורי שיחת המשקיעים המקורית
```

---

### Task 3: Fix 3 — "Return to transcript" chip showing inside the inline-swapped transcript

**Cause:** the chip shows when a call is loaded AND `pathname !== /app/live/<callId>`; the inline swap
keeps the URL at `/app/live/live`, so it mismatches and shows. Fix with a presence flag.

- [ ] **`src/lib/player/PlayerProvider.tsx`:** add `viewingId: string | null` state + `setViewing`
  to the API; expose both.
```tsx
  const [viewingId, setViewingId] = useState<string | null>(null)
  const setViewing = useCallback((id: string | null) => setViewingId(id), [])
  // …add `viewingId` and `setViewing` to the PlayerApi interface + the `api` object…
```
- [ ] **`src/components/live/LiveTranscriptView.tsx`:** on mount set the viewing id, clear on unmount:
```tsx
  const { setViewing } = usePlayer()
  useEffect(() => { setViewing(call.id); return () => setViewing(null) }, [call.id, setViewing])
```
- [ ] **`src/components/app/ReturnToTranscriptChip.tsx`:** hide when the player is *displaying* this call:
```tsx
  const { call, viewingId } = usePlayer()
  …
  if (pathname === href || viewingId === call.id) return null
```

---

### Task 4: Verify + final test + push

- [ ] `npx tsc --noEmit` clean · `npm test` pass · `npx next build` green.
- [ ] Bring up the final test: reset demo row, restart dev + replay (1-min buffer), send the founder
  the link. **No live test until the founder runs it.**
- [ ] On founder's OK: commit, **merge `feat/live-ux-2a` → `main`**, push. Then Phase 2.

## Self-Review
Covers all four founder items (sync pragmatic, 2a/2b visuals, chip) + the fallback merge + the push.
`viewingId`/`setViewing` names consistent across PlayerProvider↔chip↔LiveTranscriptView. `goLive`
uses the existing `rawEdgeRef`/`delayedLiveEdge`/`endedWallRef`. Exact code TBD-free.
