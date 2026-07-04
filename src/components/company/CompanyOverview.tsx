'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { EntityRow } from '@/components/ds/EntityRow'
import { SectionHeader } from '@/components/ds/SectionHeader'
import { Logo } from '@/components/ds/Logo'
import { LiveBeamAvatar } from '@/components/ds/LiveBeamAvatar'
import { CalendarIcon, ClockIcon, PlayIcon } from '@/components/ds/icons'
import { formatDate, formatTime, formatRelativeDays } from '@/lib/i18n/format'
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
  // "Next scheduled" = the nearest FUTURE call (the calls feed can contain stale past rows)
  const future = calls
    .filter((c) => new Date(c.scheduledAt).getTime() > Date.now())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
  const nextCall = future[0] ?? null
  const restCalls = future.slice(1)

  return (
    <div className="space-y-7">
      {showLive && liveLink && (
        <section className="animate-fade-up">
          <SectionHeader label={dict.home.liveNow} className="mb-3" />
          <Link
            href={liveLink}
            className="flex max-w-md items-center gap-3 rounded-card border border-subtle-strong bg-paper p-4 shadow-soft transition-shadow hover:shadow-popover"
          >
            <LiveBeamAvatar size={38} surface="card">
              <Logo src={logoUrl} name={companyName} size={32} />
            </LiveBeamAvatar>
            <div className="min-w-0 flex-1 text-start">
              <div className="truncate text-sm font-semibold text-ink">
                <span dir="auto">{companyName}</span>
              </div>
              <span className="flex items-center gap-1.5 text-xs">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-live"
                  style={{ animation: 'atpulse 2s ease-in-out infinite' }}
                />
                <span className="font-semibold tracking-[0.03em] text-live">{dict.live.liveBadge}</span>
                {data.liveQuarter ? (
                  <span className="font-mono-num text-ink-faint" dir="ltr">
                    · {data.liveQuarter}
                  </span>
                ) : null}
              </span>
            </div>
          </Link>
        </section>
      )}

      {/* the design's two-card overview grid (design lines 468-509) */}
      <div
        className="grid animate-fade-up grid-cols-1 gap-4 sm:grid-cols-2"
        style={{ animationDelay: '0.05s' }}
      >
        <section className="flex flex-col gap-3.5">
          <SectionHeader label={dict.company.mostRecentCall} />
          {endedInFlight ? (
            <Link
              href="/app/live/live"
              className="flex flex-col gap-4 rounded-card border border-subtle-strong bg-paper p-[18px] shadow-soft transition-shadow hover:shadow-popover"
            >
              <div className="flex items-center gap-[11px]">
                <Logo src={logoUrl} name={companyName} size={38} className="rounded-[9px]" />
                <div className="min-w-0 flex-1 text-start">
                  <div className="text-[14.5px] font-semibold text-ink">
                    {[data.liveQuarter, dict.home.investorCall].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-live"
                      style={{ animation: 'atpulse 2s ease-in-out infinite' }}
                    />
                    {dict.live.preparing}
                  </div>
                </div>
              </div>
            </Link>
          ) : !latest ? (
            <div className="rounded-card border border-dashed border-subtle-strong px-4 py-8 text-center text-[13px] text-ink-faint">
              {dict.common.empty}
            </div>
          ) : (
            <Link
              href={`/app/live/${latest.id}`}
              className="flex flex-col gap-4 rounded-card border border-subtle-strong bg-paper p-[18px] shadow-soft transition-shadow hover:shadow-popover"
            >
              <div className="flex items-center gap-[11px]">
                <Logo src={logoUrl} name={companyName} size={38} className="rounded-[9px]" />
                <div className="min-w-0 flex-1 text-start">
                  <div className="text-[14.5px] font-semibold text-ink">
                    {[latest.quarter, dict.home.investorCall].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-0.5 font-mono-num text-[12.5px] text-ink-faint" dir="ltr">
                    {formatDate(latest.date || latest.createdAt, locale)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-[9px] text-ink-muted">
                <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-ink text-paper">
                  <PlayIcon size={13} />
                </span>
                <span className="text-[12.5px]">{dict.company.watchPlayback}</span>
                {latest.duration && (
                  <span className="ms-auto font-mono-num text-[11.5px] text-ink-faint" dir="ltr">
                    {latest.duration}
                  </span>
                )}
              </div>
            </Link>
          )}
        </section>

        <section className="flex flex-col gap-3.5">
          <SectionHeader label={dict.company.nextScheduled} />
          {!nextCall ? (
            <div className="rounded-card border border-dashed border-subtle-strong px-4 py-8 text-center text-[13px] text-ink-faint">
              {dict.home.noUpcoming}
            </div>
          ) : (
            <div className="flex flex-col gap-4 rounded-card border border-subtle-strong p-[18px]">
              <div className="flex items-center gap-[11px]">
                <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[9px] bg-subtle text-ink-faint">
                  <CalendarIcon size={18} strokeWidth={1.6} />
                </span>
                <div className="min-w-0 flex-1 text-start">
                  <div className="text-[14.5px] font-semibold text-ink">
                    {[nextCall.quarter, dict.home.investorCall].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-0.5 font-mono-num text-[12.5px] text-ink-faint" dir="ltr">
                    {formatDate(nextCall.scheduledAt, locale)} · {formatTime(nextCall.scheduledAt, locale)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-[9px]">
                <span className="rounded-pill border border-subtle-strong px-2.5 py-[3px] text-xs text-ink-muted">
                  {dict.company.upcoming} · {formatRelativeDays(nextCall.scheduledAt, locale)}
                </span>
                <button
                  type="button"
                  className="ms-auto flex items-center gap-1.5 text-[12.5px] font-medium text-ink transition-opacity hover:opacity-70"
                >
                  <ClockIcon size={14} strokeWidth={1.7} />
                  {dict.company.remindMe}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {restCalls.length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <SectionHeader label={dict.company.upcomingCalls} className="mb-2" />
          <div className="flex flex-col gap-0.5">
            {restCalls.map((call) => (
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
        </section>
      )}
    </div>
  )
}
