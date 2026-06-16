'use client'

import { useRef, useState } from 'react'
import { LiveBroadcastView } from './LiveBroadcastView'
import { LiveTranscriptView } from './LiveTranscriptView'
import type { LiveCall } from '@/lib/live/loadCall'

const PROCESSING_NOTICE = 'השיחה הסתיימה, בינה מלאכותית מעבדת אותה כדי להציג אותה בצורה מקצועית…'

// Wraps the live broadcast and, when the source ends, runs the finish pipeline and inline-swaps to
// the organized finished transcript once it's ready AND the buffer has drained — same page, no
// navigation, audio continues from the live playhead. See the 2A spec.
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
    } catch {
      /* retry on next signal */
    }
  }

  async function poll() {
    const id = idRef.current
    if (!id) return
    try {
      const r = await fetch(`/api/transcripts/${id}`, { cache: 'no-store' })
      const row = (await r.json()) as { status?: string }
      if (row.status === 'completed') {
        readyRef.current = true
        setProcessing(false)
        void trySwap()
        return
      }
    } catch {
      /* keep polling */
    }
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
        if (status === 'completed') {
          readyRef.current = true
          setProcessing(false)
          void trySwap()
        } else {
          poll()
        }
      })
      .catch(() => setProcessing(false))
  }

  function onHostedOver() {
    drainedRef.current = true
    void trySwap()
  }

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
