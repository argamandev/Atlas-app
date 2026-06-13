'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { companyDisplayName, type Company, type ScheduledCall, type Quote } from '@/lib/api/types'
import { Tabs } from '@/components/ds/Tabs'
import { Logo } from '@/components/ds/Logo'
import { Surface } from '@/components/ds/Surface'
import { EntityRow } from '@/components/ds/EntityRow'
import { SectionHeader } from '@/components/ds/SectionHeader'
import { IconButton } from '@/components/ds/IconButton'
import { ChatIcon, DotsVerticalIcon, CalendarIcon, QuoteIcon } from '@/components/ds/icons'
import { AddInvestorCall } from './AddInvestorCall'
import { formatDate, formatTime } from '@/lib/i18n/format'
import { quarterSortKey } from '@/lib/utils'
import { DEMO_LIVE_CALL } from '@/data/demo/liveCall'

function groupByQuarter<T extends { quarter?: string | null }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const q = it.quarter || '—'
    const arr = map.get(q) ?? []
    arr.push(it)
    map.set(q, arr)
  }
  return Array.from(map.entries()).sort((a, b) => quarterSortKey(b[0]) - quarterSortKey(a[0]))
}

function CallMenu({ onChat, moreLabel, chatLabel }: { onChat: () => void; moreLabel: string; chatLabel: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative">
      <IconButton label={moreLabel} size={28} onClick={() => setOpen((o) => !o)}>
        <DotsVerticalIcon size={16} />
      </IconButton>
      {open && (
        <Surface elevation="popover" className="absolute end-0 top-full z-50 mt-1 w-44 p-1 text-start">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onChat()
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-ink hover:bg-subtle"
          >
            <ChatIcon size={15} className="text-ink-muted" />
            {chatLabel}
          </button>
        </Surface>
      )}
    </span>
  )
}

export function CompanyView({
  company,
  calls,
  quotes,
}: {
  company: Company
  calls: ScheduledCall[]
  quotes: Quote[]
}) {
  const { dict, locale } = useI18n()
  const router = useRouter()
  const [tab, setTab] = useState('overview')

  const name = companyDisplayName(company, locale)
  const industry = [company.sector, company.subSector].filter(Boolean).join(' · ')
  const openInChat = () => router.push(`/app/chat?company=${company.id}`)
  const isDemoLive = company.ticker === DEMO_LIVE_CALL.companyTicker
  const callsByQuarter = groupByQuarter(calls)
  const quotesByQuarter = groupByQuarter(quotes)

  const callRow = (call: ScheduledCall) => (
    <EntityRow
      key={call.id}
      logoSrc={company.logoUrl}
      name={name}
      secondaryIcon={<CalendarIcon size={13} className="text-ink-faint" />}
      secondary={`${call.quarter} · ${formatDate(call.scheduledAt, locale)}`}
      meta={<span dir="ltr">{formatTime(call.scheduledAt, locale)}</span>}
      trailing={<CallMenu onChat={openInChat} moreLabel={dict.common.more} chatLabel={dict.company.openInChat} />}
    />
  )

  return (
    <div className="app-scroll flex-1 overflow-y-auto">
      {/* header — identity in the top-trailing corner; actions lead */}
      <header className="flex items-start justify-between gap-4 border-b border-hairline px-8 py-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openInChat}
            className="flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <ChatIcon size={15} />
            {dict.company.openInChat}
          </button>
          <AddInvestorCall />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-end">
            <h1 className="text-lg font-bold leading-tight text-ink">{name}</h1>
            {industry && <p className="mt-0.5 text-xs text-ink-muted">{industry}</p>}
          </div>
          <Logo src={company.logoUrl} name={name} size={44} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-8">
        <Tabs
          className="mt-4"
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'overview', label: dict.company.overview },
            { key: 'calls', label: dict.company.investorCalls },
          ]}
        />

        {tab === 'overview' ? (
          <div className="space-y-8 py-6">
            {isDemoLive && (
              <section>
                <SectionHeader label={dict.home.liveNow} className="mb-2" />
                <EntityRow
                  href={DEMO_LIVE_CALL.href}
                  logoSrc={company.logoUrl}
                  name={name}
                  secondary={
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-live" />
                      <span className="font-medium text-live">{dict.live.liveBadge}</span>
                      <span className="text-ink-faint">· {DEMO_LIVE_CALL.quarter}</span>
                    </span>
                  }
                />
              </section>
            )}

            <section>
              <SectionHeader label={dict.company.upcomingCalls} className="mb-2" />
              {calls.length === 0 ? (
                <p className="px-2.5 py-4 text-sm text-ink-faint">{dict.home.noUpcoming}</p>
              ) : (
                <div className="flex flex-col gap-0.5">{calls.map(callRow)}</div>
              )}
            </section>

            <section>
              <SectionHeader label={dict.company.myQuotes} className="mb-2" />
              {quotes.length === 0 ? (
                <p className="px-2.5 py-4 text-sm text-ink-faint">{dict.common.empty}</p>
              ) : (
                <div className="space-y-5">
                  {quotesByQuarter.map(([quarter, qs]) => (
                    <div key={quarter}>
                      <div className="mb-1.5 px-1 text-xs font-medium text-ink-faint" dir="ltr">
                        {quarter}
                      </div>
                      <div className="space-y-2">
                        {qs.map((quote) => (
                          <Surface key={quote.id} tone="canvas" className="border border-hairline p-3.5">
                            <div className="flex gap-2.5">
                              <QuoteIcon size={16} className="mt-0.5 shrink-0 text-ink-faint" />
                              <div>
                                <p className="text-sm leading-relaxed text-ink">{quote.text}</p>
                                {quote.speaker && (
                                  <p className="mt-1.5 text-xs text-ink-muted">{quote.speaker}</p>
                                )}
                              </div>
                            </div>
                          </Surface>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-6 py-6">
            <SectionHeader label={dict.company.backlog} className="mb-1" />
            {calls.length === 0 ? (
              <p className="px-2.5 py-4 text-sm text-ink-faint">{dict.common.empty}</p>
            ) : (
              callsByQuarter.map(([quarter, qs]) => (
                <div key={quarter}>
                  <div className="mb-1.5 px-1 text-xs font-medium text-ink-faint" dir="ltr">
                    {quarter}
                  </div>
                  <div className="flex flex-col gap-0.5">{qs.map(callRow)}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
