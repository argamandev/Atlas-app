# Phase 2A — Live→Finished Inline-Swap Transition Implementation Plan

> STATUS: SHIPPED — historical record, do not execute; current truth lives in ARCHITECTURE.md + PROGRESS.md

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, this session).
> Steps use checkbox (`- [ ]`). **COMMITS DEFERRED** — build into the working tree; do NOT `git commit`
> (founder reviews; tree has prior uncommitted work). Spec:
> `docs/superpowers/specs/2026-06-16-live-finished-transition-2A-design.md`.

**Goal:** When a live call's source finishes, the same `/app/live/live` page automatically runs the
Gemini finish pipeline and inline-swaps to the organized finished transcript — no reload, audio
continuing — with a "מעבדים…" state while it processes.

**Architecture:** A new client wrapper `LiveSession` renders `LiveBroadcastView` while live; on source-
end it POSTs the finish (fire-and-forget Gemini), polls status, and once finished-ready **and** the
buffer has drained, renders `LiveTranscriptView` in place (passing the live playhead as `initialSeek`).
The live view switches to a **drain-based** "finished" mode (`hostedLiveOver`), which also removes the
return-to-live button once the buffer is gone.

**Tech Stack:** TypeScript, React (Next 14 client components), Next route handlers, `node:test`/`tsx`,
the existing `finishLiveCall` + `loadCompletedCall`.

**File structure:**
- Modify `src/lib/live/liveTiming.ts` (+ test) — add `hostedLiveOver`.
- Modify `src/lib/live/finishLiveCall.ts` — add `runDemoFinish()` (reused by the script + the route).
- Modify `scripts/finish-live-call.ts` — call `runDemoFinish()` (DRY).
- Create `src/app/api/live/finish/route.ts` — idempotent finish trigger (demo session).
- Create `src/app/api/live/finished-call/[id]/route.ts` — returns `loadCompletedCall(id)` JSON.
- Modify `src/components/live/LiveBroadcastView.tsx` — drain-based mode, `playheadRef`, `onSourceEnded`,
  `onHostedOver`, `notice` banner.
- Create `src/components/live/LiveSession.tsx` — the wrapper / phase machine.
- Modify `src/app/app/live/[id]/page.tsx` — render `<LiveSession>` for `id==='live'`.

---

### Task 1: `hostedLiveOver` helper (drain-based "finished") — TDD

**Files:** Modify `src/lib/live/liveTiming.ts`; Test `src/lib/live/liveTiming.test.ts`

- [ ] **Step 1: Failing test** — append to `liveTiming.test.ts`, and add `hostedLiveOver` to the import:

```ts
test('hostedLiveOver: false while live, false mid-drain, true once the buffer reached the true end', () => {
  assert.equal(hostedLiveOver(false, 100, 463), false)   // source still live
  assert.equal(hostedLiveOver(true, 200, 463), false)    // ended, buffer still draining
  assert.equal(hostedLiveOver(true, 462.5, 463), true)   // drained to within epsilon → over
  assert.equal(hostedLiveOver(true, 463, 463), true)
})
```

- [ ] **Step 2: Run, expect fail** — `node --import tsx --test src/lib/live/liveTiming.test.ts` → FAIL (`hostedLiveOver` is not a function).

- [ ] **Step 3: Implement** — add to `liveTiming.ts`:

```ts
/**
 * The hosted call is "over" for everyone once the delayed/draining edge has reached the true end —
 * i.e. there's no live edge left to chase. Monotonic (delayedLiveEdge is capped at liveEdge), so once
 * true it stays true: drives the switch to finished mode and removes the "return to live" affordance.
 */
export function hostedLiveOver(backendEnded: boolean, delayedEdge: number, liveEdge: number, epsilon = 1): boolean {
  return backendEnded && liveEdge > 0 && delayedEdge >= liveEdge - epsilon
}
```

- [ ] **Step 4: Run, expect pass** — same command → PASS.

---

### Task 2: `runDemoFinish()` — shared finish-from-recording (DRY the script + route)

**Files:** Modify `src/lib/live/finishLiveCall.ts`; Modify `scripts/finish-live-call.ts`

- [ ] **Step 1: Add `runDemoFinish` to `finishLiveCall.ts`** (below `finishLiveCall`). It reads the
recorded session, marks a `processing` stub so polling sees it, then runs the full pipeline:

```ts
export const DEMO_CALL_ID = 'live-finish-demo-tamis-2026-06-14'

interface Rec { id: number; raw: string; corrected: string | null; words: { text: string; start: number }[] }

/** Demo finish: read the recorded Or-Yam session, mark a processing stub, run finishLiveCall. */
export async function runDemoFinish(opts: { markProcessing?: boolean } = {}): Promise<FinishResult> {
  const fs = await import('fs')
  const path = await import('path')
  const { supabaseAdmin } = await import('@/lib/supabase')

  const sessDir = path.join(process.cwd(), 'scripts', 'out', 'sessions')
  const recs = fs.readFileSync(path.join(sessDir, 'tamis-2026-06-14.jsonl'), 'utf8')
    .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as Rec)

  // first capture session (drop the concatenated second one — see normalizeFeedWords)
  const sessRecs: Rec[] = []
  let lastStart = -Infinity
  for (const r of recs) {
    const first = r.words?.[0]?.start ?? lastStart
    if (lastStart - first > 5) break
    sessRecs.push(r)
    lastStart = r.words?.[r.words.length - 1]?.start ?? first
  }
  const words: FeedWord[] = sessRecs.flatMap((r) => r.words.map((w) => ({ text: w.text, start: w.start })))
  const rawText = sessRecs.map((r) => r.raw).join('\n\n')

  // FK-valid owner (admin profile → newest transcript → demo)
  const arg = process.argv[2]
  let userId = arg && /^[0-9a-fA-F-]{36}$/.test(arg) ? arg : ''
  if (!userId) {
    const { data: admin } = await supabaseAdmin.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle()
    userId = (admin?.id as string) ?? ''
  }
  if (!userId) {
    const { data: t } = await supabaseAdmin.from('transcripts').select('user_id').not('user_id', 'is', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    userId = (t?.user_id as string) ?? '00000000-0000-0000-0000-000000000000'
  }

  if (opts.markProcessing) {
    await supabaseAdmin.from('transcripts').upsert({
      id: DEMO_CALL_ID, user_id: userId, youtube_url: `live://${DEMO_CALL_ID}`,
      youtube_title: 'תמיס Q1 2026', status: 'processing', processing_step: 'formatting',
    }, { onConflict: 'id' })
  }

  return finishLiveCall({
    callId: DEMO_CALL_ID, companyTicker: '1097229', companyName: 'תמיס', quarter: 'Q1 2026',
    rawText, words, pcmPath: path.join(sessDir, 'tamis-2026-06-14.pcm'), sampleRate: 16000, channels: 1, userId,
  })
}
```

- [ ] **Step 2: Rewrite `scripts/finish-live-call.ts` main to use it** — replace its `main()` body:

```ts
import { runDemoFinish } from '../src/lib/live/finishLiveCall'

async function main() {
  const res = await runDemoFinish()
  console.log(`[finish] DONE -> ${res.url}`)
  console.log(`[finish] audio=${res.audioUrl}  dur=${Math.round(res.durationSec)}s  words=${res.wordCount}`)
}
main().catch((e) => { console.error('[finish] FAILED:', e); process.exit(1) })
```
(Delete the now-unused `readRecords`/`resolveUserId`/session-split code + the `normalizeFeedWords`/
`supabaseAdmin`/`DEMO_USER_ID` imports in the script — `runDemoFinish` owns all of it.)

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 4: Smoke the script** — `node --env-file=.env.local --import tsx scripts/finish-live-call.ts` → `DONE -> /app/live/live-finish-demo-tamis-2026-06-14`.

---

### Task 3: `GET /api/live/finished-call/[id]` route

**Files:** Create `src/app/api/live/finished-call/[id]/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextResponse } from 'next/server'
import { loadCompletedCall } from '@/lib/live/loadCall'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const call = await loadCompletedCall(params.id)
  if (!call) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(call)
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → clean.

---

### Task 4: `POST /api/live/finish` route (idempotent trigger)

**Files:** Create `src/app/api/live/finish/route.ts`

- [ ] **Step 1: Implement** — completed → return; else mark processing + fire `runDemoFinish` fire-and-forget (mirrors `POST /api/transcripts` → `runPipeline`):

```ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { runDemoFinish, DEMO_CALL_ID } from '@/lib/live/finishLiveCall'

export const dynamic = 'force-dynamic'

export async function POST() {
  const { data } = await supabaseAdmin.from('transcripts').select('status').eq('id', DEMO_CALL_ID).maybeSingle()
  if (data?.status === 'completed') return NextResponse.json({ id: DEMO_CALL_ID, status: 'completed' })

  // fire-and-forget: marks a processing stub, runs Gemini, upserts completed
  setImmediate(() => {
    runDemoFinish({ markProcessing: true }).catch(async (err: Error) => {
      console.error('[live/finish] FAILED:', err.message)
      await supabaseAdmin.from('transcripts').update({ status: 'failed', error_message: err.message }).eq('id', DEMO_CALL_ID)
    })
  })
  return NextResponse.json({ id: DEMO_CALL_ID, status: 'processing' })
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → clean.

---

### Task 5: `LiveBroadcastView` — drain-based mode + parent signals + notice

**Files:** Modify `src/components/live/LiveBroadcastView.tsx`

- [ ] **Step 1: Imports + props.** Change the import line to drop `viewerEnded`, add `hostedLiveOver`:

```tsx
import { interpolatedEdge, delayedLiveEdge, bufferGate, hostedLiveOver, LIVE_BUFFER_SEC } from '@/lib/live/liveTiming'
```

Add to the prop type (after `delaySec?: number`) and the destructure:

```tsx
  playheadRef,
  onSourceEnded,
  onHostedOver,
  notice,
}: {
  companyName: string
  companyId: string | null
  quarter: string
  logoUrl: string | null
  delaySec?: number
  playheadRef?: React.MutableRefObject<number>
  onSourceEnded?: () => void
  onHostedOver?: () => void
  notice?: string
}) {
```

- [ ] **Step 2: Write the playhead to `playheadRef`** inside the 100ms tick. Replace the `if (startedRef.current) {…}` block in the tick with:

```tsx
      if (startedRef.current) {
        const ctx = ctxRef.current
        if (ctx && playPosRef.current !== null) {
          const ph = Math.max(0, playPosRef.current - (nextAtRef.current - ctx.currentTime))
          setPlayingRel(ph)
          if (playheadRef) playheadRef.current = ph
        }
        setPhase('playing')
        return
      }
```

- [ ] **Step 3: Replace `ended` (viewerEnded) with `over` (drain-based)** — change the derived block:

```tsx
  const over = hostedLiveOver(liveEnded, broadcastEdge, liveEdge) // "finished" once the buffer fully drained
  const behind = Math.max(0, liveEdge - playingRel)
  const broadcastEdge = delayedLiveEdge(liveEdge, delaySec, endedWallRef.current, Date.now())
```
**Order fix:** `over` must be computed *after* `broadcastEdge`. Use this exact order:

```tsx
  const behind = Math.max(0, liveEdge - playingRel)
  const broadcastEdge = delayedLiveEdge(liveEdge, delaySec, endedWallRef.current, Date.now())
  const over = hostedLiveOver(liveEnded, broadcastEdge, liveEdge)
```

Then replace the four `ended` usages with `over`: badge `{over ? 'הסתיים' …}`, behind-indicator
`{phase === 'playing' && !over && (`, return-to-live `{phase === 'playing' && !over && (`, MediaPlayer
`chapter={over ? undefined : 'Live session'}` and `isLive={!over}`.

- [ ] **Step 4: Fire the parent signals.** Add two effects right after the existing poll `useEffect`
(top level, not conditional). `over` is in scope from Step 3 — move the `behind`/`broadcastEdge`/`over`
computation up to just below the `flat`/`activeIndex` memos so it's defined before these effects:

```tsx
  useEffect(() => { if (liveEnded) onSourceEnded?.() }, [liveEnded]) // one-shot: source ended → start finish
  useEffect(() => { if (over) onHostedOver?.() }, [over])            // one-shot: buffer drained → ok to swap
```

- [ ] **Step 5: Render the `notice` banner** at the top of the transcript scroll area (just inside the
`app-scroll` div, before `<TranscriptBody>`):

```tsx
        {notice && (
          <div className="mb-3 rounded-lg border border-hairline bg-subtle/60 px-4 py-2.5 text-center text-sm text-ink-muted">
            {notice}
          </div>
        )}
```

- [ ] **Step 6: Typecheck** — `npx tsc --noEmit` → clean (no remaining `ended`/`viewerEnded` refs).

---

### Task 6: `LiveSession` wrapper (phase machine)

**Files:** Create `src/components/live/LiveSession.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'

import { useRef, useState } from 'react'
import { LiveBroadcastView } from './LiveBroadcastView'
import { LiveTranscriptView } from './LiveTranscriptView'
import type { LiveCall } from '@/lib/live/loadCall'

const PROCESSING_NOTICE = 'השיחה הסתיימה, בינה מלאכותית מעבדת אותה כדי להציג אותה בצורה מקצועית…'

// Wraps the live broadcast and, when the source ends, runs the finish pipeline and inline-swaps to the
// organized finished transcript once it's ready AND the buffer has drained — same page, no navigation.
export function LiveSession(props: {
  companyName: string
  companyId: string | null
  quarter: string
  logoUrl: string | null
  delaySec: number
}) {
  const [phase, setPhase] = useState<'live' | 'finished'>('live')
  const [processing, setProcessing] = useState(false)
  const [finishedCall, setFinishedCall] = useState<LiveCall | null>(null)

  const playheadRef = useRef(0)
  const startedRef = useRef(false)
  const readyRef = useRef(false)
  const drainedRef = useRef(false)
  const idRef = useRef<string | null>(null)

  async function trySwap() {
    if (phase === 'finished' || !readyRef.current || !drainedRef.current || !idRef.current) return
    try {
      const r = await fetch(`/api/live/finished-call/${idRef.current}`, { cache: 'no-store' })
      if (!r.ok) return
      const call = (await r.json()) as LiveCall
      setFinishedCall(call)
      setPhase('finished')
    } catch { /* retry on next signal */ }
  }

  async function poll() {
    const id = idRef.current
    if (!id) return
    try {
      const r = await fetch(`/api/transcripts/${id}`, { cache: 'no-store' })
      const row = (await r.json()) as { status?: string }
      if (row.status === 'completed') { readyRef.current = true; setProcessing(false); void trySwap(); return }
    } catch { /* keep polling */ }
    setTimeout(poll, 3000)
  }

  function onSourceEnded() {
    if (startedRef.current) return
    startedRef.current = true
    setProcessing(true)
    fetch('/api/live/finish', { method: 'POST' })
      .then((r) => r.json())
      .then(({ id, status }: { id: string; status: string }) => {
        idRef.current = id
        if (status === 'completed') { readyRef.current = true; setProcessing(false); void trySwap() }
        else poll()
      })
      .catch(() => setProcessing(false))
  }

  function onHostedOver() { drainedRef.current = true; void trySwap() }

  if (phase === 'finished' && finishedCall) {
    return <LiveTranscriptView call={finishedCall} initialSeek={playheadRef.current} />
  }

  return (
    <LiveBroadcastView
      {...props}
      playheadRef={playheadRef}
      onSourceEnded={onSourceEnded}
      onHostedOver={onHostedOver}
      notice={processing ? PROCESSING_NOTICE : undefined}
    />
  )
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → clean.

---

### Task 7: Wire the page to `LiveSession`

**Files:** Modify `src/app/app/live/[id]/page.tsx`

- [ ] **Step 1:** Change the import + the `id==='live'` branch to render `<LiveSession>`:

```tsx
import { LiveSession } from '@/components/live/LiveSession'
```
```tsx
  if (params.id === 'live') {
    const company = await getCompanyByTicker('1097229').catch(() => null) // תמיס
    const d = searchParams.delay ? Number(searchParams.delay) : LIVE_BUFFER_SEC
    return (
      <AppPage>
        <LiveSession
          companyName={company?.displayName ?? 'תמיס'}
          companyId={company?.id ?? null}
          quarter="Q2 2026"
          logoUrl={company?.logoUrl ?? null}
          delaySec={Number.isFinite(d) && d > 0 ? d : LIVE_BUFFER_SEC}
        />
      </AppPage>
    )
  }
```
(The `LiveBroadcastView` import in the page becomes unused — remove it.)

- [ ] **Step 2: Verify** — `npx tsc --noEmit` (clean) → `npm test` (all pass) → `npx next build` (green; `/app/live/[id]` + the two new API routes compile).

---

### Task 8: Test setup (replay near-end, force the pipeline to run)

- [ ] **Step 1: Delete the demo row** so the finish actually runs (shows "מעבדים…") instead of returning
`completed` instantly:
```bash
node --env-file=.env.local --import tsx -e "import('./src/lib/supabase').then(async ({supabaseAdmin})=>{await supabaseAdmin.from('transcripts').delete().eq('id','live-finish-demo-tamis-2026-06-14');console.log('deleted')})"
```
- [ ] **Step 2: Restart the replay near the end** (source ends ~60–90s after start) on `:8788`
(`REPLAY_OFFSET≈320 REPLAY_SPEED=1`) and confirm `/api/live/state` proxies.
- [ ] **Step 3: Founder test** at `http://localhost:3003/app/live/live?delay=60`: watch live → source ends →
"מעבדים…" banner (Gemini running) → page **auto-swaps** to the organized finished transcript, audio
continuing, full timeline + speaker turns. No return-to-live button after it's over.

---

## Self-Review

**Spec coverage:** §1 experience → Tasks 5–7 + 8. §2 inline swap + drain-based mode → Tasks 1,5,6.
§3 trigger/pipeline/status → Tasks 2,3,4,6. §4 data flow → Task 6. §5 files → all tasks. §6 demo → Task 8.
§7 checks → Task 8 acceptance. §8 non-goals respected (no full-unify, no production data source).

**Placeholder scan:** every code step has full code + exact commands. No TBD.

**Type consistency:** `hostedLiveOver(backendEnded, delayedEdge, liveEdge, ε)`, `runDemoFinish({markProcessing})`,
`DEMO_CALL_ID`, `FinishResult`/`FeedWord` (existing), `LiveCall` (existing), and the new
`LiveBroadcastView` props (`playheadRef`/`onSourceEnded`/`onHostedOver`/`notice`) match across Tasks 1–7.
`LiveTranscriptView` `call`+`initialSeek` props match its real signature.

**One ordering note (Task 5):** `over` depends on `broadcastEdge`, and the two new effects depend on `over` —
so the `behind`/`broadcastEdge`/`over` computation must be moved up to just below the `activeIndex` memo
(before the effects). Called out explicitly in Task 5 Steps 3–4.
