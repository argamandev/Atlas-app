'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { ErrorLine } from '@/components/projects/ErrorLine'
import { fetchItemContent } from '@/lib/workspace/client'
import { detectDir } from '@/lib/utils'
import { PdfViewer } from '@/components/live/PdfViewer'
import { TranscriptBody } from '@/components/live/TranscriptBody'
import { usePlayer, usePlayerTime, useViewingCall } from '@/lib/player/PlayerProvider'
import { activeWordIndex, flattenWords } from '@/lib/live/syncEngine'
import type { WordTimedTranscript } from '@/lib/live/syncEngine'
import { ChevronLeftIcon, ChevronRightIcon, ScissorsIcon, PlayIcon } from '@/components/ds/icons'
import type { ChatSnip } from '@/lib/api/chat'
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
  onConnect,
  snipArm = 0,
  onSnip,
  onSnipEnd,
  onSnippable,
}: {
  workspaceId: string
  file: WsFile
  /** marking a passage offers this; absent means the pane is read-only */
  onAskAtlas?: (passage: { itemId: string; title: string; text: string }) => void
  /** work the marked passage into the working document */
  onConnect?: (passage: { itemId: string; title: string; text: string }) => void
  /**
   * SNIP MODE, ARMED FROM OUTSIDE — the Ask Atlas composer's scissors, exactly
   * as the in-call composer arms the report pane. A rising nonce arms; 0
   * disarms. The live call does this through a window event and a module-level
   * bridge, which a workspace cannot copy verbatim: several PDFs can be open at
   * once here, and a global boolean set false by the first pane to unmount
   * would disable the composer's scissors while another PDF is still on screen.
   * Props say which panes exist without any of that bookkeeping.
   */
  snipArm?: number
  onSnip?: (snip: ChatSnip) => void
  /** the arming ended without a clip (cancel, or a failed capture) */
  onSnipEnd?: () => void
  /** this pane is (or is no longer) a real PDF that can be clipped */
  onSnippable?: (itemId: string, can: boolean) => void
}) {
  const { dict } = useI18n()
  const [content, setContent] = useState<ItemContent | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [mark, setMark] = useState<{ text: string; x: number; y: number } | null>(null)
  /** the same menu for a PDF selection — positioned in VIEWPORT coords, which is
   *  what PdfViewer's anchor is (a getBoundingClientRect on the range). */
  const [pdfMark, setPdfMark] = useState<{
    text: string
    title: string
    top: number
    left: number
  } | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)

  // ── READING A REPORT, the way a report is read in a live call ──────────────
  // Founder, 2026-08-05: *"when we're viewing a report, we need to have the same
  // UX as we have the live transcript call, meaning we can move right, we can
  // move left, we can zoom in, we can zoom out. We need to have the exact same
  // user experience."* So these are the ReportPane's controls, on the ReportPane's
  // steps, driving the SAME PdfViewer — only the palette differs, because that
  // pane is themed for the call surface and this one sits on the workspace's paper.
  const ZOOM_STEPS = [75, 90, 100, 110, 125, 150, 175, 200]
  const [zoom, setZoom] = useState(100)
  const [page, setPage] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [snipArmed, setSnipArmed] = useState(false)
  const [snipError, setSnipError] = useState<'capture' | 'toolarge' | null>(null)

  const zoomBy = (dir: 1 | -1) =>
    setZoom((z) => {
      const i = ZOOM_STEPS.indexOf(z)
      return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir))] ?? 100
    })

  /** The page number stays honest when the reader scrolls by hand: the last page
   *  whose top has passed the pane's top is the one being read. */
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

  function goToPage(n: number, total: number) {
    const target = Math.min(total, Math.max(1, n))
    // Instant, not smooth: the label's setState re-renders mid-animation and
    // Chrome cancels the smooth scroll a few pixels in — the jump silently
    // never arrived. Learned on the live report pane; same fix here.
    scrollRef.current
      ?.querySelector(`[data-page="${target}"]`)
      ?.scrollIntoView({ block: 'start', inline: 'nearest' })
    setPage(target)
  }

  // Past 100% the page overflows the pane, and in an RTL pane it anchors to one
  // side — so recentre on every zoom change and give explicit pan buttons.
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    const max = sc.scrollWidth - sc.clientWidth
    if (max <= 0) return
    // Chrome's RTL scroll coordinates run [-max .. 0]; LTR runs [0 .. max].
    sc.scrollLeft = (getComputedStyle(sc).direction === 'rtl' ? -1 : 1) * (max / 2)
  }, [zoom])

  const panBy = (dir: 1 | -1) =>
    // Physical coordinates: positive always moves the view right, either way.
    scrollRef.current?.scrollBy({ left: dir * scrollRef.current.clientWidth * 0.4, behavior: 'smooth' })

  // Armed from the composer. 0 means "nobody is asking", which is also how an
  // arming is cancelled once a clip has landed somewhere.
  useEffect(() => {
    setSnipArmed(snipArm > 0)
  }, [snipArm])

  // Escape leaves snip mode, the same key the in-call viewer honours.
  useEffect(() => {
    if (!snipArmed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSnipArmed(false)
        onSnipEnd?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [snipArmed, onSnipEnd])

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

  // WHETHER THE COMPOSER'S SCISSORS HAS ANYWHERE TO CUT. Held in a ref so this
  // reports on the CONTENT changing, not on the parent handing down a fresh
  // closure — an unmemoized callback in the deps pushed a false→true blip many
  // times a second through the live call's equivalent, which is a bug worth not
  // reproducing.
  const snippableRef = useRef(onSnippable)
  snippableRef.current = onSnippable
  const isPdf = content !== null && content.kind === 'document'
  useEffect(() => {
    if (!isPdf) return
    const id = file.id
    snippableRef.current?.(id, true)
    return () => snippableRef.current?.(id, false)
  }, [isPdf, file.id])

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

  // WHICH WAY THE DOCUMENT READS. Founder, 2026-08-04: *"documents that are open
  // in the platform should be rtl."*
  //
  // Taken from the document's OWN words rather than hardcoded, using the same
  // `detectDir` the chat composer and the transcript reference already use — it
  // is Hebrew-native (an empty or neutral sample returns 'rtl') and weighs
  // Hebrew against Latin, so his corpus reads right-to-left as asked while the
  // English webinars sitting in the same archive are not forced backwards.
  //
  // The container carries it; the paragraphs keep their own `dir="auto"`, so a
  // single English quote inside a Hebrew call still sets itself the right way.
  const sample =
    content === null || content.kind === 'unavailable'
      ? file.name
      : content.kind === 'transcript'
        ? content.sections
            .flatMap((s) => s.lines)
            .slice(0, 12)
            .map((l) => l.text)
            .join(' ')
        : content.pages
            .slice(0, 2)
            .map((p) => p.text)
            .join(' ')
  const docDir = detectDir(sample)

  // A REAL PDF GETS THE REAL VIEWER — the same one the live investor call uses
  // (components/live/PdfViewer: pdf.js canvas per page, a selectable text layer
  // with pdf.js's own bidi positioning, lazy pages, re-fits on gutter drag).
  //
  // Founder, 2026-08-04: *"we have a demo pdf for tigbur lets use it when a user
  // is asking for a report to check if the ux on the pdf (as we built in a live
  // investor call) works!"* It already worked; nothing here reimplements it.
  //
  // Its own `onAskSelection` replaces the pointer-up handler below: selecting
  // inside a pdf.js text layer is not ordinary DOM selection (the spans are
  // absolutely positioned, so a naive `toString()` runs words together), and the
  // viewer already solves that and hands back the page numbers too.
  if (content !== null && content.kind === 'document') {
    const total = content.pageCount
    return (
      <div className="flex h-full min-h-0 flex-col bg-paper">
        <PaneBar title={content.title}>
          {onSnip && (
            <button
              type="button"
              title={dict.live.snip}
              aria-label={dict.live.snip}
              aria-pressed={snipArmed}
              onClick={() => {
                const next = !snipArmed
                setSnipArmed(next)
                if (!next) onSnipEnd?.()
              }}
              className={`flex rounded p-1 transition-colors ${
                snipArmed ? 'bg-ink text-paper' : 'text-ink-ghost hover:text-ink'
              }`}
            >
              <ScissorsIcon size={14} strokeWidth={1.8} />
            </button>
          )}
          {total > 1 && (
            // dir="ltr": "3 / 31" is a numeric run and must not be mirrored,
            // even though the pane around it reads right-to-left.
            <span dir="ltr" className="flex items-center gap-0.5 text-ink-ghost">
              <button
                type="button"
                aria-label="previous page"
                onClick={() => goToPage(page - 1, total)}
                disabled={page <= 1}
                className="flex rounded p-1 transition-colors hover:text-ink disabled:opacity-40"
              >
                <ChevronLeftIcon size={13} strokeWidth={1.8} />
              </button>
              <span className="min-w-[44px] text-center font-mono-num text-[10.5px] tabular-nums">
                {page} / {total}
              </span>
              <button
                type="button"
                aria-label="next page"
                onClick={() => goToPage(page + 1, total)}
                disabled={page >= total}
                className="flex rounded p-1 transition-colors hover:text-ink disabled:opacity-40"
              >
                <ChevronRightIcon size={13} strokeWidth={1.8} />
              </button>
            </span>
          )}
          <span dir="ltr" className="flex items-center gap-0.5 text-ink-ghost">
            <button
              type="button"
              aria-label="zoom out"
              onClick={() => zoomBy(-1)}
              disabled={zoom === ZOOM_STEPS[0]}
              // py-1.5, not bare px: at `leading-none` these were a 13px-tall
              // target and a real cursor slid off them (caught in verification
              // — a synthetic click on the same button passed).
              className="rounded px-1.5 py-1.5 text-[13px] leading-none transition-colors hover:text-ink disabled:opacity-40"
            >
              −
            </button>
            <button
              type="button"
              title="100%"
              onClick={() => setZoom(100)}
              className="w-[38px] py-1.5 text-center font-mono-num text-[10.5px] tabular-nums transition-colors hover:text-ink"
            >
              {zoom}%
            </button>
            <button
              type="button"
              aria-label="zoom in"
              onClick={() => zoomBy(1)}
              disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              // py-1.5, not bare px: at `leading-none` these were a 13px-tall
              // target and a real cursor slid off them (caught in verification
              // — a synthetic click on the same button passed).
              className="rounded px-1.5 py-1.5 text-[13px] leading-none transition-colors hover:text-ink disabled:opacity-40"
            >
              +
            </button>
          </span>
          {zoom > 100 && (
            // The page only overflows once it is zoomed, so the pan controls
            // only exist once there is somewhere to pan to.
            <span dir="ltr" className="flex items-center gap-0.5 text-ink-ghost">
              <button
                type="button"
                aria-label="pan left"
                onClick={() => panBy(-1)}
                className="rounded px-1.5 py-1.5 text-[12px] leading-none transition-colors hover:text-ink"
              >
                ←
              </button>
              <button
                type="button"
                aria-label="pan right"
                onClick={() => panBy(1)}
                className="rounded px-1.5 py-1.5 text-[12px] leading-none transition-colors hover:text-ink"
              >
                →
              </button>
            </span>
          )}
        </PaneBar>
        {/* PdfViewer's own root is `flex flex-col gap-3` — it renders every page
            and lets its PARENT scroll, which is how FacetPanes hosts it. Handing
            it a plain `h-full` box with no overflow meant the pages beyond the
            first were laid out and simply unreachable (founder, 2026-08-04: *"i
            cant scroll through the pdf like i should be able to"*). Same wrapper
            as the live report pane, so lazy page loading behaves identically. */}
        <div
          ref={scrollRef}
          onScroll={() => {
            setPdfMark(null)
            trackPage()
          }}
          className="atscroll min-h-0 flex-1 overflow-auto p-[22px]"
        >
          <PdfViewer
            docId={content.documentId}
            pageCount={total}
            zoom={zoom}
            snipArmed={snipArmed}
            onSnip={(s) => {
              setSnipArmed(false) // one clip per arming, as in the call
              onSnip?.(s)
            }}
            onSnipCancel={() => {
              setSnipArmed(false)
              onSnipEnd?.()
            }}
            onSnipError={(reason) => {
              // NEVER silent: a clip that was captured but is too large would
              // otherwise be dropped server-side while a chip sat in the
              // composer looking sent (.claude/rules/app.md).
              setSnipError(reason)
              setTimeout(() => setSnipError(null), 4000)
            }}
            onAskSelection={
              onAskAtlas || onConnect
                ? (text, pages, _docId, anchor) =>
                    setPdfMark({
                      text,
                      // The page is part of the citation, exactly as the in-call
                      // panel labels a report passage.
                      title:
                        pages.length > 0
                          ? `${content.title} · ${dict.workspace.sourcePage.replace(
                              '{n}',
                              pages.length > 1 ? `${pages[0]}–${pages[pages.length - 1]}` : String(pages[0])
                            )}`
                          : content.title,
                      top: anchor.top,
                      left: anchor.left,
                    })
                : undefined
            }
          />
        </div>
        {snipError && (
          <div
            role="alert"
            className="flex-none border-t border-hairline bg-paper px-3 py-2 text-[12px] text-ink"
          >
            {snipError === 'toolarge' ? dict.workspace.snipTooLarge : dict.workspace.snipFailed}
          </div>
        )}
        {pdfMark && (
          // `fixed`, because the anchor is viewport-space and the pane it sits
          // in scrolls underneath it.
          <div
            style={{ top: pdfMark.top - 8, left: pdfMark.left }}
            className="fixed z-30 flex -translate-x-1/2 -translate-y-full overflow-hidden rounded-lg bg-ink text-[12px] font-medium text-paper shadow-menu"
          >
            {onAskAtlas && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onAskAtlas({ itemId: file.id, title: pdfMark.title, text: pdfMark.text })
                  setPdfMark(null)
                }}
                className="px-3 py-1.5 hover:bg-white/15"
              >
                ✦ {dict.workspace.askAtlas}
              </button>
            )}
            {onAskAtlas && onConnect && <span className="my-1.5 w-px bg-white/25" aria-hidden />}
            {onConnect && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onConnect({ itemId: file.id, title: pdfMark.title, text: pdfMark.text })
                  setPdfMark(null)
                }}
                className="px-3 py-1.5 hover:bg-white/15"
              >
                {dict.workspace.connectToDocument}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <PaneBar title={title} />
      <div
        ref={paneRef}
        onPointerUp={readSelection}
        onScroll={() => setMark(null)}
        className="atscroll relative min-h-0 flex-1 overflow-auto px-8 py-7"
      >
        {mark && (onAskAtlas || onConnect) && (
          // TWO THINGS TO DO WITH A MARKED PASSAGE: ask about it, or put it in the
          // document. Founder, 2026-08-04 — the second one is what makes the
          // workspace feel agentic rather than merely conversational.
          //
          // onMouseDown, not onClick, on both: a click collapses the selection
          // first, so the passage would be gone by the time the handler ran.
          <div
            style={{ left: mark.x, top: mark.y }}
            className="absolute z-20 flex -translate-x-1/2 -translate-y-full overflow-hidden rounded-lg bg-ink text-[12px] font-medium text-paper shadow-menu"
          >
            {onAskAtlas && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onAskAtlas({ itemId: file.id, title, text: mark.text })
                  setMark(null)
                  window.getSelection()?.removeAllRanges()
                }}
                className="px-3 py-1.5 hover:bg-white/15"
              >
                ✦ {dict.workspace.askAtlas}
              </button>
            )}
            {onAskAtlas && onConnect && <span className="my-1.5 w-px bg-white/25" aria-hidden />}
            {onConnect && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onConnect({ itemId: file.id, title, text: mark.text })
                  setMark(null)
                  window.getSelection()?.removeAllRanges()
                }}
                className="px-3 py-1.5 hover:bg-white/15"
              >
                {dict.workspace.connectToDocument}
              </button>
            )}
          </div>
        )}
        <div dir={docDir} className="mx-auto max-w-[760px]">
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
            // A call with stored audio AND word timings plays and follows along;
            // one without either is a read view. Most of the archive is the
            // second kind, and it says nothing about a recording rather than
            // showing a play button over silence.
            content.wordTimed && content.audioUrl ? (
              <KaraokeTranscript content={{ ...content, wordTimed: content.wordTimed }} />
            ) : (
              <TranscriptBodyRead content={content} />
            )
          ) : (
            <DocumentBody content={content} />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * THE NAME OF THE THING YOU ARE READING, above the thing you are reading.
 *
 * Founder, 2026-08-05, of multi-view: *"there needs to be a sync where above the
 * document, there is the name of it."* The tab bar names every open pane in one
 * row, which is unambiguous with one pane and a puzzle with three — you have to
 * match chip position to pane position, and the two rows ran in OPPOSITE
 * directions until this same round fixed the pane order. This bar makes the
 * matching unnecessary: each pane carries its own name.
 *
 * It also gives the PDF controls somewhere to live, which is why it is here and
 * not in WorkspaceDocs — the toolbar belongs to the document, not to the frame.
 */
function PaneBar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-[34px] flex-none items-center justify-between gap-3 border-b border-hairline px-3">
      {/* <bdi>, not dir: a file name mixes scripts ("תיגבור Q1 2026") and this
          line sits inside a container whose direction is not its own. */}
      <span className="min-w-0 truncate text-[11.5px] font-semibold text-ink-faint">
        <bdi>{title}</bdi>
      </span>
      {children && <span className="flex flex-none items-center gap-2.5">{children}</span>}
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

/**
 * THE CALL, PLAYING, WITH THE WORDS FOLLOWING IT.
 *
 * Founder, 2026-08-05: *"when we're pulling a transcript, we also need to pull
 * the audio from it and the same functionality of viewing that live transcript
 * with the audio sync."*
 *
 * This is the live view's own karaoke component and the app's one global
 * player — not a second player. That matters for a reason beyond reuse: the
 * player lives in the app shell so audio survives navigation, so a call started
 * in a workspace keeps playing while the analyst walks to another page, and
 * keying the track by the CORPUS id means opening the same call from the call
 * page does not start it over.
 *
 * ITS OWN COMPONENT so the clock stays local. `usePlayerTime` re-renders its
 * subscriber several times a second; with three panes open and a PDF among them,
 * subscribing from SourceDocument would have re-rendered the PDF on every tick.
 */
function KaraokeTranscript({
  content,
}: {
  content: Extract<ItemContent, { kind: 'transcript' }> & { wordTimed: WordTimedTranscript }
}) {
  const { dict } = useI18n()
  const player = usePlayer()
  const t = usePlayerTime()

  // THE WORDS ARE ALREADY ON SCREEN, so the shell's floating "Return to transcript"
  // chip must not appear over this pane. Founder, 2026-08-05: *"we don't need to
  // return to the live investor call"* — and the chip is worse than redundant here,
  // because following it navigates out of the workspace and takes the panes he
  // arranged with it. Declared while this pane is mounted, released when it closes.
  useViewingCall(content.transcriptId)

  const flat = useMemo(() => flattenWords(content.wordTimed), [content.wordTimed])
  // Only THIS call's words move. Another call playing in the shell must not
  // light up a highlight in a transcript it has nothing to do with.
  const isActive = player.call?.id === content.transcriptId
  const activeIndex = isActive ? activeWordIndex(flat, t) : -1

  const asCall = useCallback(
    (startAt?: number) => ({
      id: content.transcriptId,
      companyId: null,
      title: content.title,
      subtitle: content.quarter ?? '',
      logoUrl: null,
      audioUrl: content.audioUrl as string,
      isLive: false,
      duration: content.wordTimed.durationSec || undefined,
      ...(startAt !== undefined ? { startAt } : {}),
    }),
    [content]
  )

  return (
    <article>
      <header className="mb-4">
        <h1 className="mb-1.5 font-display text-[24px] leading-[1.25] text-ink">
          <bdi>{content.title}</bdi>
        </h1>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-ghost">
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

      {/* One button, and it means what it says. Loading the call publishes it to
          the shell's docked player, which is where pause/scrub/volume already
          live — a second set of transport controls in the pane would be a second
          thing to keep in sync with the audio. */}
      <button
        type="button"
        onClick={() => {
          if (!isActive) player.load(asCall())
          else player.showBar()
          player.play()
        }}
        className="mb-6 flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-paper transition-opacity hover:opacity-90"
      >
        <PlayIcon size={13} /> {dict.workspace.playRecording}
      </button>

      <TranscriptBody
        transcript={content.wordTimed}
        activeIndex={activeIndex}
        autoScroll
        karaoke
        followLabel={dict.live.backToPlaying}
        // Click a word to hear it. If the call is not the active track yet, load
        // it AT that word rather than at zero — the click already said where.
        onWordClick={(start) => {
          if (!isActive) player.load(asCall(start))
          else player.seek(start)
          player.play()
        }}
      />
    </article>
  )
}

function TranscriptBodyRead({ content }: { content: Extract<ItemContent, { kind: 'transcript' }> }) {
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
                <div className="flex items-baseline gap-2">
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
                {/* NO dir="auto" HERE, and this is the whole bug the founder
                    saw (2026-08-05: *"text inside a transcript needs to be
                    right-to-left because it's in Hebrew"*).

                    `dir="auto"` resolves from the line's FIRST STRONG
                    CHARACTER. In an investor call a great many lines open with
                    a figure or an English word — "358.5 מיליון…", "Q1 היה…",
                    "EBITDA עמד על…" — and every one of those lines flipped
                    itself to left-to-right inside an otherwise right-to-left
                    transcript. The container was already RTL; these per-line
                    overrides were fighting it, one line at a time, which is
                    why it looked arbitrary rather than simply broken.

                    The remedy is the one .claude/rules/app.md has now filed
                    five times: DIRECTION ON THE CONTAINER, <bdi> per mixed
                    run. The line inherits; a Latin run inside it still resolves
                    on its own because the browser does that within a bidi
                    paragraph anyway. */}
                <p className="text-[14.5px] leading-[1.85] text-ink">{l.text}</p>
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
          {/* Same rule as the transcript line above: the container is RTL, and
              a page of a Hebrew filing that opens with a table figure must not
              flip the whole page with it. */}
          <p className="whitespace-pre-wrap text-[14px] leading-[1.85] text-ink">{p.text}</p>
        </section>
      ))}
      <p dir="auto" className="mt-8 border-t border-hairline pt-4 text-[12px] text-ink-ghost">
        {dict.workspace.sourceSelectHint}
      </p>
    </article>
  )
}
