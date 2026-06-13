'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { companyDisplayName, type Company, type ScheduledCall, type Quote } from '@/lib/api/types'
import type { RecentTranscript } from '@/lib/types'
import { Tabs } from '@/components/ds/Tabs'
import { Logo } from '@/components/ds/Logo'
import { Surface } from '@/components/ds/Surface'
import { EntityRow } from '@/components/ds/EntityRow'
import { SectionHeader } from '@/components/ds/SectionHeader'
import { IconButton } from '@/components/ds/IconButton'
import { SparkleIcon, DotsVerticalIcon, CalendarIcon } from '@/components/ds/icons'
import { AddInvestorCall } from './AddInvestorCall'
import { CompanyOverview } from './CompanyOverview'
import { QuoteCard } from './QuoteCard'
import { formatDate, formatTime } from '@/lib/i18n/format'
import { quarterSortKey } from '@/lib/utils'

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
            <SparkleIcon size={15} className="text-ink-muted" />
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
  transcripts,
  quotes: initialQuotes,
}: {
  company: Company
  calls: ScheduledCall[]
  transcripts: RecentTranscript[]
  quotes: Quote[]
}) {
  const { dict, locale } = useI18n()
  const router = useRouter()
  const [tab, setTab] = useState('overview')
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes)

  const name = companyDisplayName(company, locale)
  const industry = [company.sector, company.subSector].filter(Boolean).join(' · ')
  const openInChat = () => router.push(`/app/chat?company=${company.id}`)
  const isLiveCompany = company.ticker === '1097229' // תמיס — the live-demo company
  const transcriptsByQuarter = groupByQuarter(transcripts)
  const quotesByQuarter = groupByQuarter(quotes)
  const onQuoteRemoved = (id: string) => setQuotes((qs) => qs.filter((q) => q.id !== id))

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

  const finishedRow = (t: RecentTranscript) => (
    <EntityRow
      key={t.id}
      href={`/app/live/${t.id}`}
      logoSrc={company.logoUrl}
      name={name}
      secondaryIcon={<CalendarIcon size={13} className="text-ink-faint" />}
      secondary={[t.quarter, formatDate(t.date || t.createdAt, locale)].filter(Boolean).join(' · ')}
      meta={t.duration ? <span dir="ltr">{t.duration}</span> : undefined}
    />
  )

  return (
    <div className="app-scroll flex-1 overflow-y-auto">
      {/* header — identity on the leading edge (top-left in EN, top-right in HE) */}
      <header className="border-b border-hairline">
        <div className="mx-auto flex max-w-4xl items-start justify-between gap-4 px-8 py-5">
          <div className="flex items-center gap-3">
            <Logo src={company.logoUrl} name={name} size={44} />
            <div className="text-start">
              <h1 className="text-lg font-bold leading-tight text-ink">{name}</h1>
              {industry && <p className="mt-0.5 text-xs text-ink-muted">{industry}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openInChat}
              className="flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              <SparkleIcon size={15} />
              {dict.company.openInChat}
            </button>
            <AddInvestorCall companyId={company.id} />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-8">
        <Tabs
          className="mt-4"
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'overview', label: dict.company.overview },
            { key: 'quotes', label: dict.company.myQuotes },
            { key: 'calls', label: dict.company.investorCalls },
          ]}
        />

        {tab === 'overview' && (
          <div className="py-6">
            <CompanyOverview
              data={{
                companyName: name,
                companyId: company.id,
                logoUrl: company.logoUrl,
                calls,
                transcripts,
                liveEnabled: isLiveCompany,
                liveQuarter: isLiveCompany ? 'Q2 2026' : null,
              }}
            />
          </div>
        )}

        {tab === 'quotes' && (
          <div className="py-6">
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
                        <QuoteCard key={quote.id} quote={quote} companyName={name} companyId={company.id} onRemoved={onQuoteRemoved} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'calls' && (
          <div className="space-y-6 py-6">
            {transcripts.length === 0 && calls.length === 0 ? (
              <p className="px-2.5 py-4 text-sm text-ink-faint">{dict.common.empty}</p>
            ) : (
              <>
                {transcriptsByQuarter.length > 0 && (
                  <div className="space-y-5">
                    <SectionHeader label={dict.company.backlog} className="mb-1" />
                    {transcriptsByQuarter.map(([quarter, ts]) => (
                      <div key={`t-${quarter}`}>
                        <div className="mb-1.5 px-1 text-xs font-medium text-ink-faint" dir="ltr">
                          {quarter}
                        </div>
                        <div className="flex flex-col gap-0.5">{ts.map(finishedRow)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {calls.length > 0 && (
                  <div>
                    <SectionHeader label={dict.company.upcomingCalls} className="mb-2" />
                    <div className="flex flex-col gap-0.5">{calls.map(callRow)}</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
