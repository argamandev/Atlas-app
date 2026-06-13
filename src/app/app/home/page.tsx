import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getCurrentUser } from '@/lib/auth'
import { listCalls } from '@/lib/db/calls'
import { companyDisplayName } from '@/lib/api/types'
import { formatDate, formatTime } from '@/lib/i18n/format'
import { CollapsiblePanel } from '@/components/app/CollapsiblePanel'
import { Greeting } from '@/components/app/Greeting'
import { HomeSearch } from '@/components/app/HomeSearch'
import { SectionHeader } from '@/components/ds/SectionHeader'
import { EntityRow } from '@/components/ds/EntityRow'
import { CalendarIcon } from '@/components/ds/icons'
import { LiveNowPanel } from '@/components/app/LiveNowPanel'
import { getCompanyByTicker } from '@/lib/db/companies'

export default async function HomePage() {
  const locale = getLocale()
  const dict = getDictionary(locale)
  const { userId, userName } = await getCurrentUser()
  const upcoming = await listCalls({ scope: 'upcoming' })
  const tamis = await getCompanyByTicker('1097229').catch(() => null) // תמיס — the live demo company

  // Live Now: auto-appears when the live engine reports a call in progress (LiveNowPanel polls
  // /api/live/state). In a collapsible side panel so the main search recenters when collapsed.
  const panel = <LiveNowPanel companyName={tamis?.displayName ?? 'תמיס'} logoUrl={tamis?.logoUrl ?? null} />

  return (
    <CollapsiblePanel title={dict.home.liveNow} panel={panel}>
      <div className="app-scroll flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-6">
          {/* hero: greeting + search */}
          <div className="flex flex-col items-center gap-3 pt-[12vh] text-center">
            <Greeting name={userId ? userName : undefined} className="text-[28px] font-bold tracking-tight text-ink" />
            <p className="text-ink-muted">{dict.home.discoverSubhead}</p>
            <div className="mt-3 w-full max-w-lg">
              <HomeSearch />
            </div>
          </div>

          {/* upcoming investor calls */}
          <div className="mt-16 pb-12">
            <SectionHeader label={dict.home.upcomingCalls} className="mb-2" />
            {upcoming.length === 0 ? (
              <p className="px-2.5 py-6 text-sm text-ink-faint">{dict.home.noUpcoming}</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {upcoming.map((call) => (
                  <EntityRow
                    key={call.id}
                    href={`/app/company/${call.companyId}`}
                    logoSrc={call.company?.logoUrl}
                    name={call.company ? companyDisplayName(call.company, locale) : ''}
                    secondaryIcon={<CalendarIcon size={13} className="text-ink-faint" />}
                    secondary={`${call.quarter} · ${formatDate(call.scheduledAt, locale)}`}
                    meta={<span dir="ltr">{formatTime(call.scheduledAt, locale)}</span>}
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
