'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { EntityRow } from '@/components/ds/EntityRow'

// Home "Live Now" — polls the live engine and surfaces the company the moment a call goes live
// (audio flowing). This is the auto-appear behavior MAYA will drive in production; for now the
// single live call is תמיס. Clicking opens the live broadcast page.
export function LiveNowPanel({ companyName, logoUrl }: { companyName: string; logoUrl: string | null }) {
  const { dict } = useI18n()
  const [live, setLive] = useState(false)

  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const r = await fetch('/api/live/state', { cache: 'no-store' })
        const st = await r.json()
        if (alive) setLive(st.audioStartRel !== null && !st.liveEnded)
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

  if (!live) {
    return <p className="px-2.5 py-6 text-sm text-ink-faint">{dict.home.noLiveNow}</p>
  }

  return (
    <EntityRow
      href="/app/live/live?delay=60"
      logoSrc={logoUrl}
      name={companyName}
      secondary={
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
          <span className="font-medium text-live">{dict.live.liveBadge}</span>
        </span>
      }
    />
  )
}
