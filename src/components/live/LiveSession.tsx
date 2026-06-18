'use client'

import { useEffect, useRef, useState } from 'react'
import { LiveBroadcastView } from './LiveBroadcastView'
import { LiveTranscriptView } from './LiveTranscriptView'
import { ChevronRightIcon } from '@/components/ds/icons'
import type { LiveCall } from '@/lib/live/loadCall'

// Wraps the live broadcast. While airing it's held delaySec behind real-time. The moment the SOURCE
// ends, the captured buffer becomes a complete recording the viewer can roam freely (handled in
// LiveBroadcastView), we fire the finish pipeline, and once it's ready a "View the organized transcript"
// button swaps in place (audio continues from the playhead). Refresh-safe; playhead persisted via persistKey.
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
        if (row.status === 'completed') { setFinishStatus('ready'); pollingRef.current = false; return }
        if (row.status === 'failed') { setFinishStatus('failed'); pollingRef.current = false; return }
      } catch { /* keep polling */ }
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
        if (status === 'processing') { setSourceEnded(true); setFinishStatus('processing'); startPolling() }
      })
      .catch(() => {})
    return () => { alive = false }
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
      .then((c) => { if (alive && c) setFinishedCall(c as LiveCall) })
      .catch(() => {})
    return () => { alive = false }
  }, [finishStatus, finishedCall])

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

  if (phase === 'finished' && finishedCall) {
    return <LiveTranscriptView call={finishedCall} initialSeek={playheadRef.current} />
  }

  // Clean black pills matching the player bar / "return to transcript" chip (bg-player + shadow-player +
  // animate-fade-up). One sentence: the original call ended → preparing → a tappable "view organized".
  const notice = !sourceEnded
    ? undefined // live source still airing → never show the finish CTA (even if a stale completed row exists)
    : finishStatus === 'processing' ? (
      <div
        className="animate-fade-up flex items-center gap-2 rounded-full bg-player px-3.5 py-1.5 text-sm font-medium text-player-ink shadow-player"
        dir="ltr"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-player-ink/50" />
        The original call ended — preparing the organized transcript…
      </div>
    ) : finishStatus === 'ready' ? (
      <button
        type="button"
        onClick={viewOrganized}
        className="animate-fade-up flex items-center gap-1.5 rounded-full bg-player px-3.5 py-1.5 text-sm font-medium text-player-ink shadow-player transition-transform hover:-translate-y-0.5"
        dir="ltr"
      >
        View the organized transcript
        <ChevronRightIcon size={15} className="rtl:rotate-180" />
      </button>
    ) : finishStatus === 'failed' ? (
      <button
        type="button"
        onClick={retryFinish}
        className="animate-fade-up flex items-center gap-1.5 rounded-full bg-player px-3.5 py-1.5 text-sm font-medium text-player-ink shadow-player transition-transform hover:-translate-y-0.5"
        dir="ltr"
      >
        Processing failed — try again
      </button>
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
