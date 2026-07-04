'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Logo } from '@/components/ds/Logo'
import { LiveBeamAvatar } from '@/components/ds/LiveBeamAvatar'
import { delayedLiveEdge, hostedLiveOver, LIVE_BUFFER_SEC } from '@/lib/live/liveTiming'

function formatClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = Math.floor(totalSec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Home "Live Now" — polls the live engine and surfaces the company the moment a call goes
// live. V2 (Claude Design): a paper card with the radar-beam avatar ("beaming live"),
// company + quarter lines, and the pulsing LIVE row with a running mono clock.
export function LiveNowPanel({ companyName, logoUrl }: { companyName: string; logoUrl: string | null }) {
  const { dict } = useI18n()
  const [live, setLive] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const r = await fetch('/api/live/state', { cache: 'no-store' })
        const st = await r.json()
        // Stay "live" through the whole buffer drain — live until the drain reaches the true end.
        const edge = st.liveEdgeRel ?? 0
        const drained = delayedLiveEdge(edge, LIVE_BUFFER_SEC, st.endedAt ?? null, Date.now())
        const over = hostedLiveOver(!!st.liveEnded, drained, edge)
        if (alive) {
          setLive(st.audioStartRel !== null && !over)
          setElapsed(Math.max(0, drained))
        }
      } catch {
        if (alive) setLive(false)
      }
    }
    void check()
    const iv = setInterval(check, 5000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [])

  // local 1s tick so the clock runs between polls
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [live])

  if (!live) {
    return (
      <div className="rounded-[10px] border border-dashed border-subtle-strong px-4 py-[22px] text-center text-sm text-ink-faint">
        {dict.home.noLiveNow}
      </div>
    )
  }

  return (
    <Link
      href="/app/live/live"
      className="flex flex-col gap-2.5 rounded-[10px] border border-subtle-strong bg-paper p-3.5 shadow-soft transition-shadow hover:shadow-popover"
    >
      <div className="flex items-center gap-2.5">
        <LiveBeamAvatar size={36} surface="card">
          <Logo src={logoUrl} name={companyName} size={30} />
        </LiveBeamAvatar>
        <div className="min-w-0 flex-1 text-start">
          <div className="truncate text-sm font-semibold text-ink">
            <span dir="auto">{companyName}</span>
          </div>
          <div className="truncate text-xs text-ink-muted">{dict.home.investorCall}</div>
        </div>
      </div>
      <div className="flex items-center gap-[7px]">
        <span
          className="h-[7px] w-[7px] rounded-full bg-live"
          style={{ animation: 'atpulse 2s ease-in-out infinite' }}
        />
        <span className="text-xs font-semibold tracking-[0.03em] text-live">{dict.live.liveBadge}</span>
        <span className="ms-auto font-mono-num text-[11.5px] text-ink-faint" dir="ltr">
          {formatClock(elapsed)}
        </span>
      </div>
    </Link>
  )
}
