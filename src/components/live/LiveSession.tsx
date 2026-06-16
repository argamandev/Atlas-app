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
  const [finishStatus, setFinishStatus] = useState<'idle' | 'processing' | 'ready' | 'failed'>('idle')
  const [finishedCall, setFinishedCall] = useState<LiveCall | null>(null)

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

  // Refresh restore: re-derive finish state from the server on mount (status only, no trigger).
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

  const notice =
    finishStatus === 'processing' ? (
      <div
        className="rounded-lg border border-hairline bg-subtle/60 px-4 py-2.5 text-center text-sm text-ink-muted"
        dir="ltr"
      >
        {PROCESSING_TEXT}
      </div>
    ) : finishStatus === 'ready' ? (
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg border border-[#C04A00]/30 bg-[#C04A00]/5 px-4 py-3 text-center">
        <span className="text-sm font-medium text-ink" dir="ltr">
          AI has finished processing this call.
        </span>
        <button
          type="button"
          onClick={viewOrganized}
          className="rounded-full bg-[#C04A00] px-4 py-1.5 text-sm font-semibold text-white"
        >
          View the organized transcript
        </button>
      </div>
    ) : finishStatus === 'failed' ? (
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg border border-hairline bg-subtle/60 px-4 py-3 text-center">
        <span className="text-sm font-medium text-ink" dir="ltr">Processing failed — the AI model was momentarily unavailable.</span>
        <button
          type="button"
          onClick={retryFinish}
          className="rounded-full bg-[#C04A00] px-4 py-1.5 text-sm font-semibold text-white"
        >
          Try again
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
