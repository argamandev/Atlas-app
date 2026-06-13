'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { EntityRow } from '@/components/ds/EntityRow'
import { SectionHeader } from '@/components/ds/SectionHeader'
import { CalendarIcon } from '@/components/ds/icons'
import { formatDate, formatTime } from '@/lib/i18n/format'
import type { ScheduledCall } from '@/lib/api/types'
import type { RecentTranscript } from '@/lib/types'

// Shared company overview: live call (if any) → latest finished call → upcoming calls.
// Reused on the Company page Overview tab and the Live Transcript page Overview tab.
export interface CompanyOverviewData {
  companyName: string
  companyId: string
  logoUrl: string | null
  calls: ScheduledCall[]
  transcripts: RecentTranscript[]
  liveHref?: string | null
  liveQuarter?: string | null
  /** when true, poll the live engine and show the live banner (→ /app/live/live) if a call is live */
  liveEnabled?: boolean
}

export function CompanyOverview({ data }: { data: CompanyOverviewData }) {
  const { dict, locale } = useI18n()
  const { companyName, logoUrl, calls, transcripts, liveHref } = data
  const latest = transcripts[0]

  // Live call auto-detect — when this is the live company, poll the engine like the home does.
  const [engineLive, setEngineLive] = useState(false)
  useEffect(() => {
    if (!data.liveEnabled) return
    let alive = true
    const check = async () => {
      try {
        const r = await fetch('/api/live/state', { cache: 'no-store' })
        const s = await r.json()
        if (alive) setEngineLive(s.audioStartRel !== null && !s.liveEnded)
      } catch {
        if (alive) setEngineLive(false)
      }
    }
    void check()
    const iv = setInterval(check, 5000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [data.liveEnabled])

  const showLive = data.liveEnabled ? engineLive : !!liveHref
  const liveLink = data.liveEnabled ? '/app/live/live' : liveHref

  return (
    <div className="space-y-8">
      {showLive && liveLink && (
        <section>
          <SectionHeader label={dict.home.liveNow} className="mb-2" />
          <EntityRow
            href={liveLink}
            logoSrc={logoUrl}
            name={companyName}
            secondary={
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-live animate-pulse" />
                <span className="font-medium text-live">{dict.live.liveBadge}</span>
                {data.liveQuarter ? <span className="text-ink-faint">· {data.liveQuarter}</span> : null}
              </span>
            }
          />
        </section>
      )}

      <section>
        <SectionHeader label={dict.company.latestCall} className="mb-2" />
        {!latest ? (
          <p className="px-2.5 py-4 text-sm text-ink-faint">{dict.common.empty}</p>
        ) : (
          <EntityRow
            href={`/app/live/${latest.id}`}
            logoSrc={logoUrl}
            name={companyName}
            secondaryIcon={<CalendarIcon size={13} className="text-ink-faint" />}
            secondary={[latest.quarter, formatDate(latest.date || latest.createdAt, locale)].filter(Boolean).join(' · ')}
            meta={latest.duration ? <span dir="ltr">{latest.duration}</span> : undefined}
          />
        )}
      </section>

      <section>
        <SectionHeader label={dict.company.upcomingCalls} className="mb-2" />
        {calls.length === 0 ? (
          <p className="px-2.5 py-4 text-sm text-ink-faint">{dict.home.noUpcoming}</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {calls.map((call) => (
              <EntityRow
                key={call.id}
                logoSrc={logoUrl}
                name={companyName}
                secondaryIcon={<CalendarIcon size={13} className="text-ink-faint" />}
                secondary={`${call.quarter} · ${formatDate(call.scheduledAt, locale)}`}
                meta={<span dir="ltr">{formatTime(call.scheduledAt, locale)}</span>}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
