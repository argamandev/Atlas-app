'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ds/icons'
import { slideStubs, reportStub } from '@/lib/live/call-stubs'

// Slides/Report facet panes (design lines 480-523) — shared by the finished call view
// (Single + Multi) and the LIVE broadcast view, so both toggle the same content cards.
// Stub deck/report until real slides + PDFs are linked to calls.

export function PaneHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="call-hair flex flex-none items-center justify-between border-b px-[18px] py-[9px]">
      {/* design pane labels are system-font caps (line 449), not mono */}
      <span className="call-muted text-[10.5px] font-semibold uppercase tracking-[0.14em]">{label}</span>
      {right}
    </div>
  )
}

export function SlidesPane({ quarter, style }: { quarter?: string | null; style?: React.CSSProperties }) {
  const { dict } = useI18n()
  const [slideIdx, setSlideIdx] = useState(0)
  const slides = slideStubs()
  const slide = slides[slideIdx % slides.length]
  return (
    <div data-facet="slides" style={style} className="flex min-w-[280px] flex-1 flex-col overflow-hidden">
      <PaneHeader
        label={dict.live.slides}
        right={
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSlideIdx((i) => (i - 1 + slides.length) % slides.length)}
              className="call-muted flex p-1 transition-colors hover:call-ink"
            >
              <ChevronLeftIcon size={16} strokeWidth={1.7} className="rtl:rotate-180" />
            </button>
            <span className="call-ink min-w-[64px] text-center text-[11.5px] font-medium" dir="auto">
              {dict.live.slideLabel} {slideIdx + 1}
            </span>
            <button
              type="button"
              onClick={() => setSlideIdx((i) => (i + 1) % slides.length)}
              className="call-muted flex p-1 transition-colors hover:call-ink"
            >
              <ChevronRightIcon size={16} strokeWidth={1.7} className="rtl:rotate-180" />
            </button>
          </span>
        }
      />
      <div className="atscroll flex-1 overflow-auto p-[22px]">
        <div
          dir="rtl"
          data-ask="1"
          className="call-hair call-card-bg call-ink flex min-h-[260px] flex-col justify-center rounded-lg border p-[34px]"
        >
          <div className="call-muted mb-3 font-mono-num text-[11px] uppercase tracking-[0.14em]" dir="rtl">
            {[quarter, `${dict.live.slideLabel} ${slideIdx + 1}`].filter(Boolean).join(' · ')}
          </div>
          <div className="mb-3.5 font-display text-[23px]">{slide.title}</div>
          <div className="text-[14.5px] leading-[1.9]">{slide.body}</div>
        </div>
      </div>
    </div>
  )
}

export function ReportPane({ style }: { style?: React.CSSProperties }) {
  const { dict } = useI18n()
  const report = reportStub()
  return (
    <div data-facet="report" style={style} className="flex min-w-[300px] flex-1 flex-col overflow-hidden">
      <PaneHeader
        label={dict.live.report}
        right={<span className="call-muted text-[11px]">{dict.live.reportFreely}</span>}
      />
      <div className="atscroll flex-1 overflow-auto p-[22px]">
        <div dir="rtl" data-ask="1" className="call-hair call-card-bg call-ink rounded-lg border px-9 py-8">
          <div className="mb-1.5 font-display text-[21px]">{report.title}</div>
          <div className="call-muted mb-[18px] text-[12.5px]">{report.dateLine}</div>
          {report.paragraphs.map((p) => (
            <p key={p.slice(0, 16)} className="mb-3 text-[14px] leading-[1.95]">
              {p}
            </p>
          ))}
          <p className="call-muted text-[14px] leading-[1.95]">{report.hint}</p>
        </div>
      </div>
    </div>
  )
}
