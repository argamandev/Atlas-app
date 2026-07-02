'use client'

import { useEffect, useRef, useState } from 'react'
import { LiveBroadcastView } from './LiveBroadcastView'
import { LiveTranscriptView } from './LiveTranscriptView'
import { ChevronRightIcon, CloseIcon } from '@/components/ds/icons'
import type { LiveCall } from '@/lib/live/loadCall'

// Wraps the live broadcast. While airing it's held delaySec behind real-time. When the SOURCE stops we fire
// the finish pipeline, but the view STAYS LIVE and drains the buffer (handled in LiveBroadcastView). Once the
// buffer fully drains (onLiveOver), it becomes a finished recording → auto-swaps to the organized transcript
// the moment it's ready. Refresh-safe; playhead persisted via persistKey.
export function LiveSession(props: {
  companyName: string
  companyId: string | null
  quarter: string
  logoUrl: string | null
  delaySec: number
}) {
  const [phase, setPhase] = useState<'live' | 'finished'>('live')
  const [finishStatus, setFinishStatus] = useState<'idle' | 'processing' | 'ready' | 'failed'>('idle')
  const [finishedCall, setFinishedCall] = useState<LiveCall | null>(null)
  // The finish UX (processing banner / "view organized" CTA) is gated on THIS session seeing the
  // live source end — NOT on the polled status. The call id is reused across airings (and is static
  // for the demo), so a completed row from a prior run must never surface the CTA while we're live.
  const [sourceEnded, setSourceEnded] = useState(false)
  const [liveOver, setLiveOver] = useState(false) // the buffer fully drained → the live experience is over
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({}) // notification cards closed by the user

  const playheadRef = useRef(0)
  const idRef = useRef<string | null>(null)
  const pollingRef = useRef(false)

  function startPolling() {
    if (pollingRef.current) return
    pollingRef.current = true
    const tick = async () => {
      try {
        // non-auth status endpoint (GET /api/transcripts/[id] is auth-gated → 401s a stale session)
        const r = await fetch('/api/live/finish', { cache: 'no-store' })
        const row = (await r.json()) as { status?: string }
        if (row.status === 'completed') {
          setFinishStatus('ready')
          pollingRef.current = false
          return
        }
        if (row.status === 'failed') {
          setFinishStatus('failed')
          pollingRef.current = false
          return
        }
      } catch {
        /* keep polling */
      }
      setTimeout(tick, 3000)
    }
    void tick()
  }

  // Refresh restore: re-derive finish state on mount (status only, no trigger). Only restore an
  // IN-FLIGHT finish — a 'completed' row may be from a PRIOR airing of this reused id, so we ignore it;
  // this call's finish (re)runs on source-end via onSourceEnded.
  useEffect(() => {
    let alive = true
    fetch('/api/live/finish', { cache: 'no-store' })
      .then((r) => r.json())
      .then(({ id, status }: { id: string; status: string }) => {
        if (!alive) return
        idRef.current = id
        if (status === 'processing') {
          setSourceEnded(true)
          setFinishStatus('processing')
          startPolling()
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // Pre-load the organized call the moment the finish is ready, so both the manual CTA and the seamless
  // auto-swap are instant (no fetch flash).
  useEffect(() => {
    if (finishStatus !== 'ready' || finishedCall) return
    const id = idRef.current
    if (!id) return
    let alive = true
    fetch(`/api/live/finished-call/${id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (alive && c) setFinishedCall(c as LiveCall)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [finishStatus, finishedCall])

  // Stay LIVE through the whole drain (liveOver=false). Once the drain is over AND the organized transcript
  // is ready, swap to the finished view in place. If it's not ready yet, the drained LiveBroadcastView (now
  // a raw, badge-less recording) stays until it is — "default text" first, organized when it lands.
  useEffect(() => {
    if (liveOver && finishedCall) setPhase('finished')
  }, [liveOver, finishedCall])

  function onSourceEnded() {
    setSourceEnded(true) // unlocks the finish UX; set before the guard so a pre-loaded 'ready' still reveals
    if (finishStatus !== 'idle') return // already triggered/known (e.g. after a refresh)
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

  function retryFinish() {
    setFinishStatus('processing')
    fetch('/api/live/finish', { method: 'POST' })
      .then((r) => r.json())
      .then(({ id, status }: { id: string; status: string }) => {
        idRef.current = id
        if (status === 'completed') setFinishStatus('ready')
        else startPolling()
      })
      .catch(() => setFinishStatus('failed'))
  }

  async function viewOrganized() {
    if (finishedCall) {
      setPhase('finished')
      return
    } // pre-loaded → instant
    const id = idRef.current
    if (!id) return
    try {
      const r = await fetch(`/api/live/finished-call/${id}`, { cache: 'no-store' })
      if (!r.ok) return
      setFinishedCall((await r.json()) as LiveCall)
      setPhase('finished')
    } catch {
      /* stay on live; user can retry */
    }
  }

  if (phase === 'finished' && finishedCall) {
    return <LiveTranscriptView call={finishedCall} initialSeek={playheadRef.current} />
  }

  // Floating, dismissible notification card (frosted light, ✕ to close). Shown only after THIS session saw
  // the source end. It stays until the user closes it (✕) — it's important. The header stays LIVE through
  // the drain, so this card is the only "source ended / AI processing" cue.
  const cardKey = finishStatus
  const showCard =
    sourceEnded &&
    phase === 'live' &&
    !dismissed[cardKey] &&
    // during the drain show only the (auto-dismissing) processing card — never a "View" that would skip the
    // live experience. The ready/failed cards appear only once the drain is over.
    (finishStatus === 'processing' || (liveOver && (finishStatus === 'ready' || finishStatus === 'failed')))

  return (
    <>
      <LiveBroadcastView
        {...props}
        persistKey={`live-pos:${props.companyId ?? 'demo'}`}
        playheadRef={playheadRef}
        onSourceEnded={onSourceEnded}
        onLiveOver={() => setLiveOver(true)}
      />
      {showCard && (
        <div
          className="animate-fade-up fixed inset-x-0 top-3 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-2.5 rounded-2xl bg-white/80 px-3.5 py-2 text-xs text-ink-muted shadow-popover ring-1 ring-black/5 backdrop-blur-xl"
          dir="ltr"
        >
          {finishStatus === 'processing' && (
            <span className="flex items-center gap-2">
              <span className="h-1 w-1 animate-pulse rounded-full bg-ink-faint" />
              Investor call ended — AI is processing your transcript. This takes a few minutes; we&apos;ll
              notify you. On our platform the call is still LIVE until we finish the 4-minute buffer.
            </span>
          )}
          {finishStatus === 'ready' && (
            <>
              <span>The organized transcript is ready.</span>
              <button
                type="button"
                onClick={viewOrganized}
                className="flex items-center gap-1 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                View
                <ChevronRightIcon size={13} className="rtl:rotate-180" />
              </button>
            </>
          )}
          {finishStatus === 'failed' && (
            <>
              <span>Processing failed — the AI model was momentarily unavailable.</span>
              <button
                type="button"
                onClick={retryFinish}
                className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                Try again
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setDismissed((d) => ({ ...d, [cardKey]: true }))}
            aria-label="Dismiss"
            className="ms-1 text-ink-faint transition-colors hover:text-ink"
          >
            <CloseIcon size={15} />
          </button>
        </div>
      )}
    </>
  )
}
