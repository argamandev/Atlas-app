'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Logo } from '@/components/ds/Logo'
import {
  CloseIcon,
  ChevronLeftIcon,
  PlayIcon,
  QuoteIcon,
  ShareIcon,
  SparkleIcon,
  ChevronRightIcon,
  TranscriptIcon,
  SlidesIcon,
  FileIcon,
  PlusIcon,
} from '@/components/ds/icons'
import { PaneHeader, PaneCard, SlidesPane, ReportPane, useFacetColumns, type Facet } from './FacetPanes'
import { TranscriptBody } from './TranscriptBody'
import { AnimCanvas } from '@/components/ds/AnimCanvas'
import { TranscriptChatPanel } from './TranscriptChatPanel'
import type { ChatSnip } from '@/lib/api/chat'
import { MediaPlayer } from './MediaPlayer'
import { flattenWords, activeWordIndex, type WordTimedTranscript } from '@/lib/live/syncEngine'
import { formatDate } from '@/lib/i18n/format'
import { createQuote } from '@/lib/api/quotes'
import { useLiveAudio } from '@/lib/live/LiveAudioProvider'
import { LIVE_BUFFER_SEC } from '@/lib/live/liveTiming'

// LIVE broadcast — the V1 transcript page, fed by the live engine (/api/live/*). Same header,
// tabs, karaoke TranscriptBody and MediaPlayer as the finished-transcript page; the difference
// is the data streams in and the audio is scheduled through Web Audio, held `delaySec` behind
// live. Joining drops you at the LIVE edge (liveEdge − delaySec), not the start of the call.
//
// The audio engine now lives in LiveAudioProvider (app shell) so it persists across navigation
// (Global Live Call). This component is a CONSUMER: it starts the engine on mount, renders the
// transcript + in-page controls from the provider, and keeps only UI-local state (selection,
// chat, toast, autoScroll). When you navigate away, the global live bar + return chip take over.

export function LiveBroadcastView({
  companyName,
  companyId,
  quarter,
  logoUrl,
  delaySec = LIVE_BUFFER_SEC,
  persistKey,
  playheadRef,
  onSourceEnded,
  onLiveOver,
}: {
  companyName: string
  companyId: string | null
  quarter: string
  logoUrl: string | null
  delaySec?: number
  persistKey?: string
  playheadRef?: React.MutableRefObject<number>
  onSourceEnded?: () => void
  onLiveOver?: () => void
}) {
  const { dict, locale } = useI18n()
  const router = useRouter()

  // The live audio engine (global, app-shell). This view consumes it.
  const live = useLiveAudio()
  const {
    words,
    phase,
    countdown,
    liveEnded,
    paused,
    volume,
    playingRel,
    broadcastEdge,
    over,
    behind,
    start,
    join,
    playPause,
    seek,
    goLive,
    setVolume,
    stop,
    setViewing,
    setChatOpen,
  } = live

  // UI-only local state (selection, chat, toast, facet) stays in the view.
  const [autoScroll] = useState(true) // always on; the scroll-pause + "back to live" chip manages it
  // live facets — Transcript · Slides · Report chips + Single|Multi, same as the finished view
  const [facet, setFacet] = useState<Facet>('transcript')
  const [view, setView] = useState<'single' | 'multi'>('single')
  const [multiFacets, setMultiFacets] = useState<Set<Facet>>(
    () => new Set<Facet>(['transcript', 'slides', 'report'])
  )
  const { colFlex, facetDivider } = useFacetColumns()
  const [selection, setSelection] = useState<{
    text: string
    top: number
    left: number
    speaker: string | null
    segmentId: string | null
  } | null>(null)
  const [chat, setChat] = useState<{
    open: boolean
    seed: string
    nonce: number
    docRef: { documentId: string; pages: number[] } | null
    snip: ChatSnip | null
  }>({
    open: false,
    docRef: null,
    snip: null,
    seed: '',
    nonce: 0,
  })
  const [toast, setToast] = useState<{ text: string; action?: { label: string; href: string } } | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  // Start the engine on mount (idempotent — a no-op if we navigated back to a still-running call).
  useEffect(() => {
    start({ companyName, companyId, quarter, logoUrl, delaySec, persistKey })
  }, [start, companyName, companyId, quarter, logoUrl, delaySec, persistKey])

  // Tell the provider this view is displaying the call → the global bar + return chip hide while here.
  useEffect(() => {
    setViewing(true)
    return () => setViewing(false)
  }, [setViewing])

  // Pinge/unification (parity with the finished view): a PDF text-mark or snip made while
  // the chat is CLOSED waits here, under a floating Ask-Atlas button at the anchor.
  const [pdfPending, setPdfPending] = useState<
    | {
        kind: 'text'
        text: string
        pages: number[]
        documentId: string
        anchor: { top: number; left: number }
      }
    | { kind: 'snip'; snip: ChatSnip; anchor: { top: number; left: number } }
    | null
  >(null)
  useEffect(() => {
    if (!pdfPending) return
    const clear = () => setPdfPending(null)
    window.addEventListener('pointerdown', clear)
    return () => window.removeEventListener('pointerdown', clear)
  }, [pdfPending])

  function onReportAsk(
    text: string,
    pages: number[],
    documentId: string,
    anchor: { top: number; left: number }
  ) {
    if (chat.open) {
      setChat((c) => ({ ...c, seed: text, nonce: c.nonce + 1, docRef: { documentId, pages }, snip: null }))
    } else {
      setPdfPending({ kind: 'text', text, pages, documentId, anchor })
    }
  }

  function onReportSnip(snip: ChatSnip, anchor: { top: number; left: number }) {
    if (chat.open) {
      setChat((c) => ({ ...c, seed: '', nonce: c.nonce + 1, docRef: null, snip }))
    } else {
      setPdfPending({ kind: 'snip', snip, anchor })
    }
  }

  function firePdfPending() {
    const p = pdfPending
    if (!p) return
    setPdfPending(null)
    if (p.kind === 'text') {
      setChat((c) => ({
        open: true,
        seed: p.text,
        nonce: c.nonce + 1,
        docRef: { documentId: p.documentId, pages: p.pages },
        snip: null,
      }))
    } else {
      setChat((c) => ({ open: true, seed: '', nonce: c.nonce + 1, docRef: null, snip: p.snip }))
    }
  }

  // Side chat open → the global bar narrows to its left (mirrors the finished view).
  useEffect(() => {
    setChatOpen(chat.open)
    return () => setChatOpen(false)
  }, [chat.open, setChatOpen])

  // Keep LiveSession's playhead ref current (it seeds the finished view's initial seek on swap).
  useEffect(() => {
    if (playheadRef) playheadRef.current = playingRel
  }, [playingRel, playheadRef])

  // On unmount: tear the engine down ONLY if the live experience is fully over (drain done → swap to
  // the finished view). Plain navigation (over=false) leaves the engine running so audio persists.
  const overRef = useRef(false)
  useEffect(() => {
    overRef.current = over
  }, [over])
  useEffect(
    () => () => {
      if (overRef.current) stop()
    },
    [stop]
  )

  // streaming words → a single-segment word-timed transcript (V1 karaoke renders it)
  const transcript = useMemo<WordTimedTranscript>(() => {
    const w = words.map((x) => ({ text: x.text, start: x.start ?? 0, end: x.start ?? 0 }))
    return {
      segments: [
        {
          id: 'live',
          speakerId: 'live',
          speakerName: companyName,
          role: null,
          words: w,
          start: 0,
          end: w.at(-1)?.start ?? 0,
        },
      ],
      durationSec: w.at(-1)?.start ?? 0,
      hasWordTimings: true,
    }
  }, [words, companyName])

  const flat = useMemo(() => flattenWords(transcript), [transcript])
  const activeIndex = useMemo(() => activeWordIndex(flat, playingRel), [flat, playingRel])
  // The on-screen captions as plain text — fed to "Ask Atlas" so it answers about THIS live call
  // (not a DB lookup that could hit a different company). Undefined until the first captions arrive.
  const liveCaptionsText = useMemo(
    () => (words.length ? `${companyName} — ${quarter}\n\n${words.map((w) => w.text).join(' ')}` : undefined),
    [words, companyName, quarter]
  )

  function onTab(key: string) {
    if (key === 'overview') {
      if (companyId) router.push(`/app/company/${companyId}`)
      else router.push('/app/home')
    }
  }

  // ── selection → Save Quote / Ask Atlas / Share (mirrors the finished view, no edit-mode) ──
  function selectionSpeaker(sel: Selection | null): string | null {
    let node: Node | null = sel?.anchorNode ?? null
    while (node && node.nodeType !== 1) node = node.parentNode
    return (
      ((node as Element | null)?.closest('[data-segment-id]') ?? null)?.getAttribute('data-speaker') ?? null
    )
  }
  function selectionSegmentId(sel: Selection | null): string | null {
    let node: Node | null = sel?.anchorNode ?? null
    while (node && node.nodeType !== 1) node = node.parentNode
    return (
      ((node as Element | null)?.closest('[data-segment-id]') ?? null)?.getAttribute('data-segment-id') ??
      null
    )
  }
  function onTextSelect() {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    const text = sel?.toString().trim() ?? ''
    if (!text || !sel || sel.rangeCount === 0) {
      setSelection(null)
      return
    }
    // chat open → drop the highlight straight into the composer as a reference (Claude-style)
    if (chat.open) {
      setChat((c) => ({ ...c, seed: text, nonce: c.nonce + 1, docRef: null, snip: null }))
      setSelection(null)
      return
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      setSelection(null)
      return
    }
    setSelection({
      text,
      top: rect.top,
      left: rect.left + rect.width / 2,
      speaker: selectionSpeaker(sel),
      segmentId: selectionSegmentId(sel),
    })
  }
  async function saveSelection(sel: { text: string; speaker: string | null; segmentId: string | null }) {
    if (!sel.text || !companyId) {
      setToast({ text: dict.common.error })
      return
    }
    try {
      await createQuote({
        companyId,
        transcriptId: null, // live: no finished transcript yet — 2C links/upgrades it
        text: sel.text,
        speaker: sel.speaker ?? companyName,
        quarter,
        startSec: playingRel,
        anchor: sel.segmentId ? { segmentId: sel.segmentId, text: sel.text.slice(0, 80) } : null,
      })
      setToast({
        text: dict.live.quoteSaved,
        action: { label: dict.company.myQuotes, href: `/app/company/${companyId}?tab=quotes` },
      })
    } catch (err) {
      setToast({ text: (err as Error).message })
    }
  }
  function shareSelection(text: string) {
    const msg = `${companyName} said on ${quarter ? `the ${quarter}` : 'an'} investor call: "${text}"`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }

  const fmt = (s: number) => {
    s = Math.max(0, Math.round(s))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  // Source stopped → start the finish pipeline (the wrapper shows the auto-dismissing card). View stays LIVE.
  useEffect(() => {
    if (liveEnded) onSourceEnded?.()
  }, [liveEnded]) // eslint-disable-line react-hooks/exhaustive-deps
  // Buffer fully drained → the live experience is over; the wrapper swaps to the finished view (when ready).
  useEffect(() => {
    if (over) onLiveOver?.()
  }, [over]) // eslint-disable-line react-hooks/exhaustive-deps

  // freeze the ring's start value at the FIRST real remaining-seconds reading — the canvas
  // countdown self-ticks from data-secs, so it stays in sync once seeded with the truth
  const ringSecsRef = useRef<number | null>(null)
  if (ringSecsRef.current === null && countdown != null && countdown > 0) {
    ringSecsRef.current = Math.round(countdown)
  }
  const ringSecs = ringSecsRef.current

  const overlayMsg =
    phase === 'connecting'
      ? 'מתחבר לשידור…'
      : phase === 'waiting'
        ? 'ממתין לתחילת השיחה…'
        : phase === 'buffering'
          ? dict.live.buffering.replace('{min}', String(Math.round(delaySec / 60)))
          : 'השידור זמין — הצטרפו לצפייה'

  const facetTabs = [
    { key: 'transcript', label: dict.live.transcript },
    { key: 'slides', label: dict.live.slides },
    { key: 'report', label: dict.live.report },
  ] as const

  return (
    <div className="call-bg call-ink flex h-full min-h-0 flex-1">
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* identity header (63px, design lines 253-268) */}
        {/* Harvey: flat identity header — no separator line (design h 58, pad 26) */}
        <header className="flex h-[58px] flex-none items-center justify-between gap-3 px-[26px]">
          <div className="flex min-w-0 items-center gap-2.5" dir="ltr">
            <Logo src={logoUrl} name={companyName} size={30} className="rounded-[7px]" />
            <span className="call-ink max-w-[460px] truncate text-[13.5px] font-semibold">
              <span dir="auto">
                {companyName} — {quarter}
              </span>
            </span>
            <span className="call-muted flex-none font-mono-num text-[11.5px]" dir="ltr">
              {formatDate(new Date().toISOString(), locale)}
            </span>
            {phase === 'playing' && !over && (
              <span
                className="call-panel-bg call-muted shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 font-mono-num text-2xs tabular-nums"
                dir="ltr"
              >
                -{fmt(behind)} {dict.live.behindLive}
              </span>
            )}
          </div>
          {/* top-right: LIVE pill through the whole live + drain window; once the drain is over the badge
            drops (the view becomes a finished recording; the "ended / AI processing" note lives in the card). */}
          <div className="flex flex-none items-center gap-3.5">
            {!over && (
              <span className="flex flex-none items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-live"
                  style={{ animation: 'atpulse 2s ease-in-out infinite' }}
                />
                <span className="text-2xs font-bold tracking-wide text-live">{dict.live.liveBadge}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() =>
                setChat((c) => ({ open: true, seed: '', nonce: c.nonce + 1, docRef: null, snip: null }))
              }
              className="call-hair call-ink flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] transition-opacity hover:opacity-80"
            >
              <SparkleIcon size={14} strokeWidth={1.6} />
              {dict.live.askAtlas}
            </button>
            <button
              type="button"
              title={dict.common.close}
              onClick={() => router.push('/app/home')}
              className="call-muted transition-colors hover:call-ink"
            >
              <CloseIcon size={17} />
            </button>
          </div>
        </header>

        {/* facet controls (live view pins Transcript) — Harvey (probed): flat row, no card,
            no separator; the float lives in the pane cards below */}
        <div className="flex flex-none items-center justify-between px-6">
          <div className="flex items-center gap-[22px] text-[13.5px]">
            <button
              type="button"
              onClick={() => onTab('overview')}
              className="call-muted flex items-center gap-1.5 py-3 font-medium transition-colors hover:call-ink"
            >
              <ChevronLeftIcon size={15} strokeWidth={1.7} className="rtl:rotate-180" />
              {dict.live.backToOverview}
            </button>
            <span className="call-hair h-4 w-px border-s" />
            {/* facet chips (founder fine-tune): the LIVE call toggles Transcript · Slides · Report
                like the finished call — audio + karaoke keep running underneath. In Multi all
                chips are ×-removable / +-re-addable; the last visible facet stays. */}
            <div className="flex items-center gap-2 py-2">
              {facetTabs.map((ft) => {
                const key = ft.key
                const Icon = key === 'transcript' ? TranscriptIcon : key === 'slides' ? SlidesIcon : FileIcon
                const active = view === 'multi' ? multiFacets.has(key) : facet === key
                const removable = view === 'multi'
                return (
                  <button
                    key={key}
                    type="button"
                    title={ft.label}
                    onClick={() => {
                      if (view === 'multi') {
                        setMultiFacets((prev) => {
                          const next = new Set(prev)
                          if (next.has(key)) {
                            if (next.size === 1) return prev // the last facet stays
                            next.delete(key)
                          } else {
                            next.add(key)
                          }
                          return next
                        })
                      } else {
                        setFacet(key)
                      }
                    }}
                    className={`flex items-center gap-[7px] rounded-full px-[11px] py-[5px] text-[12.5px] transition-colors ${
                      active
                        ? 'call-hair call-panel-bg call-ink border font-semibold'
                        : 'call-hair call-muted border font-medium hover:call-ink'
                    }`}
                  >
                    <span className={`flex ${active ? 'call-ink' : 'call-muted'}`}>
                      <Icon size={13} strokeWidth={1.6} />
                    </span>
                    {ft.label}
                    {removable && (
                      <span className={`flex ${active ? 'call-muted' : 'call-faint'}`}>
                        {active ? (
                          <CloseIcon size={12} strokeWidth={2} />
                        ) : (
                          <PlusIcon size={12} strokeWidth={2} />
                        )}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="call-muted text-[11.5px]">{dict.live.viewLabel}</span>
            <div className="call-track-bg flex rounded-pill p-[3px]">
              <button
                type="button"
                onClick={() => setView('single')}
                className={`rounded-pill px-3 py-[5px] text-[12px] font-medium transition-colors ${
                  view === 'single' ? 'bg-ink text-paper' : 'call-muted'
                }`}
              >
                {dict.live.viewSingle}
              </button>
              <button
                type="button"
                onClick={() => setView('multi')}
                className={`rounded-pill px-3 py-[5px] text-[12px] font-medium transition-colors ${
                  view === 'multi' ? 'bg-ink text-paper' : 'call-muted'
                }`}
              >
                {dict.live.viewMulti}
              </button>
            </div>
          </div>
        </div>

        {/* body — Single: the active facet; Multi: Transcript | Slides | Report side by side
            with drag-resize gutters. Columns keep min-widths and the ROW scrolls horizontally
            instead of squishing; the live audio + karaoke keep running through it all. */}
        <div
          className={`atscroll flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 pb-4 pt-2 ${
            view === 'multi' ? 'bg-desktop' : ''
          }`}
        >
          {(view === 'multi' ? multiFacets.has('transcript') : facet === 'transcript') && (
            <div
              data-facet="transcript"
              style={view === 'multi' ? { flex: `${colFlex.transcript} 1 0px` } : undefined}
              className="flex min-w-[340px] flex-1 flex-col gap-1.5 overflow-hidden"
            >
              <PaneHeader
                label={dict.live.transcript}
                right={
                  <span className="call-muted flex items-center gap-1.5 text-[11px]">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-live"
                      style={{ animation: 'atpulse 2s ease-in-out infinite' }}
                    />
                    <span className="font-semibold text-live">{dict.live.liveBadge}</span> ·{' '}
                    {dict.live.karaokeTag}
                  </span>
                }
              />
              <PaneCard>
                <div
                  data-ask="1"
                  className="atscroll relative min-h-0 flex-1 overflow-y-auto px-6 pb-32 pt-4"
                  onMouseUp={onTextSelect}
                  onScroll={() => selection && setSelection(null)}
                >
                  {phase === 'playing' && words.length === 0 && (
                    <div className="pt-16 text-center text-sm text-ink-faint" dir="rtl">
                      ממתינים לכתוביות החיות… <span className="opacity-70">(התמלול מגיע בהשהיה קצרה)</span>
                    </div>
                  )}
                  <TranscriptBody
                    transcript={transcript}
                    activeIndex={activeIndex}
                    autoScroll={autoScroll}
                    onWordClick={seek}
                    karaoke
                    followLabel={dict.live.backToLive}
                  />
                </div>
              </PaneCard>
            </div>
          )}
          {view === 'multi' && multiFacets.has('transcript') && multiFacets.has('slides') && facetDivider}
          {(view === 'multi' ? multiFacets.has('slides') : facet === 'slides') && (
            <SlidesPane
              quarter={quarter}
              style={view === 'multi' ? { flex: `${colFlex.slides} 1 0px` } : undefined}
            />
          )}
          {view === 'multi' &&
            multiFacets.has('report') &&
            (multiFacets.has('slides') || multiFacets.has('transcript')) &&
            facetDivider}
          {(view === 'multi' ? multiFacets.has('report') : facet === 'report') && (
            <ReportPane
              companyId={companyId}
              quarter={quarter}
              onAskSelection={onReportAsk}
              onSnip={onReportSnip}
              onSnipError={(reason) =>
                setToast({ text: reason === 'toolarge' ? dict.chat.snipTooBig : dict.chat.snipFailed })
              }
              style={view === 'multi' ? { flex: `${colFlex.report} 1 0px` } : undefined}
            />
          )}
        </div>

        {/* Pinge/unification: pending PDF ask (text-mark or snip made with the chat closed) */}
        {pdfPending && (
          <div
            style={{
              position: 'fixed',
              top: pdfPending.anchor.top,
              left: pdfPending.anchor.left,
              transform: 'translate(-50%, -120%)',
            }}
            className="z-50 flex items-center rounded-full bg-player px-1 py-1 shadow-player"
          >
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                firePdfPending()
              }}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-player-ink transition-colors hover:bg-white/15"
            >
              <SparkleIcon size={14} />
              {dict.live.askAtlas}
            </button>
          </div>
        )}

        {selection && (
          <div
            style={{
              position: 'fixed',
              top: selection.top,
              left: selection.left,
              transform: 'translate(-50%, -120%)',
            }}
            className="z-50 flex items-center gap-0.5 rounded-full bg-player px-1 py-1 shadow-player"
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                void saveSelection(selection)
                setSelection(null)
              }}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-player-ink transition-colors hover:bg-white/15"
            >
              <QuoteIcon size={13} />
              {dict.live.saveQuote}
            </button>
            <span className="h-4 w-px bg-white/15" />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                shareSelection(selection.text)
                setSelection(null)
              }}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-player-ink transition-colors hover:bg-white/15"
            >
              <ShareIcon size={13} />
              {dict.common.share}
            </button>
            <span className="h-4 w-px bg-white/15" />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setChat((c) => ({
                  open: true,
                  seed: selection.text,
                  nonce: c.nonce + 1,
                  docRef: null,
                  snip: null,
                }))
                setSelection(null)
              }}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-player-ink transition-colors hover:bg-white/15"
            >
              <SparkleIcon size={14} />
              {dict.live.askAboutQuote}
            </button>
          </div>
        )}
        {toast && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center">
            <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-white shadow-popover">
              {toast.text}
              {toast.action && (
                <Link
                  href={toast.action.href}
                  className="flex items-center gap-0.5 text-white/80 underline-offset-2 transition-colors hover:text-white hover:underline"
                >
                  {toast.action.label}
                  <ChevronRightIcon size={13} className="rtl:rotate-180" />
                </Link>
              )}
            </span>
          </div>
        )}

        {/* the audio bar (in-view, on the live page; the global bar takes over once you navigate away) */}
        <MediaPlayer
          logoUrl={logoUrl}
          title={companyName}
          subtitle={quarter}
          chapter={over ? undefined : 'Live session'}
          currentTime={playingRel}
          duration={broadcastEdge}
          playing={phase === 'playing' && !paused}
          isLive={!over}
          onGoLive={goLive}
          volume={volume}
          onPlayPause={playPause}
          onSeek={seek}
          onSkip={(d) => seek(playingRel + d)}
          onVolumeChange={setVolume}
          onClose={() => router.push('/app/home')}
        />

        {/* buffering / join overlay — the design's live-buffer canvas (design lines 392-401).
            top-[58px] tracks the identity header's h-[58px] above — the two must move together,
            or a strip of the facet-control row shows above the overlay. */}
        {phase !== 'playing' && (
          <div className="call-bg absolute inset-x-0 bottom-0 top-[58px] z-40 overflow-hidden">
            {/* the countdown lives INSIDE the canvas ring (EST. LIVE IN mm:ss) — keyed by the
                first real remaining so the ring starts from truth, then self-ticks in sync */}
            <AnimCanvas
              key={ringSecs ?? 'ring-init'}
              mode="buffer"
              secs={ringSecs ?? delaySec}
              /* Harvey call frame is light — dark ink numbers on the ring */
              ink="dark"
              fill
              className="absolute inset-0 block h-full w-full"
            />
            {/* founder-reference gate (Countdown Animation): ring + explainer + button only —
                the identity already lives in the header; non-buffering phases keep their status */}
            <div className="absolute inset-x-0 bottom-[104px] flex flex-col items-center gap-4 px-10">
              {phase !== 'buffering' && (
                <>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-live"
                      style={{ animation: 'atpulse 2s ease-in-out infinite' }}
                    />
                    <span className="text-2xs font-bold tracking-wide text-live">
                      {over ? 'הסתיים' : dict.live.liveBadge}
                    </span>
                  </span>
                  <h2 className="call-ink text-lg font-bold">
                    <span dir="auto">{companyName} — שיחת משקיעים</span>
                  </h2>
                  <p className="call-muted max-w-[440px] text-center text-[12.5px] leading-[1.65]">
                    {overlayMsg}
                  </p>
                </>
              )}
              <p className="call-faint max-w-[440px] text-center text-[11.5px] leading-[1.65]">
                {dict.live.bufferExplainer}
              </p>
              <button
                type="button"
                onClick={join}
                disabled={phase !== 'ready'}
                className="call-hair call-ink flex items-center gap-2 rounded-pill border px-5 py-2 text-[12.5px] font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
              >
                <PlayIcon size={14} />
                {dict.live.enterLiveNow}
              </button>
            </div>
          </div>
        )}
      </div>
      {chat.open && (
        <TranscriptChatPanel
          companyId={companyId}
          transcriptId={undefined}
          liveContext={liveCaptionsText}
          quote={chat.seed}
          seedNonce={chat.nonce}
          docRef={chat.docRef}
          snip={chat.snip}
          snipAvailable={view === 'multi' ? multiFacets.has('report') : facet === 'report'}
          onClose={() => setChat((c) => ({ ...c, open: false, docRef: null, snip: null }))}
        />
      )}
    </div>
  )
}
