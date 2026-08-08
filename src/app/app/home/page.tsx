import Link from 'next/link'
import { ChevronRightIcon } from '@/components/ds/icons'
import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getCurrentUser } from '@/lib/auth'
import { listCalls } from '@/lib/db/calls'
import { companyDisplayName } from '@/lib/api/types'
import { formatDate, formatTime, formatRelativeDays } from '@/lib/i18n/format'
import { CollapsiblePanel } from '@/components/app/CollapsiblePanel'
import { Greeting } from '@/components/app/Greeting'
import { TodayLine } from '@/components/app/TodayLine'
import { HomeSearch } from '@/components/app/HomeSearch'
import { UpcomingCard } from '@/components/app/UpcomingCard'
import { SectionHeader } from '@/components/ds/SectionHeader'
import { LiveNowPanel } from '@/components/app/LiveNowPanel'
import { getCompanyByTicker } from '@/lib/db/companies'
import { eventKind, kindLabel } from '@/lib/calendar/event-meta'

export default async function HomePage() {
  const locale = getLocale()
  const dict = getDictionary(locale)
  const { userId, userName } = await getCurrentUser()
  const upcoming = await listCalls({ scope: 'upcoming' })
  const tamis = await getCompanyByTicker('1097229').catch(() => null) // תמיס — the live demo company

  // Live Now: auto-appears when the live engine reports a call in progress (LiveNowPanel polls
  // /api/live/state). In a collapsible side panel so the main search recenters when collapsed.
  // `quarter={null}`: this was the literal "Q2 2026" regardless of date. LiveNowPanel
  // already falls back to the LIVE badge when it has no period, which is the truth —
  // the live engine reports no quarter.
  const panel = <LiveNowPanel companyName={tamis?.displayName ?? 'תמיס'} quarter={null} />

  return (
    <CollapsiblePanel title={dict.home.liveNow} panel={panel}>
      <div className="atscroll flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[780px] flex-col px-10">
          {/* hero: greeting + search (design: 60px top, 620px hero column, 42px headline) */}
          <div className="mx-auto flex w-full max-w-[620px] animate-fade-up flex-col items-center gap-2.5 pt-[60px] text-center">
            <TodayLine />
            {/* Harvey headlines are the serif display voice: Newsreader 500, -0.02em
                (design harvey headFont/headWeight/headLs; probed 42px on the rendered home) */}
            <Greeting
              name={userId ? userName : undefined}
              className="font-display text-[34px] font-medium tracking-[-0.02em] text-ink sm:text-[42px]"
            />
            <p className="text-[16px] text-ink-muted">{dict.home.discoverSubhead}</p>
            <div className="mt-[18px] w-full">
              <HomeSearch />
            </div>
          </div>

          {/* upcoming investor calls (design lines 235-256: label + View all → bordered paper card) */}
          <div className="mt-[52px] pb-16 pb-dock">
            <SectionHeader
              label={dict.home.upcomingCalls}
              className="mb-3.5"
              action={
                <Link
                  href="/app/calendar"
                  className="hov-ink flex items-center gap-1 text-[12.5px] font-medium text-[#575757]"
                >
                  {dict.company.viewAll}
                  <ChevronRightIcon size={13} strokeWidth={1.8} className="rtl:rotate-180" />
                </Link>
              }
            />
            {upcoming.length === 0 ? (
              <p className="px-2.5 py-6 text-sm text-ink-faint">{dict.home.noUpcoming}</p>
            ) : (
              <div className="overflow-hidden rounded-card border border-[#DEDEDE] bg-paper">
                {upcoming.map((call, i) => (
                  <UpcomingCard
                    key={call.id}
                    index={i}
                    href={`/app/company/${call.companyId}`}
                    logoSrc={call.company?.logoUrl}
                    name={call.company ? companyDisplayName(call.company, locale) : ''}
                    // NAME THE EVENT THAT IT IS. This said `dict.home.investorCall`
                    // for every row, so the 99 upcoming REPORT-PUBLICATION dates were
                    // each labelled "investor call" — an event type nobody scheduled.
                    // Found eyes-on 2026-08-09; the clock guard was right and the
                    // label beside it was still asserting the wrong thing.
                    sub={[call.quarter, kindLabel(eventKind(call), dict.calendar)]
                      .filter(Boolean)
                      .join(' · ')}
                    dateLabel={formatDate(call.scheduledAt, locale, { day: 'numeric', month: 'short' })}
                    // Report-publication rows carry a date and no time; showing the
                    // bucketed midnight would invent an appointment nobody announced.
                    timeLabel={call.timeKnown ? formatTime(call.scheduledAt, locale) : ''}
                    relLabel={formatRelativeDays(call.scheduledAt, locale)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </CollapsiblePanel>
  )
}
