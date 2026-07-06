'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import {
  companyDisplayName,
  type Company,
  type ScheduledCall,
  type Quote,
  type QuoteFolder,
} from '@/lib/api/types'
import type { RecentTranscript } from '@/lib/types'
import { Tabs } from '@/components/ds/Tabs'
import {
  SparkleIcon,
  ChevronLeftIcon,
  TranscriptIcon,
  FileIcon,
  SlidesIcon,
  VideoIcon,
} from '@/components/ds/icons'
import { Monogram } from '@/components/ds/Monogram'
import { companyOverviewStub } from '@/lib/company/overview-stub'
import { AddInvestorCall } from './AddInvestorCall'
import { AdminCallControls } from './AdminCallControls'
import { CompanyOverview } from './CompanyOverview'
import { MyQuotes } from './MyQuotes'
import { formatDate } from '@/lib/i18n/format'
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

/** "Q2 2026" → "2026"; unparseable quarters group under "—". */
function yearOf(quarter: string): string {
  const m = quarter.match(/(\d{4})/)
  return m ? m[1] : '—'
}

export function CompanyView({
  company,
  calls,
  transcripts,
  quotes: initialQuotes,
  folders,
  initialTab = 'overview',
  isAdmin = false,
}: {
  company: Company
  calls: ScheduledCall[]
  transcripts: RecentTranscript[]
  quotes: Quote[]
  folders: QuoteFolder[]
  initialTab?: string
  isAdmin?: boolean
}) {
  const { dict, locale } = useI18n()
  const router = useRouter()
  const [tab, setTab] = useState(initialTab)
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes)

  const name = companyDisplayName(company, locale)
  // design-demo identity extras + density modules (IR name, index chips) — stub feed
  const stub = companyOverviewStub(company.id)
  const industry = [company.sector, company.subSector].filter(Boolean).join(' · ')
  const openInChat = () => router.push(`/app/chat?company=${company.id}`)
  const isLiveCompany = company.ticker === '1097229' // תמיס — the live-demo company
  const transcriptsByQuarter = groupByQuarter(transcripts)
  const onQuoteRemoved = (id: string) => setQuotes((qs) => qs.filter((q) => q.id !== id))

  // Reports tab: quarters grouped by year, newest first (design lines 561-597).
  const byYear: [string, [string, RecentTranscript[]][]][] = []
  for (const [quarter, ts] of transcriptsByQuarter) {
    const y = yearOf(quarter)
    const bucket = byYear.find(([yy]) => yy === y)
    if (bucket) bucket[1].push([quarter, ts])
    else byYear.push([y, [[quarter, ts]]])
  }

  const artifactBtn = (key: string, label: string, icon: React.ReactNode, href: string | null) =>
    href ? (
      <Link
        key={key}
        href={href}
        title={label}
        className="grid h-8 w-8 place-items-center rounded-lg border border-subtle-strong bg-canvas text-ink-muted transition-colors hover:text-ink"
      >
        {icon}
      </Link>
    ) : (
      <span
        key={key}
        title={label}
        className="grid h-8 w-8 place-items-center rounded-lg border border-dashed border-subtle-strong text-ink-faint/50"
      >
        {icon}
      </span>
    )

  return (
    <div className="atscroll flex-1 overflow-y-auto pb-dock">
      {/* page header (design lines 583-626): breadcrumb → identity (monogram, mono line,
          indices chips) → LIVE·TASE + actions → underline tabs. 1120px centered column. */}
      <div className="mx-auto max-w-[1120px] px-11 pt-[26px]">
        <Link
          href="/app/home"
          className="mb-[18px] flex items-center gap-1.5 text-[12.5px] text-ink-faint transition-colors hover:text-ink-muted"
        >
          <ChevronLeftIcon size={14} strokeWidth={1.7} className="rtl:rotate-180" />
          {dict.company.backToHome}
        </Link>
        <div className="flex animate-fade-up items-start justify-between gap-5">
          <div className="flex min-w-0 items-center gap-3.5">
            <Monogram name={name} size={48} fontSize={21} radius={11} />
            <div className="min-w-0 text-start">
              <h1 className="text-[27px] font-bold leading-[1.1] tracking-[-0.02em] text-ink">
                <span dir="auto">{name}</span>
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-[9px]">
                <span className="font-mono-num text-[12.5px] text-[#8A867C]">
                  {[
                    industry,
                    company.ticker ? `TASE ${company.ticker}` : null,
                    `${dict.company.irLabel}: ${stub.irName}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="h-3 w-px flex-none bg-[#DDD8CE]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#A8A498]">
                  {dict.company.indices}
                </span>
                {stub.indices.map((ix) => (
                  <span
                    key={ix}
                    className="rounded-full border border-[#E6E2DA] bg-paper px-[9px] py-[2px] font-mono-num text-[11px] text-[#6B6862]"
                    dir="ltr"
                  >
                    {ix}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-none flex-col items-end gap-[13px]">
            {/* market status ornament (design lines 603-609) */}
            <span className="flex items-center gap-[7px]">
              <span className="font-mono-num text-[10px] uppercase tracking-[0.16em] text-live" dir="ltr">
                {dict.company.liveTase}
              </span>
              <span className="relative inline-flex h-[6px] w-[6px]">
                <span className="absolute inset-0 rounded-full bg-live" />
                <span
                  className="absolute -inset-1 rounded-full border border-live opacity-50"
                  style={{ animation: 'atping 1.9s ease-out infinite' }}
                />
              </span>
            </span>
            <div className="flex items-center gap-2.5">
              <AddInvestorCall companyId={company.id} />
              <button
                type="button"
                onClick={openInChat}
                className="hov-border flex items-center gap-[7px] rounded-lg border border-[#E0DACE] px-3.5 py-2 text-[14px] font-semibold text-ink"
              >
                <SparkleIcon size={22} />
                {dict.company.askAtlas}
              </button>
            </div>
          </div>
        </div>
        <Tabs
          className="mt-[22px]"
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'overview', label: dict.company.overview },
            { key: 'quotes', label: dict.company.myQuotes },
            { key: 'reports', label: dict.company.reports },
            { key: 'webinars', label: dict.company.webinars },
          ]}
        />
      </div>

      <div className="mx-auto max-w-[1120px] px-11 pb-[120px] pt-7">
        {tab === 'overview' && (
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
        )}

        {tab === 'quotes' && (
          <MyQuotes
            quotes={quotes}
            companyId={company.id}
            companyName={name}
            onRemoved={onQuoteRemoved}
            initialFolders={folders}
          />
        )}

        {tab === 'reports' && (
          <div className="animate-fade-up">
            {/* legend (design line 562): what each quarter can carry */}
            <div className="mb-4 flex items-center gap-4 text-xs text-ink-faint">
              <span>{dict.company.eachQuarter}</span>
              <span className="flex items-center gap-1.5">
                <TranscriptIcon size={14} /> {dict.company.transcript}
              </span>
              <span className="flex items-center gap-1.5">
                <FileIcon size={14} /> {dict.company.reportPdf}
              </span>
              <span className="flex items-center gap-1.5">
                <SlidesIcon size={14} /> {dict.company.slides}
              </span>
            </div>
            {byYear.length === 0 ? (
              <div className="rounded-card border border-dashed border-subtle-strong px-5 py-10 text-center text-[13.5px] text-ink-faint">
                {dict.company.noReports}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {byYear.map(([year, quarters]) => (
                  <div
                    key={year}
                    className="overflow-hidden rounded-card border border-subtle-strong bg-paper"
                  >
                    <div className="flex items-center gap-2.5 px-4 py-3">
                      <span className="text-sm font-semibold text-ink" dir="ltr">
                        {year}
                      </span>
                      <span className="font-mono-num text-xs text-ink-faint" dir="ltr">
                        · {quarters.length} {dict.company.quartersLabel}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      {quarters.map(([quarter, ts]) =>
                        ts.map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3"
                          >
                            <div className="min-w-0">
                              <span className="font-mono-num text-sm font-medium text-ink" dir="ltr">
                                {quarter}
                              </span>
                              <span className="ms-2.5 text-xs text-ink-faint">
                                {formatDate(t.date || t.createdAt, locale)}
                              </span>
                            </div>
                            <div className="flex flex-none items-center gap-2">
                              {artifactBtn(
                                'tr',
                                dict.company.transcript,
                                <TranscriptIcon size={15} />,
                                `/app/live/${t.id}`
                              )}
                              {artifactBtn('pdf', dict.company.reportPdf, <FileIcon size={15} />, null)}
                              {artifactBtn('sl', dict.company.slides, <SlidesIcon size={15} />, null)}
                              {isAdmin && (
                                <AdminCallControls
                                  transcriptId={t.id}
                                  title={t.company}
                                  quarter={t.quarter}
                                />
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'webinars' && (
          <div className="animate-fade-up">
            <div className="mb-5 flex items-start gap-2.5 text-xs leading-relaxed text-ink-faint">
              <VideoIcon size={15} className="mt-0.5 flex-none" />
              <p className="max-w-lg">{dict.company.webinarsExplainer}</p>
            </div>
            <div className="rounded-card border border-dashed border-subtle-strong px-5 py-10 text-center text-[13.5px] text-ink-faint">
              {dict.company.noWebinars}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
