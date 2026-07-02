'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Logo } from '@/components/ds/Logo'
import { Tabs } from '@/components/ds/Tabs'
import { IconButton } from '@/components/ds/IconButton'
import {
  CloseIcon,
  SyncIcon,
  PlayIcon,
  QuoteIcon,
  ShareIcon,
  SparkleIcon,
  ChevronRightIcon,
} from '@/components/ds/icons'
import { TranscriptBody } from './TranscriptBody'
import { TranscriptChatPanel } from './TranscriptChatPanel'
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

  // UI-only local state (selection, chat, toast, autoScroll) stays in the view.
  const [autoScroll, setAutoScroll] = useState(true)
  const [selection, setSelection] = useState<{
    text: string
    top: number
    left: number
    speaker: string | null
    segmentId: string | null
  } | null>(null)
  const [chat, setChat] = useState<{ open: boolean; seed: string; nonce: number }>({
    open: false,
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
      setChat((c) => ({ ...c, seed: text, nonce: c.nonce + 1 }))
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

  const overlayMsg =
    phase === 'connecting'
      ? 'מתחבר לשידור…'
      : phase === 'waiting'
        ? 'ממתין לתחילת השיחה…'
        : phase === 'buffering'
          ? dict.live.buffering.replace('{min}', String(Math.round(delaySec / 60)))
          : 'השידור זמין — הצטרפו לצפייה'

  const liveTabs = [
    { key: 'overview', label: dict.live.backToOverview },
    { key: 'transcript', label: dict.live.transcript },
    { key: 'slides', label: dict.live.slides },
    { key: 'report', label: dict.live.report },
  ]

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* header — same as the finished-transcript page */}
        <header className="flex items-center justify-between gap-3 border-b border-hairline px-6 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Logo src={logoUrl} name={companyName} size={32} />
            <span className="truncate font-bold text-ink">
              {companyName} — {quarter}
            </span>
            <span className="shrink-0 text-sm text-ink-faint">
              {formatDate(new Date().toISOString(), locale)}
            </span>
            {phase === 'playing' && !over && (
              <span
                className="shrink-0 whitespace-nowrap rounded-full bg-subtle px-2 py-0.5 text-2xs font-medium text-ink-muted tabular-nums"
                dir="ltr"
              >
                -{fmt(behind)} {dict.live.behindLive}
              </span>
            )}
          </div>
          {/* top-right: LIVE pill through the whole live + drain window; once the drain is over the badge
            drops (the view becomes a finished recording; the "ended / AI processing" note lives in the card). */}
          <div className="flex shrink-0 items-center gap-3">
            {!over && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-live/10 px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
                <span className="text-2xs font-bold tracking-wide text-live">{dict.live.liveBadge}</span>
              </span>
            )}
            <IconButton label={dict.common.close} size={30} onClick={() => router.push('/app/home')}>
              <CloseIcon size={17} />
            </IconButton>
          </div>
        </header>

        {/* tabs */}
        <div className="px-6">
          <Tabs activeKey="transcript" onChange={onTab} items={liveTabs} />
        </div>

        {/* sub-toolbar */}
        <div className="flex items-center justify-between px-6 py-2">
          <div className="flex items-center gap-0.5">
            <IconButton
              label={dict.live.autoScroll}
              active={autoScroll}
              size={30}
              onClick={() => setAutoScroll((v) => !v)}
            >
              <SyncIcon size={16} />
            </IconButton>
            <IconButton
              label={dict.live.askAboutQuote}
              size={30}
              onClick={() => setChat((c) => ({ open: true, seed: '', nonce: c.nonce + 1 }))}
            >
              <SparkleIcon size={16} />
            </IconButton>
          </div>
        </div>

        {/* transcript — the real V1 karaoke body */}
        <div
          className="app-scroll relative min-h-0 flex-1 overflow-y-auto px-6 pb-32 pt-2"
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
                setChat((c) => ({ open: true, seed: selection.text, nonce: c.nonce + 1 }))
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

        {/* buffering / join overlay */}
        {phase !== 'playing' && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-canvas/95 px-6 text-center">
            <span className="flex items-center gap-1.5 rounded-full bg-live/10 px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
              <span className="text-2xs font-bold tracking-wide text-live">
                {over ? 'הסתיים' : dict.live.liveBadge}
              </span>
            </span>
            <h2 className="text-xl font-bold text-ink">{companyName} — שיחת משקיעים</h2>
            {phase === 'buffering' && (
              <div className="text-4xl font-bold tabular-nums text-ink">{fmt(countdown)}</div>
            )}
            <p className="text-sm text-ink-muted">{overlayMsg}</p>
            <button
              type="button"
              onClick={join}
              disabled={phase !== 'ready'}
              className="flex items-center gap-2 rounded-full bg-[#C04A00] px-7 py-3 text-[15px] font-semibold text-white transition-opacity disabled:bg-subtle disabled:text-ink-faint"
            >
              <PlayIcon size={16} />
              הצטרפו לשידור החי
            </button>
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
          onClose={() => setChat((c) => ({ ...c, open: false }))}
        />
      )}
    </div>
  )
}
