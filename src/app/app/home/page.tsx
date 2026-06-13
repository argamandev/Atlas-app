import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getCurrentUser } from '@/lib/auth'
import { listCalls } from '@/lib/db/calls'
import { companyDisplayName } from '@/lib/api/types'
import { formatDate, formatTime } from '@/lib/i18n/format'
import { AppPage } from '@/components/app/AppPage'
import { Greeting } from '@/components/app/Greeting'
import { HomeSearch } from '@/components/app/HomeSearch'
import { SectionHeader } from '@/components/ds/SectionHeader'
import { EntityRow } from '@/components/ds/EntityRow'
import { CalendarIcon } from '@/components/ds/icons'
import { DEMO_LIVE_CALL } from '@/data/demo/liveCall'

export default async function HomePage() {
  const locale = getLocale()
  const dict = getDictionary(locale)
  const { userId, userName } = await getCurrentUser()
  const upcoming = await listCalls({ scope: 'upcoming' })

  // Live Now: DB live calls (none in mock) + the demo live call for the crown-jewel flow.
  const panel = (
    <>
      <SectionHeader label={dict.home.liveNow} />
      <EntityRow
        href={DEMO_LIVE_CALL.href}
        logoSrc={DEMO_LIVE_CALL.logoUrl}
        name={locale === 'en' ? DEMO_LIVE_CALL.companyNameEn : DEMO_LIVE_CALL.companyName}
        secondary={
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-live" />
            <span className="font-medium text-live">{dict.live.liveBadge}</span>
            <span className="text-ink-faint">· {DEMO_LIVE_CALL.quarter}</span>
          </span>
        }
      />
    </>
  )

  return (
    <AppPage panel={panel}>
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
    </AppPage>
  )
}
