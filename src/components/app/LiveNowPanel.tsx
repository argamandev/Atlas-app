'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { LiveBeamAvatar } from '@/components/ds/LiveBeamAvatar'
import { delayedLiveEdge, hostedLiveOver, LIVE_BUFFER_SEC } from '@/lib/live/liveTiming'

function formatClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = Math.floor(totalSec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Home "Live Now" — polls the live engine and surfaces the company the moment a call goes
// live. Design anatomy (lines 196-202): a borderless hover-fill row — beam monogram,
// name 14/600, red caps tag (quarter) — plus our running mono clock at the row's end.
export function LiveNowPanel({
  companyName,
  quarter,
}: {
  companyName: string
  logoUrl?: string | null
  quarter?: string | null
}) {
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
      className="hov-filld flex w-full items-center gap-3.5 rounded-[12px] px-2 py-[9px] text-start"
    >
      <LiveBeamAvatar size={50} surface="page">
        {companyName.trim().charAt(0) || '·'}
      </LiveBeamAvatar>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[14px] font-semibold text-ink">
          <span dir="auto">{companyName}</span>
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-live">
          {quarter || dict.live.liveBadge}
        </span>
      </div>
      <span className="flex-none font-mono-num text-[11.5px] text-ink-faint" dir="ltr">
        {formatClock(elapsed)}
      </span>
    </Link>
  )
}
