'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { formatDate } from '@/lib/i18n/format'
import { ChevronLeftIcon, TranscriptIcon, FileIcon, SlidesIcon } from '@/components/ds/icons'
import type { CatalogPeriod } from '@/lib/company/documentCatalog'
import type { RecentTranscript } from '@/lib/types'
import { AdminCallControls } from './AdminCallControls'

// ─────────────────────────────────────────────────────────────────────────────
// A COMPANY'S DOCUMENTS, BY YEAR — the drill-down that closes the loop.
//
// YEARS ARE LISTED, NOT FETCHED. MAYA refuses any window wider than a year
// (verified four ways, EventId filter included), so discovering which years an
// issuer filed in would cost one request per year — against a 10-per-2-seconds
// budget shared by the whole product. The founder's shape avoids paying it:
// years are UI, and the fetch follows a click.
//
// A year that holds nothing therefore SAYS so rather than being hidden, since
// finding out costs the same request either way.
// ─────────────────────────────────────────────────────────────────────────────

const FLOOR_YEAR = 2015 // the oldest period label Atlas holds ("FY 2015")

type YearState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  periods: CatalogPeriod[]
}

export function DocumentsTab({
  companyId,
  transcripts,
  isAdmin = false,
  initialYear,
  initialPeriod,
}: {
  companyId: string
  /** What Atlas holds — the source of a transcript row's admin rename/delete. */
  transcripts: RecentTranscript[]
  isAdmin?: boolean
  /** Restored from `?year=` when returning from the reader. */
  initialYear?: string
  initialPeriod?: string
}) {
  const { dict, locale } = useI18n()
  const currentYear = new Date().getFullYear()
  const years: string[] = []
  for (let y = currentYear; y >= FLOOR_YEAR; y--) years.push(String(y))

  const [openYear, setOpenYear] = useState<string | null>(initialYear ?? String(currentYear))
  const [openPeriod, setOpenPeriod] = useState<string | null>(initialPeriod ?? null)
  const [byYear, setByYear] = useState<Record<string, YearState>>({})

  const loadYear = useCallback(
    async (year: string) => {
      setByYear((s) => ({ ...s, [year]: { status: 'loading', periods: [] } }))
      try {
        const res = await fetch(`/api/companies/${companyId}/filings?year=${year}`, {
          credentials: 'include',
        })
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as { periods: CatalogPeriod[] }
        setByYear((s) => ({ ...s, [year]: { status: 'ready', periods: json.periods ?? [] } }))
      } catch {
        // A FAILED YEAR IS NOT AN EMPTY YEAR. Rendering "no filings" here would
        // state something about the issuer out of a network blip.
        setByYear((s) => ({ ...s, [year]: { status: 'error', periods: [] } }))
      }
    },
    [companyId]
  )

  // The newest year (or the one we came back to) opens by itself, so the tab is
  // not a wall of closed rows.
  useEffect(() => {
    if (openYear && !byYear[openYear]) void loadYear(openYear)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openYear])

  function toggleYear(year: string) {
    setOpenPeriod(null)
    setOpenYear((cur) => (cur === year ? null : year))
    if (!byYear[year]) void loadYear(year)
  }

  /** `"FY 2025"` → `שנתי 2025` / `Annual 2025`; quarters keep their MAYA label. */
  function periodLabel(period: string): { head: string; num: string } {
    const [tag, year] = period.split(' ')
    return tag === 'FY' ? { head: dict.company.annual, num: year ?? '' } : { head: '', num: period }
  }

  const artifactRow = (
    key: string,
    icon: React.ReactNode,
    label: string,
    title: string,
    dateISO: string | null,
    href: string,
    /** Admin rename/delete — rendered BESIDE the link, never inside it: a button
     *  nested in an anchor is invalid HTML and the click lands on both. */
    trailing?: React.ReactNode
  ) => (
    <div key={key} className="flex items-center border-t border-hairline pe-3">
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-paper"
      >
        <span className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-subtle-strong bg-canvas text-ink-muted">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          {/* A MIXED-DIRECTION LINE NEEDS <bdi> PER RUN, never dir on the line:
              MAYA titles are Hebrew or English and sit beside a Latin date. */}
          <bdi className="block truncate text-[13.5px] text-ink">{title}</bdi>
          <span className="text-xs text-ink-faint">{label}</span>
        </span>
        {dateISO && (
          <span className="font-mono-num flex-none text-xs text-ink-faint" dir="ltr">
            {formatDate(dateISO, locale)}
          </span>
        )}
      </Link>
      {trailing}
    </div>
  )

  return (
    <div className="animate-fade-up">
      <p className="mb-4 text-xs text-ink-faint">{dict.company.documentsHint}</p>

      <div className="flex flex-col gap-2.5">
        {years.map((year) => {
          const state = byYear[year]
          const isOpen = openYear === year
          return (
            <div key={year} className="overflow-hidden rounded-card border border-subtle-strong bg-paper">
              <button
                type="button"
                onClick={() => toggleYear(year)}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-start transition-colors hover:bg-canvas"
                aria-expanded={isOpen}
              >
                <ChevronLeftIcon
                  size={15}
                  strokeWidth={1.7}
                  className={`transition-transform ${isOpen ? '-rotate-90' : 'rtl:rotate-180'}`}
                />
                <span className="font-mono-num text-sm font-semibold text-ink" dir="ltr">
                  {year}
                </span>
                {isOpen && state?.status === 'ready' && state.periods.length > 0 && (
                  <span className="font-mono-num text-xs text-ink-faint" dir="ltr">
                    · {state.periods.length} {dict.company.quartersLabel}
                  </span>
                )}
              </button>

              {isOpen && (
                <div className="flex flex-col">
                  {state?.status === 'loading' && (
                    <div className="border-t border-hairline px-4 py-4 text-[13px] text-ink-faint">
                      {dict.company.yearLoading}
                    </div>
                  )}

                  {state?.status === 'error' && (
                    <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-4">
                      <span className="text-[13px] text-ink-faint">{dict.company.yearFailed}</span>
                      <button
                        type="button"
                        onClick={() => void loadYear(year)}
                        className="rounded-lg border border-subtle-strong px-2.5 py-1 text-xs text-ink transition-colors hover:bg-canvas"
                      >
                        {dict.company.retry}
                      </button>
                    </div>
                  )}

                  {state?.status === 'ready' && state.periods.length === 0 && (
                    <div className="border-t border-hairline px-4 py-4 text-[13px] text-ink-faint">
                      {dict.company.yearEmpty}
                    </div>
                  )}

                  {state?.status === 'ready' &&
                    state.periods.map((p) => {
                      const { head, num } = periodLabel(p.period)
                      const periodOpen = openPeriod === p.period
                      const year4 = p.year
                      const base = `/app/company/${companyId}/period/${encodeURIComponent(p.period)}`
                      return (
                        <div key={p.period} className="border-t border-hairline">
                          <button
                            type="button"
                            onClick={() => setOpenPeriod((cur) => (cur === p.period ? null : p.period))}
                            className="flex w-full items-center gap-2.5 px-4 py-3 text-start transition-colors hover:bg-canvas"
                            aria-expanded={periodOpen}
                          >
                            <ChevronLeftIcon
                              size={14}
                              strokeWidth={1.7}
                              className={`text-ink-faint transition-transform ${
                                periodOpen ? '-rotate-90' : 'rtl:rotate-180'
                              }`}
                            />
                            {head && <span className="text-sm font-medium text-ink">{head}</span>}
                            <span className="font-mono-num text-sm font-medium text-ink" dir="ltr">
                              {num}
                            </span>
                          </button>

                          {periodOpen && (
                            <div className="flex flex-col bg-canvas">
                              {/* Only what EXISTS is rendered. A period with no deck shows
                                  no deck row — never a disabled tile standing in for one. */}
                              {p.transcriptId &&
                                (() => {
                                  const held = transcripts.find((t) => t.id === p.transcriptId)
                                  return artifactRow(
                                    'tr',
                                    <TranscriptIcon size={15} />,
                                    dict.company.transcript,
                                    held?.company || `${dict.company.transcript} · ${p.period}`,
                                    held?.date || null,
                                    `/app/live/${p.transcriptId}`,
                                    isAdmin && held ? (
                                      <AdminCallControls
                                        transcriptId={held.id}
                                        title={held.company}
                                        quarter={held.quarter}
                                      />
                                    ) : null
                                  )
                                })()}
                              {p.report &&
                                artifactRow(
                                  'rp',
                                  <FileIcon size={15} />,
                                  dict.company.reportPdf,
                                  p.report.title,
                                  p.report.publishedISO,
                                  `${base}?year=${year4}&doc=${p.report.mayaReportId}`
                                )}
                              {p.slides &&
                                artifactRow(
                                  'sl',
                                  <SlidesIcon size={15} />,
                                  dict.company.slides,
                                  p.slides.title,
                                  p.slides.publishedISO,
                                  `${base}?year=${year4}&doc=${p.slides.mayaReportId}`
                                )}
                              {!p.transcriptId && !p.report && !p.slides && (
                                <div className="border-t border-hairline px-4 py-3 text-[13px] text-ink-faint">
                                  {dict.company.noDocsThisPeriod}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
