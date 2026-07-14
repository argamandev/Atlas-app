'use client'

import { useEffect, useRef, useState } from 'react'

// Real-PDF viewer for the Report facet pane (multiview M1). pdf.js canvas per page +
// TextLayer (transparent selectable text — pdf.js's own bidi positioning). Pages render
// lazily; width fits the pane and re-fits on gutter drag (debounced via ResizeObserver).
// Pages stay white in both call themes — a document reads like paper.
type PdfLib = typeof import('pdfjs-dist')

export function PdfViewer({
  docId,
  pageCount,
  onAskSelection,
}: {
  docId: string
  pageCount: number
  onAskSelection?: (text: string, page: number | null, documentId: string) => void
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
    ;(async () => {
      try {
        const pdfjs: PdfLib = await import('pdfjs-dist')
        // `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` fails the Next
        // production build (Terser chokes on `import.meta` in the emitted worker chunk) — the
        // worker is copied to public/ instead (see /ship notes) and referenced by static path.
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const task = pdfjs.getDocument({ url: `/api/documents/${docId}/file` })
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

  function onMouseUp() {
    if (!onAskSelection) return
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    if (!text || !sel || sel.rangeCount === 0) return
    // page number: nearest .pdfpage ancestor of the selection start
    let node: Node | null = sel.getRangeAt(0).startContainer
    let page: number | null = null
    while (node) {
      if (node instanceof HTMLElement && node.dataset.page) {
        page = Number(node.dataset.page)
        break
      }
      node = node.parentNode
    }
    onAskSelection(text, page, docId)
  }

  if (failed) {
    return (
      <div className="call-hair call-card-bg call-muted rounded-lg border p-6 text-center text-[13px]">
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

  return (
    <div ref={hostRef} data-ask="1" onMouseUp={onMouseUp} className="flex flex-col gap-3">
      {doc && width > 0
        ? Array.from({ length: pageCount }, (_, i) => (
            <PdfPage key={i + 1} doc={doc} pageNo={i + 1} width={width} />
          ))
        : null}
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
    ;(async () => {
      try {
        const pdfjs: PdfLib = await import('pdfjs-dist')
        const page = await doc.getPage(pageNo)
        const base = page.getViewport({ scale: 1 })
        const scale = width / base.width
        const viewport = page.getViewport({ scale })
        setRatio(viewport.height / viewport.width)
        const el = wrapRef.current
        if (!el || dead) return
        el.innerHTML = ''
        const canvas = document.createElement('canvas')
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
        el.appendChild(canvas)
        const ctx = canvas.getContext('2d')!
        await page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        }).promise
        const textDiv = document.createElement('div')
        textDiv.className = 'pdftext'
        textDiv.style.setProperty('--scale-factor', String(scale))
        el.appendChild(textDiv)
        const tl = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textDiv,
          viewport,
        })
        await tl.render()
      } catch (err) {
        console.error(`[PdfViewer] page ${pageNo} render failed`, (err as Error).message)
      }
    })()
    return () => {
      dead = true
    }
  }, [visible, doc, pageNo, width])

  return (
    <div
      ref={wrapRef}
      data-page={pageNo}
      className="pdfpage w-full rounded-md bg-white shadow-sm"
      style={{ aspectRatio: `1 / ${ratio}` }}
    />
  )
}
