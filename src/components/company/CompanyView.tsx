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
import { Logo } from '@/components/ds/Logo'
import { LIVE_DEMO_TICKER } from '@/lib/live/demoCompany'
import { AddInvestorCall } from './AddInvestorCall'
import { AdminCallControls } from './AdminCallControls'
import { CompanyOverview } from './CompanyOverview'
import { TranscriptChatPanel } from '@/components/live/TranscriptChatPanel'
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
  // Ask Atlas opens the in-page side dock (design toggleCompanyChat) — NOT the chat page
  const [chatOpen, setChatOpen] = useState(false)

  const name = companyDisplayName(company, locale)
  const industry = [company.sector, company.subSector].filter(Boolean).join(' · ')
  const openInChat = () => setChatOpen(true)
  // WHICH COMPANY PAGE POLLS THE LIVE ENGINE.
  //
  // This is a routing decision, not displayed data: it decides whether this page
  // asks `/api/live/state` every five seconds. The banner's CONTENT comes from
  // the engine's answer, so nothing here is asserted to the user.
  //
  // ⚠ It was briefly rewritten to `calls.find(c => c.status === 'live')` on
  // 2026-08-09 as an "upgrade from a hardcoded ticker". That was wrong and a cold
  // review caught it: NOTHING in this repo writes `scheduled_calls.status='live'`
  // — `git grep` finds only readers — so the condition can never be true and the
  // live banner became permanently unreachable. A prettier trigger that never
  // fires is worse than an ugly one that does.
  //
  // The honest fix is for `/api/live/state` to report WHICH company it is
  // broadcasting, and that is live-engine work — a different chapter by the
  // founder's 2026-08-09 decision. Until then the demo issuer is the trigger.
  // What this branch did remove is the fabricated `liveQuarter: 'Q2 2026'` that
  // rode alongside it, which WAS displayed and was untrue.
  const isLiveCompany = company.ticker === LIVE_DEMO_TICKER
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
    <div className="flex min-h-0 flex-1">
      <div className="atscroll min-w-0 flex-1 overflow-y-auto pb-dock">
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
              {/* The REAL brand mark, falling back to initials. `Logo` renders the
                  monogram itself when `src` is null, which is what the 14 companies
                  without one get — MAYA serves a generic placeholder for those and
                  the sync deliberately stores null rather than a grey square that
                  would assert an identity. Logos are 80x80 square, so object-cover
                  crops nothing. */}
              <Logo src={company.logoUrl} name={name} size={48} className="rounded-[11px]" />
              <div className="min-w-0 text-start">
                <h1 className="font-display text-[27px] font-medium leading-[1.1] tracking-[-0.02em] text-ink">
                  <span dir="auto">{name}</span>
                </h1>
                {/* Identity line: sector and ticker, both REAL columns — and as of
                    2026-08-09 sector is populated for 234 of 234 companies rather
                    than 4.
                    The IR contact and index-membership chips that used to sit here
                    were invented ("Zvika Rabin", TA-125/TA-90 identical for every
                    issuer) and were deleted. ⚠ The note that replaced them said
                    "MAYA publishes neither" — that is now FALSE: `company-details`
                    carries phone/email/address, and `securityIncludedIndices` carries
                    index membership WITH WEIGHTS. Both are restorable as facts; they
                    are simply not in this slice. Do not read their absence as a
                    limit of the feed. */}
                {(industry || company.ticker) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-[9px]">
                    <span className="font-mono-num text-[12.5px] text-[#767676]">
                      {/* Sector is Hebrew, the ticker is Latin digits with a Latin
                          word: one <bdi> per run, direction on the container. A
                          `dir` on the joined line resolves from its FIRST strong
                          character and throws the other run's separators to the
                          wrong end — this repo's most-repeated bug, filed 4 times. */}
                      {industry && <bdi>{industry}</bdi>}
                      {industry && company.ticker && <span> · </span>}
                      {company.ticker && <bdi>{`TASE ${company.ticker}`}</bdi>}
                    </span>
                  </div>
                )}
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
                  className="hov-border flex items-center gap-[7px] rounded-lg border border-[#D5D5D5] px-3.5 py-2 text-[14px] font-semibold text-ink"
                >
                  <SparkleIcon size={22} />
                  {dict.company.askAtlas}
                </button>
              </div>
            </div>
          </div>

          {/* WHAT THE COMPANY DOES, IN ITS OWN FILING. `description` is MAYA's
              `about` — the text its own company page prints under אודות החברה —
              and it is present for 234 of 234 companies. This block replaces
              nothing: the two sections deleted from the overview on
              feat/maya-calendar were an invented CEO quote and four invented
              announcements. This one is a fact with a source.
              Rendered only when there is something to render — an empty panel
              with a heading is a claim that the company said nothing. */}
          {(company.description || company.website) && (
            <div className="mt-[18px] max-w-[640px] animate-fade-up">
              {company.description && (
                // <bdi> INSIDE, no `dir` ON THE BLOCK — and the difference is
                // visible, not theoretical. `dir="auto"` on the <p> resolved to
                // RTL from the Hebrew text and took ALIGNMENT with it, so on the
                // English page the description hugged x=1199 while its own
                // website link sat at x=559: one paragraph flying to the far side
                // of a left-aligned page. Measured, not guessed.
                // The container keeps the page's direction so the block aligns
                // with everything around it; the <bdi> resolves the text's own
                // direction so the Hebrew still reads correctly and a Latin
                // company name inside it cannot flip the line.
                <p className="text-[13.5px] leading-[1.55] text-ink-muted">
                  <bdi>{company.description}</bdi>
                </p>
              )}
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hov-ink mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-[#575757]"
                >
                  {/* The label is Hebrew or English by locale; the host is always
                      Latin. Its own <bdi>, or the host's dots and slashes land at
                      the wrong end of an RTL line. */}
                  <span>{dict.company.website}</span>
                  <bdi className="font-mono-num text-[#767676]">
                    {company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </bdi>
                </a>
              )}
            </div>
          )}

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
                // null, not "Q2 2026": the engine reports no period, so there is
                // none to show. This is the half of the old pair that WAS a claim.
                liveQuarter: null,
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

      {/* Ask Atlas side dock (design toggleCompanyChat): in-page, light call-theme scope
          gives the shared panel its light variables */}
      {chatOpen && (
        <div className="flex min-h-0">
          <TranscriptChatPanel
            companyId={company.id}
            transcriptId={undefined}
            quote=""
            seedNonce={0}
            onClose={() => setChatOpen(false)}
            heroLine2={dict.live.askHeroCompany}
          />
        </div>
      )}
    </div>
  )
}
