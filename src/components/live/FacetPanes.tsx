'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { ChevronLeftIcon, ChevronRightIcon, ScissorsIcon } from '@/components/ds/icons'
import { slideStubs, reportStub } from '@/lib/live/call-stubs'
import { setSnipTarget } from '@/lib/live/snipBridge'
import { PdfViewer } from './PdfViewer'
import type { ChatSnip } from '@/lib/api/chat'

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
      {/* Harvey pane labels (probed): 12.5px, weight 700, 0.12em caps, full ink */}
      <span className="call-ink text-[12.5px] font-bold uppercase tracking-[0.12em]">{label}</span>
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
  onSnip,
  onSnipError,
  style,
}: {
  companyId?: string | null
  quarter?: string | null
  onAskSelection?: (
    text: string,
    pages: number[],
    documentId: string,
    anchor: { top: number; left: number }
  ) => void
  /** Pinge: forwarded to PdfViewer; the scissors button renders only when provided */
  onSnip?: (snip: ChatSnip, anchor: { top: number; left: number }) => void
  onSnipError?: (reason: 'capture' | 'toolarge') => void
  style?: React.CSSProperties
}) {
  const { dict } = useI18n()
  const report = reportStub()
  const [doc, setDoc] = useState<{ id: string; title: string; pageCount: number } | null>(null)
  // Chrome-style page zoom (founder round 2): stepped, % label click = back to 100.
  const ZOOM_STEPS = [75, 90, 100, 110, 125, 150, 175, 200]
  const [zoom, setZoom] = useState(100)
  // Pinge: scissors arms snip mode on the PDF; one snip per arming.
  const [snipArmed, setSnipArmed] = useState(false)
  // Design round 2: the Ask Atlas composer carries a second scissors — it arms THIS pane's
  // snip mode from across the tree (same window-event bridge as atlas:rail-collapse).
  useEffect(() => {
    const arm = () => setSnipArmed(true)
    window.addEventListener('atlas:arm-snip', arm)
    return () => window.removeEventListener('atlas:arm-snip', arm)
  }, [])
  // …and the composer's scissors renders only while a REAL doc is snippable here
  // (stub fallback = no target; a do-nothing scissors would be invisible degradation).
  useEffect(() => {
    setSnipTarget(Boolean(doc && onSnip))
    return () => setSnipTarget(false)
  }, [doc, onSnip])
  const zoomBy = (dir: 1 | -1) =>
    setZoom((z) => {
      const i = ZOOM_STEPS.indexOf(z)
      return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir))] ?? 100
    })
  // Page navigation beside the zoom (founder round 3): ‹ N / total › jumps whole pages;
  // scrolling by hand keeps N honest (the last page whose top passed the pane's top wins).
  const scrollRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(1)
  function trackPage() {
    const sc = scrollRef.current
    if (!sc) return
    const top = sc.getBoundingClientRect().top
    let cur = 1
    sc.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => {
      if (el.getBoundingClientRect().top <= top + 24) cur = Number(el.dataset.page) || cur
    })
    setPage(cur)
  }
  function goToPage(n: number) {
    if (!doc) return
    const target = Math.min(doc.pageCount, Math.max(1, n))
    // instant, not smooth: the label setState re-renders the pane mid-animation and Chrome
    // cancels the smooth scroll a few pixels in — the jump silently never arrived
    scrollRef.current
      ?.querySelector(`[data-page="${target}"]`)
      ?.scrollIntoView({ block: 'start', inline: 'nearest' })
    setPage(target)
  }
  // Zoomed pages overflow to one side (RTL pane anchors them left) — recenter whenever the
  // zoom changes, and give ← → pan buttons for fine adjustment (founder round 4).
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    const max = sc.scrollWidth - sc.clientWidth
    if (max <= 0) return
    // Chrome RTL scroll coordinates run [ -max .. 0 ]; LTR runs [ 0 .. max ]
    sc.scrollLeft = (getComputedStyle(sc).direction === 'rtl' ? -1 : 1) * (max / 2)
  }, [zoom])
  const panBy = (dir: 1 | -1) =>
    // physical coordinates: positive always moves the view right, in both directions
    scrollRef.current?.scrollBy({ left: dir * scrollRef.current.clientWidth * 0.4, behavior: 'smooth' })
  useEffect(() => {
    // A company/quarter change must never leave a stale PDF rendering while the next lookup
    // is in flight (or finds nothing) — clear before anything else runs.
    setDoc(null)
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
      .catch((err) => console.warn('[ReportPane] documents fetch failed', err))
    return () => {
      dead = true
    }
  }, [companyId, quarter])

  return (
    <div data-facet="report" style={style} className="flex min-w-[300px] flex-1 flex-col overflow-hidden">
      <PaneHeader
        label={dict.live.report}
        right={
          <span className="flex items-center gap-2.5">
            {doc && onSnip && (
              <button
                type="button"
                title={dict.live.snip}
                aria-label={dict.live.snip}
                aria-pressed={snipArmed}
                onClick={() => setSnipArmed((v) => !v)}
                className={`flex rounded p-1 transition-colors ${snipArmed ? 'call-ink' : 'call-muted hover:call-ink'}`}
              >
                <ScissorsIcon size={14} strokeWidth={1.8} />
              </button>
            )}
            {doc && doc.pageCount > 1 && (
              <span className="call-muted flex items-center gap-0.5" dir="ltr">
                <button
                  type="button"
                  aria-label="previous page"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="flex rounded p-1 transition-colors hover:call-ink disabled:opacity-40"
                >
                  <ChevronLeftIcon size={13} strokeWidth={1.8} />
                </button>
                <span className="font-mono-num min-w-[44px] text-center text-[10.5px] tabular-nums">
                  {page} / {doc.pageCount}
                </span>
                <button
                  type="button"
                  aria-label="next page"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= doc.pageCount}
                  className="flex rounded p-1 transition-colors hover:call-ink disabled:opacity-40"
                >
                  <ChevronRightIcon size={13} strokeWidth={1.8} />
                </button>
              </span>
            )}
            {doc && (
              <span className="call-muted flex items-center gap-0.5" dir="ltr">
                <button
                  type="button"
                  aria-label="zoom out"
                  onClick={() => zoomBy(-1)}
                  disabled={zoom === ZOOM_STEPS[0]}
                  className="rounded px-1.5 text-[13px] leading-none transition-colors hover:call-ink disabled:opacity-40"
                >
                  −
                </button>
                <button
                  type="button"
                  title="100%"
                  onClick={() => setZoom(100)}
                  className="font-mono-num w-[38px] text-center text-[10.5px] tabular-nums transition-colors hover:call-ink"
                >
                  {zoom}%
                </button>
                <button
                  type="button"
                  aria-label="zoom in"
                  onClick={() => zoomBy(1)}
                  disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                  className="rounded px-1.5 text-[13px] leading-none transition-colors hover:call-ink disabled:opacity-40"
                >
                  +
                </button>
              </span>
            )}
            {doc && zoom > 100 && (
              // pan the zoomed page left/right — it overflows the pane once zoom > 100
              <span className="call-muted flex items-center gap-0.5" dir="ltr">
                <button
                  type="button"
                  aria-label="pan left"
                  onClick={() => panBy(-1)}
                  className="rounded px-1.5 text-[12px] leading-none transition-colors hover:call-ink"
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label="pan right"
                  onClick={() => panBy(1)}
                  className="rounded px-1.5 text-[12px] leading-none transition-colors hover:call-ink"
                >
                  →
                </button>
              </span>
            )}
            <span className="call-muted text-[11px]">{doc ? doc.title : dict.live.reportFreely}</span>
          </span>
        }
      />
      <div ref={scrollRef} onScroll={trackPage} className="atscroll flex-1 overflow-auto p-[22px]">
        {doc ? (
          <PdfViewer
            docId={doc.id}
            pageCount={doc.pageCount}
            zoom={zoom}
            onAskSelection={onAskSelection}
            snipArmed={snipArmed}
            onSnip={(s, anchor) => {
              setSnipArmed(false) // one snip per arming
              onSnip?.(s, anchor)
            }}
            onSnipCancel={() => setSnipArmed(false)}
            onSnipError={onSnipError}
          />
        ) : (
          <div dir="rtl" data-ask="1" className="call-hair call-card-bg call-ink rounded-lg border px-9 py-8">
            {/* the stub card is FABRICATED content (also the fetch-error fallback) — always say so */}
            <span className="call-hair call-muted mb-4 inline-block rounded-full border px-2.5 py-1 text-[11px] font-medium">
              {dict.live.demoContent}
            </span>
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
