'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { ChevronLeftIcon, ChevronRightIcon, ScissorsIcon } from '@/components/ds/icons'
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
      {/* Harvey: the gutter itself is the gap between floating cards — no visible line
          except the ink feedback while actually dragging */}
      <div
        className="w-px group-hover/div:w-[2px]"
        style={{ background: dragging ? 'var(--call-ink)' : 'transparent' }}
      />
    </div>
  )
  return { colFlex, facetDivider }
}

export function PaneHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    // Harvey (design round 2): the label row sits ON THE BACKDROP, above the floating
    // content card — no band, no separator line. Fixed height keeps rows level across panes.
    <div className="flex h-[26px] flex-none items-center justify-between px-1.5">
      {/* Harvey pane labels (probed): 12.5px, weight 700, 0.12em caps, full ink */}
      <span className="call-ink text-[12.5px] font-bold uppercase tracking-[0.12em]">{label}</span>
      {right}
    </div>
  )
}

// Harvey float (design round 2, probed): the content card every pane's body lives in —
// white, 16px, faint warm border, THE pane shadow. Label rows stay outside on the backdrop.
export function PaneCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-win border border-float-line bg-canvas shadow-pane">
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HOW A PANE FINDS ITS DOCUMENT, and the only three ways it may end: a real
// document, an empty period, or a STATED failure.
//
// There is no fourth branch. What used to sit here was reportStub() and
// slideStubs() — invented content shown for a real issuer, including as the
// silent fallback of a failed fetch. See rules/app.md: degradation must be
// visible, and success UI must never stand in for content the server dropped.
//
// TWO ENTRANCES, because there are two ways to arrive at a document:
//   • from the CATALOG — the user clicked one exact filing, so fetch-and-store
//     THAT one (POST /api/documents/open, which re-derives the URL server-side).
//   • from a CALL — no filing was named, so show whatever Atlas already holds
//     for this company and period.
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentSource = { mayaReportId: number; year: number }

type DocState = { id: string; title: string; pageCount: number } | null

function useDocument(
  docType: 'report' | 'slides',
  companyId?: string | null,
  quarter?: string | null,
  source?: DocumentSource | null
) {
  const [doc, setDoc] = useState<DocState>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const srcId = source?.mayaReportId ?? null
  const srcYear = source?.year ?? null

  useEffect(() => {
    // A company/period change must never leave a stale PDF rendering while the
    // next lookup is in flight — clear before anything else runs.
    setDoc(null)
    if (!companyId) {
      setState('idle')
      return
    }
    let dead = false
    setState('loading')

    const settle = (d: DocState) => {
      if (dead) return
      setDoc(d)
      setState(d ? 'ready' : 'idle')
    }
    const fail = () => {
      if (!dead) setState('error')
    }

    if (srcId != null && srcYear != null) {
      fetch('/api/documents/open', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, mayaReportId: srcId, year: srcYear }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j) => settle({ id: j.documentId, title: '', pageCount: j.pageCount }))
        .catch(fail)
      return () => {
        dead = true
      }
    }

    if (!quarter) {
      setState('idle')
      return
    }
    fetch(
      `/api/documents?companyId=${encodeURIComponent(companyId)}&quarter=${encodeURIComponent(quarter)}`,
      { credentials: 'include' }
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => settle(j?.documents?.find((x: { docType: string }) => x.docType === docType) ?? null))
      .catch(fail)
    return () => {
      dead = true
    }
  }, [docType, companyId, quarter, srcId, srcYear])

  return { doc, state }
}

type PaneProps = {
  companyId?: string | null
  quarter?: string | null
  source?: DocumentSource | null
  onAskSelection?: (
    text: string,
    pages: number[],
    documentId: string,
    anchor: { top: number; left: number }
  ) => void
  onSnip?: (snip: ChatSnip, anchor: { top: number; left: number }) => void
  onSnipError?: (reason: 'capture' | 'toolarge') => void
  style?: React.CSSProperties
}

/** The report pane. */
export function ReportPane(props: PaneProps) {
  return <DocumentPane facet="report" {...props} />
}

/**
 * The slides pane — the SAME viewer as the report, because an investor
 * presentation arrives from MAYA as a PDF exactly like a report does. It used
 * to be four invented Hebrew slides with ‹ N › navigation, rendered for every
 * call of every company.
 */
export function SlidesPane(props: PaneProps) {
  return <DocumentPane facet="slides" {...props} />
}

function DocumentPane({
  facet,
  companyId,
  quarter,
  source,
  onAskSelection,
  onSnip,
  onSnipError,
  style,
}: {
  /** Which pane this is. A deck is a PDF like a report, so the two differ only
   *  in their label, their minimum width, and which docType they resolve. */
  facet: 'report' | 'slides'
  companyId?: string | null
  quarter?: string | null
  /** Set when the user arrived from the catalog having clicked one exact filing. */
  source?: DocumentSource | null
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
  const { doc, state } = useDocument(facet, companyId, quarter, source)
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
  // …and the composer's scissors is ENABLED only while a REAL doc is snippable here
  // (stub fallback = no target; the button still renders, visibly disabled).
  // Depend on the derived boolean, not on [doc, onSnip]: onSnip is an unmemoized function
  // declaration in the parent, so those deps changed identity on EVERY parent render and
  // pushed a false→true blip through the global store many times a second during a live call.
  const snippable = Boolean(doc && onSnip)
  useEffect(() => {
    setSnipTarget(snippable)
    return () => setSnipTarget(false)
  }, [snippable])
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
  return (
    <div
      data-facet={facet}
      // The floor comes from FACET_MIN so the CSS minimum and the gutter-drag
      // clamp cannot disagree — they used to be two hand-kept copies of one
      // number, and only the drag path was reading the constant.
      style={{ minWidth: FACET_MIN[facet], ...style }}
      className="flex flex-1 flex-col gap-1.5 overflow-hidden"
    >
      <PaneHeader
        label={facet === 'report' ? dict.live.report : dict.live.slides}
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
      <PaneCard>
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
            // NO DOCUMENT: say which of the three things happened and nothing
            // more. The fabricated card that used to live here rendered
            // invented content for a real issuer — and, being the fetch-error
            // fallback too, it said the loudest thing on screen precisely when
            // Atlas knew the least.
            <div className="call-muted flex h-full items-center justify-center px-8 text-center text-[13px]">
              {state === 'loading'
                ? dict.live.docLoading
                : state === 'error'
                  ? dict.live.docFailed
                  : dict.live.noDocument}
            </div>
          )}
        </div>
      </PaneCard>
    </div>
  )
}
