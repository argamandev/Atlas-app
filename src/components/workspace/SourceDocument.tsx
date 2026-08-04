'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { ErrorLine } from '@/components/projects/ErrorLine'
import { fetchItemContent } from '@/lib/workspace/client'
import type { ItemContent, UnavailableReason } from '@/lib/workspace/contentTypes'
import type { WsFile } from '@/lib/workspace/data'

// THE REAL FILE, on the shelf the user built.
//
// What this replaces: a hardcoded "דוח שנתי" about Tigbur — invented revenue,
// invented margin — rendered identically for EVERY item, including three real
// investor calls the founder had just agreed to pull (2026-08-04). It carried a
// DEMO chip, so it was not dishonest by this repo's rules, but it answered a
// question nobody asked. A workspace whose whole purpose is reading sources
// beside your own writing cannot show the same fake page for all of them.
//
// NOTHING IS INVENTED HERE. Every state below renders either words that came out
// of the database or a plain statement that they are not there — see the
// `unavailable` branch, which exists precisely so a still-processing call cannot
// fall through to something that looks like content.

export function SourceDocument({
  workspaceId,
  file,
  onAskAtlas,
}: {
  workspaceId: string
  file: WsFile
  /** marking a passage offers this; absent means the pane is read-only */
  onAskAtlas?: (passage: { itemId: string; title: string; text: string }) => void
}) {
  const { dict } = useI18n()
  const [content, setContent] = useState<ItemContent | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [mark, setMark] = useState<{ text: string; x: number; y: number } | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Guards the async setState against a pane the user closed mid-flight, and
    // against a second file's answer arriving before the first one's.
    let live = true
    setContent(null)
    setError(null)
    fetchItemContent(workspaceId, file.id)
      .then(({ content: c }) => {
        if (live) setContent(c)
      })
      .catch((e: unknown) => {
        if (live) setError(e)
      })
    return () => {
      live = false
    }
  }, [workspaceId, file.id])

  // THE SELECTION, read on pointer-up rather than on `selectionchange`.
  //
  // selectionchange fires continuously during a drag, so the button would appear
  // under the moving cursor and jump with every pixel. Pointer-up is the moment
  // the user has actually chosen something. Positioned from the selection's own
  // rectangle so it lands on the passage in BOTH directions — a fixed corner
  // would sit on the wrong side of an RTL column.
  const readSelection = useCallback(() => {
    if (!onAskAtlas) return
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    if (!sel || sel.rangeCount === 0 || text.length < 2) {
      setMark(null)
      return
    }
    // Only a selection INSIDE this pane belongs to this file — with several
    // panes open, marking in one must not offer to quote another.
    const pane = paneRef.current
    if (!pane || !pane.contains(sel.anchorNode) || !pane.contains(sel.focusNode)) {
      setMark(null)
      return
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    const box = pane.getBoundingClientRect()
    setMark({
      text,
      // Relative to the pane, and clamped inside it so a selection at the very
      // edge cannot push the button out of view.
      x: Math.min(Math.max(rect.left - box.left + rect.width / 2, 60), box.width - 60),
      y: Math.max(rect.top - box.top - 8, 8),
    })
  }, [onAskAtlas])

  const title = content && content.kind !== 'unavailable' ? content.title : file.name

  return (
    <div
      ref={paneRef}
      onPointerUp={readSelection}
      onScroll={() => setMark(null)}
      className="atscroll relative h-full min-h-0 overflow-auto bg-paper px-8 py-7"
    >
      {mark && onAskAtlas && (
        <button
          type="button"
          // onMouseDown, not onClick: a click first collapses the selection, and
          // the passage would be gone by the time the handler ran.
          onMouseDown={(e) => {
            e.preventDefault()
            onAskAtlas({ itemId: file.id, title, text: mark.text })
            setMark(null)
            window.getSelection()?.removeAllRanges()
          }}
          style={{ left: mark.x, top: mark.y }}
          className="absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-3 py-1.5 text-[12px] font-medium text-paper shadow-menu"
        >
          ✦ {dict.workspace.askAtlas}
        </button>
      )}
      <div className="mx-auto max-w-[760px]">
        {error !== null ? (
          <div
            role="alert"
            className="rounded-[10px] border border-hairline bg-canvas px-3.5 py-2.5 text-[13px] text-ink"
          >
            <ErrorLine
              template={dict.workspace.sourceFailed}
              error={error}
              auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
            />
          </div>
        ) : content === null ? (
          <Skeleton label={dict.workspace.sourceLoading} />
        ) : content.kind === 'unavailable' ? (
          <Unavailable title={content.title} reason={content.reason} />
        ) : content.kind === 'transcript' ? (
          <TranscriptBody content={content} />
        ) : (
          <DocumentBody content={content} />
        )}
      </div>
    </div>
  )
}

function Skeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={label}>
      {[68, 92, 84, 76, 88, 60].map((w, i) => (
        <span
          key={i}
          className="block h-[13px] animate-pulse rounded bg-subtle"
          style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  )
}

/** A real row with nothing to show, SAYING which — never an empty document. */
function Unavailable({ title, reason }: { title: string; reason: UnavailableReason }) {
  const { dict } = useI18n()
  const body =
    reason === 'processing'
      ? dict.workspace.sourceProcessing
      : reason === 'source-gone'
        ? dict.workspace.sourceGone
        : dict.workspace.sourceNoText
  return (
    <div className="rounded-xl border border-hairline bg-canvas px-9 py-8">
      <div dir="auto" className="mb-2 font-display text-[19px] text-ink">
        <bdi>{title}</bdi>
      </div>
      <p dir="auto" className="text-[13.5px] leading-[1.7] text-ink-muted">
        {body}
      </p>
    </div>
  )
}

function TranscriptBody({ content }: { content: Extract<ItemContent, { kind: 'transcript' }> }) {
  const { dict } = useI18n()
  return (
    <article>
      <header className="mb-6">
        <h1 dir="auto" className="mb-1.5 font-display text-[24px] leading-[1.25] text-ink">
          <bdi>{content.title}</bdi>
        </h1>
        {/* A METADATA LINE IS THE CLASSIC BIDI TRAP — a Hebrew company name, a
            Latin "Q1 2026" and a numeric date on one line. Each run is its own
            <bdi> and the separators live outside them, which is the remedy
            .claude/rules/app.md has filed four times. */}
        <div dir="auto" className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-ghost">
          {content.company && <bdi>{content.company}</bdi>}
          {content.company && content.quarter && <span aria-hidden>·</span>}
          {content.quarter && <bdi>{content.quarter}</bdi>}
          {content.date && <span aria-hidden>·</span>}
          {content.date && (
            <bdi dir="ltr" className="font-mono-num">
              {content.date}
            </bdi>
          )}
        </div>
      </header>

      {content.sections.map((sec) => (
        <section key={sec.id} className="mb-7">
          {sec.title && (
            <h2
              dir="auto"
              className="mb-3 border-b border-hairline pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint"
            >
              <bdi>{sec.title}</bdi>
            </h2>
          )}
          <div className="flex flex-col gap-[18px]">
            {sec.lines.map((l) => (
              // data-line-id is the citation anchor: workspace_doc_blocks stores
              // source_line_id, so a quote taken out of this pane can be pointed
              // back at the exact line it came from.
              <div key={l.id} data-line-id={l.id} className="flex flex-col gap-1">
                <div dir="auto" className="flex items-baseline gap-2">
                  {l.speaker && (
                    <span className="text-[12.5px] font-semibold text-ink">
                      <bdi>{l.speaker}</bdi>
                    </span>
                  )}
                  {l.timestamp && (
                    <span dir="ltr" className="font-mono-num text-[11px] text-ink-ghost">
                      {l.timestamp}
                    </span>
                  )}
                </div>
                <p dir="auto" className="text-[14.5px] leading-[1.85] text-ink">
                  {l.text}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
      <p dir="auto" className="mt-8 border-t border-hairline pt-4 text-[12px] text-ink-ghost">
        {dict.workspace.sourceSelectHint}
      </p>
    </article>
  )
}

function DocumentBody({ content }: { content: Extract<ItemContent, { kind: 'document' }> }) {
  const { dict } = useI18n()
  return (
    <article>
      <header className="mb-6">
        <h1 dir="auto" className="mb-1.5 font-display text-[24px] leading-[1.25] text-ink">
          <bdi>{content.title}</bdi>
        </h1>
        <div dir="auto" className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-ghost">
          {content.docType && <bdi>{content.docType}</bdi>}
          {content.docType && content.quarter && <span aria-hidden>·</span>}
          {content.quarter && <bdi>{content.quarter}</bdi>}
        </div>
      </header>

      {content.pages.map((p) => (
        // The extracted text of a real filing, page by page. This is NOT the PDF
        // — components/live/PdfViewer.tsx renders those, and pointing this pane
        // at it is the obvious next step. What matters today is that the words
        // are the document's own.
        <section key={p.pageNo} data-page={p.pageNo} className="mb-6">
          <div dir="ltr" className="mb-1.5 font-mono-num text-[11px] text-ink-ghost">
            {dict.workspace.sourcePage.replace('{n}', String(p.pageNo))}
          </div>
          <p dir="auto" className="whitespace-pre-wrap text-[14px] leading-[1.85] text-ink">
            {p.text}
          </p>
        </section>
      ))}
      <p dir="auto" className="mt-8 border-t border-hairline pt-4 text-[12px] text-ink-ghost">
        {dict.workspace.sourceSelectHint}
      </p>
    </article>
  )
}
