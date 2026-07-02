'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { EntityRow } from '@/components/ds/EntityRow'
import { SectionHeader } from '@/components/ds/SectionHeader'
import { CalendarIcon } from '@/components/ds/icons'
import { formatDate, formatTime } from '@/lib/i18n/format'
import { companyLiveDisplay } from '@/lib/live/liveTiming'
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
  const router = useRouter()
  const { companyName, logoUrl, calls, transcripts, liveHref } = data
  const latest = transcripts[0]

  // Live call auto-detect — when this is the live company, poll the engine like the home does. We also
  // poll the finish status so the just-ended call can surface as the (raw, still-being-polished) "Latest
  // call" through the whole end→drain→polish window, then upgrade to the finished row once it lands.
  const [engineLive, setEngineLive] = useState(false)
  const [endedInFlight, setEndedInFlight] = useState(false)
  const completedRef = useRef(false)
  useEffect(() => {
    if (!data.liveEnabled) return
    let alive = true
    const check = async () => {
      try {
        const [stateRes, finishRes] = await Promise.all([
          fetch('/api/live/state', { cache: 'no-store' }),
          fetch('/api/live/finish', { cache: 'no-store' }),
        ])
        const s = await stateRes.json()
        const f = await finishRes.json().catch(() => ({ status: 'none' }))
        const display = companyLiveDisplay(s, f.status ?? 'none', Date.now())
        if (!alive) return
        setEngineLive(display.liveBanner)
        setEndedInFlight(display.endedInFlight)
        // The moment polishing completes, re-fetch the server data so "Latest call" shows the finished row
        // (linked to its canonical /app/live/<id>) instead of the live/raw view. Fire once per transition.
        if (f.status === 'completed' && !completedRef.current) {
          completedRef.current = true
          router.refresh()
        } else if (f.status !== 'completed') {
          completedRef.current = false
        }
      } catch {
        if (alive) {
          setEngineLive(false)
          setEndedInFlight(false)
        }
      }
    }
    void check()
    const iv = setInterval(check, 5000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [data.liveEnabled, router])

  const showLive = data.liveEnabled ? engineLive : !!liveHref
  const liveLink = data.liveEnabled ? '/app/live/live' : liveHref

  return (
    <div className="space-y-8">
      {showLive && liveLink && (
        <section className="animate-fade-up">
          <SectionHeader label={dict.home.liveNow} className="mb-2" />
          <EntityRow
            href={liveLink}
            logoSrc={logoUrl}
            name={companyName}
            className="transition-all duration-200 hover:-translate-y-px hover:shadow-float"
            secondary={
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
                <span className="font-medium text-live">{dict.live.liveBadge}</span>
                {data.liveQuarter ? <span className="text-ink-faint">· {data.liveQuarter}</span> : null}
              </span>
            }
          />
        </section>
      )}

      <section className="animate-fade-up" style={{ animationDelay: '0.05s' }}>
        <SectionHeader label={dict.company.latestCall} className="mb-2" />
        {endedInFlight ? (
          // Just ended — its raw transcript lives in the still-draining live view, which auto-upgrades to the
          // polished transcript when ready (then router.refresh swaps in the canonical finished row above).
          <EntityRow
            href="/app/live/live"
            logoSrc={logoUrl}
            name={companyName}
            className="transition-all duration-200 hover:-translate-y-px hover:shadow-float"
            secondary={
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
                <span className="text-ink-muted">
                  {[data.liveQuarter, dict.live.preparing].filter(Boolean).join(' · ')}
                </span>
              </span>
            }
          />
        ) : !latest ? (
          <p className="px-2.5 py-4 text-sm text-ink-faint">{dict.common.empty}</p>
        ) : (
          <EntityRow
            href={`/app/live/${latest.id}`}
            logoSrc={logoUrl}
            name={companyName}
            className="transition-all duration-200 hover:-translate-y-px hover:shadow-float"
            secondaryIcon={<CalendarIcon size={13} className="text-ink-faint" />}
            secondary={[latest.quarter, formatDate(latest.date || latest.createdAt, locale)]
              .filter(Boolean)
              .join(' · ')}
            meta={latest.duration ? <span dir="ltr">{latest.duration}</span> : undefined}
          />
        )}
      </section>

      <section className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
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
