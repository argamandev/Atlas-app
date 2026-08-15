'use client'

import { useEffect, useRef, useState } from 'react'
import { dragToPageRect, scaleRect, snipRenderScale } from '@/lib/documents/snip'
import { attachmentOversized } from '@/lib/chat/attachments'
import type { ChatSnip } from '@/lib/chat/grounding'

// Real-PDF viewer for the Report facet pane (multiview M1). pdf.js canvas per page +
// TextLayer (transparent selectable text — pdf.js's own bidi positioning). Pages render
// lazily; width fits the pane and re-fits on gutter drag (debounced via ResizeObserver).
// Pages stay white in both call themes — a document reads like paper.
type PdfLib = typeof import('pdfjs-dist')

// pdf.js is loaded NATIVELY from public/ (like its worker), never through webpack:
// Next 14's webpack mis-wraps the pdfjs-dist 5.4.x ESM bundle and it dies at import
// time with "Object.defineProperty called on non-object" (pdf.js#20478, webpack#20095,
// fixed only in webpack >= 5.103). public/pdf.min.mjs + public/pdf.worker.min.mjs are
// committed copies of the SAME pdfjs-dist build — re-sync BOTH if the package bumps.
const PDFJS_SRC = '/pdf.min.mjs'
let pdfjsPromise: Promise<PdfLib> | null = null
function loadPdfjs(): Promise<PdfLib> {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* webpackIgnore: true */ PDFJS_SRC).then((pdfjs: PdfLib) => {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      return pdfjs
    })
  }
  return pdfjsPromise
}

// Nearest .pdfpage ancestor of a selection endpoint (data-page carries the page number).
function pageOf(node: Node | null): number | null {
  while (node) {
    if (node instanceof HTMLElement && node.dataset.page) return Number(node.dataset.page)
    node = node.parentNode
  }
  return null
}

// The seeded passage, rebuilt from the selection's text nodes. sel.toString() on a pdf.js
// text layer concatenates adjacent spans with NO separator (they're absolutely positioned,
// not flowing text), so words ran together in the chat reference. Joining every selected
// text node with a single space reads like the printed line.
function selectionText(sel: Selection): string {
  const parts: string[] = []
  for (let i = 0; i < sel.rangeCount; i++) {
    const walker = document.createTreeWalker(sel.getRangeAt(i).cloneContents(), NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const t = walker.currentNode.textContent?.trim()
      if (t) parts.push(t)
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

export function PdfViewer({
  docId,
  pageCount,
  zoom = 100,
  onAskSelection,
  snipArmed = false,
  onSnip,
  onSnipCancel,
  onSnipError,
}: {
  docId: string
  pageCount: number
  /** Chrome-style page zoom percentage; >100 overflows horizontally (pane scrolls). */
  zoom?: number
  onAskSelection?: (
    text: string,
    pages: number[],
    documentId: string,
    anchor: { top: number; left: number }
  ) => void
  /** Pinge: snip mode armed by the pane's scissors button */
  snipArmed?: boolean
  onSnip?: (snip: ChatSnip, anchor: { top: number; left: number }) => void
  onSnipCancel?: () => void
  /** 'toolarge' = capture ok but past the server's attachment cap (would be silently stripped) */
  onSnipError?: (reason: 'capture' | 'toolarge') => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<any>(null)
  const [failed, setFailed] = useState(false)
  const [width, setWidth] = useState(0)
  const [retryNonce, setRetryNonce] = useState(0)

  // load pdf.js + the document (auth-gated stream)
  useEffect(() => {
    let dead = false
    let loaded: any = null
    // A stale destroyed doc must never linger in state across a docId switch — children
    // (PdfPage) could call doc.getPage() on it while the new doc is still loading.
    setDoc(null)
    ;(async () => {
      try {
        const pdfjs = await loadPdfjs()
        const task = pdfjs.getDocument({ url: `/api/documents/${encodeURIComponent(docId)}/file` })
        loaded = await task.promise
        if (!dead) setDoc(loaded)
      } catch (err) {
        console.error('[PdfViewer] load failed', (err as Error).message)
        if (!dead) setFailed(true)
      }
    })()
    return () => {
      dead = true
      loaded?.destroy?.()
    }
  }, [docId, retryNonce])

  // pane width (gutter drags resize us) — debounced so dragging stays smooth
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    let t: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver(() => {
      if (t) clearTimeout(t)
      t = setTimeout(() => setWidth(el.clientWidth), 150)
    })
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => {
      ro.disconnect()
      if (t) clearTimeout(t)
    }
  }, [])

  // While a drag-selection is live, every text layer gets .selecting so its .endOfContent
  // covers the layer (see globals.css) — the pdf.js-viewer guard against selections
  // ballooning to whole paragraphs when the pointer leaves the glyph spans mid-drag.
  function onPointerDown() {
    hostRef.current?.querySelectorAll('.pdftext').forEach((el) => el.classList.add('selecting'))
  }
  useEffect(() => {
    const clear = () =>
      hostRef.current
        ?.querySelectorAll('.pdftext.selecting')
        .forEach((el) => el.classList.remove('selecting'))
    // window, not the host: the drag can end (pointerup) outside the pane
    window.addEventListener('pointerup', clear)
    return () => window.removeEventListener('pointerup', clear)
  }, [])

  // ── Pinge snip mode (spec 2026-07-17) ────────────────────────────────────────
  // Drag state in viewport coords; pageNo locked at pointerdown (a snip belongs to one page).
  const [snipDrag, setSnipDrag] = useState<{
    pageNo: number
    start: { x: number; y: number }
    cur: { x: number; y: number }
  } | null>(null)

  useEffect(() => {
    if (!snipArmed) {
      setSnipDrag(null)
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSnipCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [snipArmed, onSnipCancel])

  function pageUnder(x: number, y: number): { el: HTMLElement; pageNo: number } | null {
    for (const el of Array.from(hostRef.current?.querySelectorAll<HTMLElement>('[data-page]') ?? [])) {
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
        return { el, pageNo: Number(el.dataset.page) }
    }
    return null
  }

  // Offscreen high-res capture (spec approach 1): re-render JUST this page at up to 2x
  // (reduced so the crop's long side ≤1600px), crop the rect, PNG. The on-screen zoom
  // never affects output quality — rectPdf is in PDF units.
  async function captureSnip(
    pageNo: number,
    rectPdf: { x: number; y: number; width: number; height: number }
  ) {
    const page = await doc.getPage(pageNo)
    const scale = snipRenderScale(rectPdf)
    const viewport = page.getViewport({ scale })
    const full = document.createElement('canvas')
    full.width = Math.ceil(viewport.width)
    full.height = Math.ceil(viewport.height)
    await page.render({ canvasContext: full.getContext('2d')!, viewport }).promise
    const crop = scaleRect(rectPdf, scale)
    const out = document.createElement('canvas')
    out.width = Math.max(1, Math.round(crop.width))
    out.height = Math.max(1, Math.round(crop.height))
    out
      .getContext('2d')!
      .drawImage(full, crop.x, crop.y, crop.width, crop.height, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  }

  async function finishSnip(x: number, y: number) {
    const d = snipDrag
    setSnipDrag(null)
    if (!d) {
      onSnipCancel?.()
      return
    }
    const pageEl = hostRef.current?.querySelector<HTMLElement>(`[data-page="${d.pageNo}"]`)
    if (!pageEl || !doc) {
      onSnipCancel?.()
      return
    }
    const pr = pageEl.getBoundingClientRect()
    const cssRect = dragToPageRect(
      d.start,
      { x, y },
      {
        left: pr.left,
        top: pr.top,
        width: pr.width,
        height: pr.height,
      }
    )
    if (!cssRect) {
      onSnipCancel?.() // accidental click / sub-threshold drag
      return
    }
    try {
      const page = await doc.getPage(d.pageNo)
      const base = page.getViewport({ scale: 1 })
      const cssScale = pr.width / base.width // rendered CSS px per PDF unit (zoom-dependent)
      const rectPdf = scaleRect(cssRect, 1 / cssScale)
      const dataUrl = await captureSnip(d.pageNo, rectPdf)
      if (attachmentOversized(dataUrl)) {
        // the chip would still render while the image never reached the model — refuse loudly
        // instead. (Since 08c-3 /api/chat/v2 REFUSES an oversized snip with a 400 rather than
        // stripping it, so this client check is the friendlier half of the same law, not the only one.)
        onSnipError?.('toolarge')
        onSnipCancel?.()
        return
      }
      onSnip?.(
        { dataUrl, page: d.pageNo, documentId: docId },
        { top: Math.min(d.start.y, y), left: (d.start.x + x) / 2 }
      )
    } catch (err) {
      console.error('[PdfViewer] snip capture failed', (err as Error).message)
      onSnipError?.('capture')
      onSnipCancel?.()
    }
  }

  function onMouseUp() {
    if (!onAskSelection) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const text = selectionText(sel)
    if (!text) return
    // A selection can span two pages — ground on both the start AND end page, not just start.
    const range = sel.getRangeAt(0)
    const pages = Array.from(
      new Set(
        [pageOf(range.startContainer), pageOf(range.endContainer)].filter((n): n is number => n !== null)
      )
    ).sort((a, b) => a - b)
    const r = range.getBoundingClientRect()
    onAskSelection(text, pages, docId, { top: r.top, left: r.left + r.width / 2 })
  }

  if (failed) {
    return (
      <div
        dir="rtl"
        className="call-hair call-card-bg call-muted rounded-lg border p-6 text-center text-[13px]"
      >
        <p className="mb-3">לא הצלחנו לטעון את המסמך.</p>
        <button
          type="button"
          onClick={() => {
            setFailed(false)
            setDoc(null)
            setRetryNonce((n) => n + 1)
          }}
          className="call-ink call-hair rounded-md border px-3 py-1"
        >
          נסו שוב
        </button>
      </div>
    )
  }

  // Zoomed page width in px. The host keeps the PANE's width (its clientWidth feeds the
  // fit-to-width measurement — sizing it to zoomed children would feed back into itself);
  // zoomed pages simply overflow it and the pane's overflow-auto scrolls horizontally.
  const pageWidth = Math.floor((width * zoom) / 100)
  return (
    <div
      ref={hostRef}
      data-ask="1"
      onPointerDown={onPointerDown}
      onMouseUp={onMouseUp}
      // `safe center`, and the `safe` is the load-bearing half.
      //
      // Below 100% the page is NARROWER than the pane, and a flex column aligns
      // a fixed-width child to the start edge — which in these RTL panes is the
      // physical RIGHT. So a zoomed-out report sat pinned to the right of its
      // own pane with all the empty space on the left (founder, 2026-08-06).
      // Plain `center` would fix that and break the opposite case: a centred
      // item WIDER than its scroll container overflows equally both ways, and
      // the scrollable region does not include the overflow on the start side,
      // so the left half of a zoomed-in page becomes permanently unreachable.
      // `safe` centres only while it fits and falls back to start alignment the
      // moment it does not — which is exactly when SourceDocument's recentre
      // effect takes over and scrolls to the middle instead.
      style={{ alignItems: 'safe center' }}
      className="relative flex flex-col gap-3"
    >
      {doc && pageWidth > 0
        ? Array.from({ length: pageCount }, (_, i) => (
            <PdfPage key={i + 1} doc={doc} pageNo={i + 1} width={pageWidth} />
          ))
        : null}
      {snipArmed && (
        <div
          className="absolute inset-0 z-20 cursor-crosshair touch-none select-none"
          onPointerDown={(e) => {
            e.preventDefault()
            const p = pageUnder(e.clientX, e.clientY)
            if (!p) {
              onSnipCancel?.() // click in the gutter between/outside pages exits
              return
            }
            try {
              // best-effort: keeps the drag alive if the pointer leaves the window; throws
              // for synthetic pointers (test drivers) and stale ids — never load-bearing
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            } catch {
              /* overlay covers the pane — move/up still land on it */
            }
            setSnipDrag({
              pageNo: p.pageNo,
              start: { x: e.clientX, y: e.clientY },
              cur: { x: e.clientX, y: e.clientY },
            })
          }}
          onPointerMove={(e) => setSnipDrag((d) => (d ? { ...d, cur: { x: e.clientX, y: e.clientY } } : d))}
          onPointerUp={(e) => void finishSnip(e.clientX, e.clientY)}
        >
          {(() => {
            const host = hostRef.current?.getBoundingClientRect()
            if (!snipDrag || !host)
              return <div className="pointer-events-none absolute inset-0 bg-black/15" />
            const x0 = Math.min(snipDrag.start.x, snipDrag.cur.x) - host.left
            const y0 = Math.min(snipDrag.start.y, snipDrag.cur.y) - host.top
            const x1 = Math.max(snipDrag.start.x, snipDrag.cur.x) - host.left
            const y1 = Math.max(snipDrag.start.y, snipDrag.cur.y) - host.top
            return (
              <>
                {/* classic screenshot-tool veil: four shaded bands around a clear window */}
                <div
                  className="pointer-events-none absolute bg-black/15"
                  style={{ left: 0, right: 0, top: 0, height: y0 }}
                />
                <div
                  className="pointer-events-none absolute bg-black/15"
                  style={{ left: 0, right: 0, top: y1, bottom: 0 }}
                />
                <div
                  className="pointer-events-none absolute bg-black/15"
                  style={{ left: 0, width: x0, top: y0, height: y1 - y0 }}
                />
                <div
                  className="pointer-events-none absolute bg-black/15"
                  style={{ left: x1, right: 0, top: y0, height: y1 - y0 }}
                />
                <div
                  className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.45)]"
                  style={{ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }}
                />
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// One lazily-rendered page: a white card that keeps its aspect-ratio placeholder until the
// IntersectionObserver says it's near the viewport, then draws canvas + text layer.
function PdfPage({ doc, pageNo, width }: { doc: any; pageNo: number; width: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(pageNo <= 2) // first pages render immediately
  const [ratio, setRatio] = useState(1.414) // A4 until the real viewport is known

  useEffect(() => {
    const el = wrapRef.current
    if (!el || visible) return
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setVisible(true),
      { rootMargin: '600px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let dead = false
    // Held so cleanup can cancel in-flight pdf.js work on rapid re-runs (gutter drag) —
    // otherwise a stale effect can resolve after a newer one already redrew `el` and
    // append a duplicate text layer over it.
    let renderTask: any = null
    let textLayer: any = null
    ;(async () => {
      try {
        const pdfjs = await loadPdfjs()
        if (dead) return
        const page = await doc.getPage(pageNo)
        if (dead) return
        const base = page.getViewport({ scale: 1 })
        const scale = width / base.width
        const viewport = page.getViewport({ scale })
        const el = wrapRef.current
        if (!el || dead) return
        setRatio(viewport.height / viewport.width)
        el.innerHTML = ''
        const canvas = document.createElement('canvas')
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
        el.appendChild(canvas)
        const ctx = canvas.getContext('2d')!
        renderTask = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        })
        await renderTask.promise
        if (dead) return
        const textDiv = document.createElement('div')
        textDiv.className = 'pdftext'
        textDiv.style.setProperty('--scale-factor', String(scale))
        el.appendChild(textDiv)
        textLayer = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textDiv,
          viewport,
        })
        await textLayer.render()
        // the anti-balloon selection anchor (grows to cover the layer while .selecting)
        const end = document.createElement('div')
        end.className = 'endOfContent'
        textDiv.appendChild(end)
      } catch (err) {
        const name = (err as { name?: string } | undefined)?.name
        // A cancelled render/text-layer rejects with RenderingCancelledException /
        // AbortException — expected noise from cleanup below, not a real failure.
        if (name !== 'RenderingCancelledException' && name !== 'AbortException') {
          console.error(`[PdfViewer] page ${pageNo} render failed`, (err as Error).message)
        }
      }
    })()
    return () => {
      dead = true
      try {
        renderTask?.cancel?.()
      } catch {
        // ignore — cancelling an already-settled render task is a no-op
      }
      try {
        textLayer?.cancel?.()
      } catch {
        // ignore — cancelling an already-settled text layer is a no-op
      }
    }
  }, [visible, doc, pageNo, width])

  return (
    <div
      ref={wrapRef}
      data-page={pageNo}
      className="pdfpage flex-none rounded-md bg-white shadow-sm"
      style={{ aspectRatio: `1 / ${ratio}`, width }}
    />
  )
}
