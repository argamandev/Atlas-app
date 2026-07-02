# Live UX — Post-2A-Test Fixes Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> Inline execution, this session. **COMMITS DEFERRED.** Fixes the 3 founder bug reports from the
> first 2A live test.

**Goal:** (1) Refresh no longer kicks back the playhead, drops the processing message, or shows a
phantom "ends in 1 minute." (2) The join overlay messaging matches state (ready → join now; buffering
→ ticking countdown). (3) When the AI finishes, the user is explicitly notified with a prominent
"View the organized transcript" button (replacing the silent auto-swap); AI-status text in English.

**Tech Stack:** React (Next 14 client components), sessionStorage, the existing live engine + finish.

**Files:**
- Modify `src/app/api/live/finish/route.ts` — add `GET` (status-only, no trigger).
- Modify `src/components/live/LiveBroadcastView.tsx` — ready overlay message; `persistKey` playhead
  persist+restore; `sawLiveRef` already-ended detection; `notice` → `ReactNode`.
- Modify `src/components/live/LiveSession.tsx` — mount status restore; English processing banner;
  done notification + "View" button (click → swap); drop the drain-gated auto-swap.

---

### Task 1: `GET /api/live/finish` (status-only, for refresh restore)

**File:** `src/app/api/live/finish/route.ts`

- [ ] Add a `GET` export (POST unchanged):

```ts
export async function GET() {
  const { data } = await supabaseAdmin
    .from('transcripts').select('status').eq('id', DEMO_CALL_ID).maybeSingle()
  return NextResponse.json({ id: DEMO_CALL_ID, status: data?.status ?? 'none' })
}
```

---

### Task 2: `LiveBroadcastView` — messaging, refresh resilience

**File:** `src/components/live/LiveBroadcastView.tsx`

- [ ] **2.1 Props:** add `persistKey?: string`; change `notice?: string` → `notice?: React.ReactNode`.

- [ ] **2.2 Issue 2 — ready overlay message.** Change the `overlayMsg` ready (final) branch from
`` `השידור זמין — בהשהיה של ${fmt(delaySec)} מאחורי החי` `` to:
```ts
        : 'השידור זמין — הצטרפו לצפייה'
```

- [ ] **2.3 Issue 1b — already-ended detection (no phantom ramp).** Add a ref by the others:
```tsx
  const sawLiveRef = useRef(false) // saw the source live (vs. it was already ended on first load)
```
In `refresh()`, replace `if (st.liveEnded && endedWallRef.current === null) endedWallRef.current = Date.now()` with:
```tsx
        if (!st.liveEnded) sawLiveRef.current = true
        if (st.liveEnded && endedWallRef.current === null) {
          // ended while watching → real-time drain; ended before we loaded (refresh) → ramp already done
          endedWallRef.current = sawLiveRef.current ? Date.now() : Date.now() - (delaySec * 1000 + 2000)
        }
```

- [ ] **2.4 Issue 1a — persist the playhead (throttled) in the tick.** Add `const lastSaveRef = useRef(0)`
by the refs. In the tick's `if (startedRef.current)` block, after `if (playheadRef) playheadRef.current = ph`:
```tsx
          if (persistKey && Date.now() - lastSaveRef.current > 1000) {
            lastSaveRef.current = Date.now()
            try { sessionStorage.setItem(persistKey, String(ph)) } catch { /* ignore */ }
          }
```

- [ ] **2.5 Issue 1a — restore the playhead on join.** In `join()`, replace
`playPosRef.current = Math.max(startRel, liveEdgeRel - delaySec)` with:
```tsx
    const maxEnd = delayedLiveEdge(liveEdgeRel, delaySec, endedWallRef.current, Date.now())
    const saved = persistKey ? Number(sessionStorage.getItem(persistKey)) : NaN
    playPosRef.current = Number.isFinite(saved) && saved > 0
      ? Math.min(saved, Math.max(0, maxEnd))
      : Math.max(startRel, liveEdgeRel - delaySec)
```

- [ ] **2.6 Typecheck** — `npx tsc --noEmit` → clean.

---

### Task 3: `LiveSession` — mount restore, English banner, done-notification, click-swap

**File:** `src/components/live/LiveSession.tsx`

- [ ] **Replace the whole file** with:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { LiveBroadcastView } from './LiveBroadcastView'
import { LiveTranscriptView } from './LiveTranscriptView'
import type { LiveCall } from '@/lib/live/loadCall'

const PROCESSING_TEXT = 'AI is processing the transcript…'

// Wraps the live broadcast: when the source ends, runs the finish pipeline; once ready it shows a
// prominent "View the organized transcript" button that swaps in place to the finished page (audio
// continues from the live playhead). Refresh-safe: re-derives finish state on mount; the playhead is
// persisted by LiveBroadcastView via persistKey. See the 2A spec + post-test fixes plan.
export function LiveSession(props: {
  companyName: string
  companyId: string | null
  quarter: string
  logoUrl: string | null
  delaySec: number
}) {
  const [phase, setPhase] = useState<'live' | 'finished'>('live')
  const [finishStatus, setFinishStatus] = useState<'idle' | 'processing' | 'ready'>('idle')
  const [finishedCall, setFinishedCall] = useState<LiveCall | null>(null)

  const playheadRef = useRef(0)
  const idRef = useRef<string | null>(null)
  const pollingRef = useRef(false)

  function startPolling() {
    if (pollingRef.current) return
    pollingRef.current = true
    const tick = async () => {
      const id = idRef.current
      if (!id) { pollingRef.current = false; return }
      try {
        const r = await fetch(`/api/transcripts/${id}`, { cache: 'no-store' })
        const row = (await r.json()) as { status?: string }
        if (row.status === 'completed') { setFinishStatus('ready'); pollingRef.current = false; return }
      } catch { /* keep polling */ }
      setTimeout(tick, 3000)
    }
    void tick()
  }

  // Refresh restore: re-derive finish state from the server on mount (no trigger).
  useEffect(() => {
    let alive = true
    fetch('/api/live/finish', { cache: 'no-store' })
      .then((r) => r.json())
      .then(({ id, status }: { id: string; status: string }) => {
        if (!alive) return
        idRef.current = id
        if (status === 'completed') setFinishStatus('ready')
        else if (status === 'processing') { setFinishStatus('processing'); startPolling() }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  function onSourceEnded() {
    if (finishStatus !== 'idle') return // already triggered/known (e.g. after refresh)
    setFinishStatus('processing')
    fetch('/api/live/finish', { method: 'POST' })
      .then((r) => r.json())
      .then(({ id, status }: { id: string; status: string }) => {
        idRef.current = id
        if (status === 'completed') setFinishStatus('ready')
        else startPolling()
      })
      .catch(() => setFinishStatus('idle'))
  }

  async function viewOrganized() {
    const id = idRef.current
    if (!id) return
    try {
      const r = await fetch(`/api/live/finished-call/${id}`, { cache: 'no-store' })
      if (!r.ok) return
      setFinishedCall((await r.json()) as LiveCall)
      setPhase('finished')
    } catch { /* leave on live; user can retry */ }
  }

  if (phase === 'finished' && finishedCall) {
    return <LiveTranscriptView call={finishedCall} initialSeek={playheadRef.current} />
  }

  const notice =
    finishStatus === 'processing' ? (
      <div className="rounded-lg border border-hairline bg-subtle/60 px-4 py-2.5 text-center text-sm text-ink-muted" dir="ltr">
        {PROCESSING_TEXT}
      </div>
    ) : finishStatus === 'ready' ? (
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg border border-[#C04A00]/30 bg-[#C04A00]/5 px-4 py-3 text-center">
        <span className="text-sm font-medium text-ink" dir="ltr">AI has finished processing this call.</span>
        <button
          type="button"
          onClick={viewOrganized}
          className="rounded-full bg-[#C04A00] px-4 py-1.5 text-sm font-semibold text-white"
        >
          View the organized transcript
        </button>
      </div>
    ) : undefined

  return (
    <LiveBroadcastView
      {...props}
      persistKey={`live-pos:${props.companyId ?? 'demo'}`}
      playheadRef={playheadRef}
      onSourceEnded={onSourceEnded}
      notice={notice}
    />
  )
}
```

- [ ] **Typecheck + build** — `npx tsc --noEmit` → clean; `npm test` → pass; `npx next build` → green.

---

## Self-Review

**Coverage:** Issue 1 → Task 2.3 (no phantom ramp), 2.4/2.5 (playhead persist/restore), Task 3 mount
restore (processing message survives). Issue 2 → Task 2.2. Issue 3 → Task 3 (English banner + done
notification/button + click-swap, no silent auto-swap). **Placeholder scan:** full code, no TBD.
**Type consistency:** `persistKey`/`notice: ReactNode` props match Task 2↔3; `GET` returns
`{id,status}` consumed identically by the mount restore + `onSourceEnded`; `viewOrganized` uses the
existing `/api/live/finished-call/[id]` + `LiveTranscriptView` `call`/`initialSeek`.
