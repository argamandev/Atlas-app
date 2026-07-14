'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ds/icons'
import { slideStubs, reportStub } from '@/lib/live/call-stubs'
import { PdfViewer } from './PdfViewer'

// Slides/Report facet panes (design lines 480-523) — shared by the finished call view
// (Single + Multi) and the LIVE broadcast view, so both toggle the same content cards.
// Stub deck/report until real slides + PDFs are linked to calls.

export type Facet = 'transcript' | 'slides' | 'report'
export const FACET_MIN: Record<Facet, number> = { transcript: 340, slides: 280, report: 300 }
export const DEF_FLEX: Record<Facet, number> = { transcript: 1.3, slides: 1, report: 1 }

/** Facet column resize (design dc lines 2200-2237: DevTools-style gutter drag).
 *  Flex grow values redistribute between the two columns around a dragged divider.
 *  Shared by the finished + live call views so Multi behaves identically in both. */
export function useFacetColumns() {
  const [colFlex, setColFlex] = useState<Record<Facet, number>>(DEF_FLEX)
  const [dragging, setDragging] = useState(false)
  function dividerDragStart(e: React.PointerEvent<HTMLDivElement>) {
    const handle = e.currentTarget
    const left = handle.previousElementSibling as HTMLElement | null
    const right = handle.nextElementSibling as HTMLElement | null
    const fL = left?.dataset.facet as Facet | undefined
    const fR = right?.dataset.facet as Facet | undefined
    if (!left || !right || !fL || !fR) return
    const wL = left.getBoundingClientRect().width
    const wR = right.getBoundingClientRect().width
    const P = wL + wR
    const startX = e.clientX
    const G = colFlex[fL] + colFlex[fR]
    const minL = FACET_MIN[fL]
    const minR = FACET_MIN[fR]
    const rtl = getComputedStyle(handle).direction === 'rtl'
    setDragging(true)
    const move = (ev: PointerEvent) => {
      const delta = (ev.clientX - startX) * (rtl ? -1 : 1)
      const nWL = Math.max(minL, Math.min(P - minR, wL + delta))
      const nWR = P - nWL
      setColFlex((st) => ({ ...st, [fL]: (G * nWL) / P, [fR]: (G * nWR) / P }))
    }
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      setDragging(false)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    e.preventDefault()
  }
  const facetDivider = (
    <div
      onPointerDown={dividerDragStart}
      onDoubleClick={() => setColFlex(DEF_FLEX)}
      title="Drag to resize · double-click to reset"
      className="group/div flex w-[9px] flex-none cursor-col-resize items-stretch justify-center select-none"
    >
      <div
        className="w-px group-hover/div:w-[2px]"
        style={{ background: dragging ? 'var(--call-ink)' : 'var(--call-hair)' }}
      />
    </div>
  )
  return { colFlex, facetDivider }
}

export function PaneHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    // FIXED 36px band — the design equalizes header heights across panes (Slides gets
    // 6px vertical padding vs 9px, dc line 482) so every bottom hairline meets the
    // gutters at the same y. A fixed height keeps them fitting whatever `right` holds.
    <div className="call-hair flex h-9 flex-none items-center justify-between border-b px-[18px]">
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

export function ReportPane({
  companyId,
  quarter,
  onAskSelection,
  style,
}: {
  companyId?: string | null
  quarter?: string | null
  onAskSelection?: (text: string, page: number | null, documentId: string) => void
  style?: React.CSSProperties
}) {
  const { dict } = useI18n()
  const report = reportStub()
  const [doc, setDoc] = useState<{ id: string; title: string; pageCount: number } | null>(null)
  useEffect(() => {
    if (!companyId || !quarter) return
    let dead = false
    fetch(
      `/api/documents?companyId=${encodeURIComponent(companyId)}&quarter=${encodeURIComponent(quarter)}`,
      { credentials: 'include' }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const d = j?.documents?.find((x: { docType: string }) => x.docType === 'report')
        if (!dead && d) setDoc({ id: d.id, title: d.title, pageCount: d.pageCount })
      })
      .catch(() => {})
    return () => {
      dead = true
    }
  }, [companyId, quarter])

  return (
    <div data-facet="report" style={style} className="flex min-w-[300px] flex-1 flex-col overflow-hidden">
      <PaneHeader
        label={dict.live.report}
        right={<span className="call-muted text-[11px]">{doc ? doc.title : dict.live.reportFreely}</span>}
      />
      <div className="atscroll flex-1 overflow-auto p-[22px]">
        {doc ? (
          <PdfViewer docId={doc.id} pageCount={doc.pageCount} onAskSelection={onAskSelection} />
        ) : (
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
        )}
      </div>
    </div>
  )
}
