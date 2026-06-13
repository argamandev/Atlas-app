'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Logo } from '@/components/ds/Logo'
import { Tabs } from '@/components/ds/Tabs'
import { IconButton } from '@/components/ds/IconButton'
import {
  SparkleIcon,
  CloseIcon,
  ChevronDownIcon,
  SyncIcon,
  CopyIcon,
  SearchIcon,
  QuoteIcon,
  ShareIcon,
  PlayIcon,
  PauseIcon,
} from '@/components/ds/icons'
import { TranscriptBody } from './TranscriptBody'
import { MediaPlayer } from './MediaPlayer'
import { flattenWords, activeWordIndex } from '@/lib/live/syncEngine'
import { findMatches } from '@/lib/live/search'
import { LLM_TARGETS, buildLlmPrompt, transcriptToText } from '@/lib/live/llmHandoff'
import { createQuote } from '@/lib/api/quotes'
import { formatClock, formatDate } from '@/lib/i18n/format'
import type { LiveCall } from '@/lib/live/loadCall'

export function LiveTranscriptView({
  call,
  initialSeek,
  initialSegmentId,
}: {
  call: LiveCall
  initialSeek?: number
  initialSegmentId?: string
}) {
  const { dict, locale } = useI18n()
  const router = useRouter()
  const audioRef = useRef<HTMLAudioElement>(null)

  const [tab, setTab] = useState('transcript')
  const [currentTime, setCurrentTime] = useState(initialSeek ?? 0)
  const [duration, setDuration] = useState(call.transcript.durationSec || 0)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [autoScroll, setAutoScroll] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [selection, setSelection] = useState<
    { text: string; top: number; left: number; speaker: string | null; segmentId: string | null } | null
  >(null)

  const [query, setQuery] = useState('')
  const [matchPos, setMatchPos] = useState(0)
  const [llmOpen, setLlmOpen] = useState(false)

  const flat = useMemo(() => flattenWords(call.transcript), [call.transcript])
  const activeIndex = useMemo(() => activeWordIndex(flat, currentTime), [flat, currentTime])
  const matches = useMemo(() => findMatches(call.transcript, query), [call.transcript, query])
  const name = locale === 'en' ? call.companyNameEn ?? call.companyName : call.companyName
  const title = `${name} — ${call.quarter}`
  const activeSpeaker = call.transcript.segments[flat[activeIndex]?.segmentIndex ?? 0]?.speakerName ?? null

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const a = audioRef.current
      if (a) setCurrentTime(a.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  // Go-to-quote: scroll to + flash-highlight the anchored line (and seek if audio plays).
  useEffect(() => {
    if (!initialSegmentId) return
    const el = document.querySelector(`[data-segment-id="${CSS.escape(initialSegmentId)}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('quote-flash')
    const t = setTimeout(() => el.classList.remove('quote-flash'), 2000)
    return () => clearTimeout(t)
  }, [initialSegmentId])

  function seek(t: number) {
    const a = audioRef.current
    if (a) a.currentTime = t
    setCurrentTime(t)
  }
  function playPause() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) void a.play()
    else a.pause()
  }
  function skip(delta: number) {
    seek(Math.min(duration, Math.max(0, currentTime + delta)))
  }
  function changeVolume(v: number) {
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
  }

  // Tabs: "Back to Overview" routes to the company page; the rest switch in-page.
  function onTab(key: string) {
    if (key === 'overview') {
      if (call.companyId) router.push(`/app/company/${call.companyId}`)
      else router.back()
      return
    }
    setTab(key)
  }

  function openInChat() {
    if (call.companyId) router.push(`/app/chat?company=${call.companyId}`)
  }

  async function copyAll() {
    const text = call.transcript.segments.map((s) => s.words.map((w) => w.text).join(' ')).join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setToast(dict.live.copied)
    } catch {
      /* clipboard may be blocked */
    }
  }

  // Rename a speaker — persists an override on the transcript + updates that speaker's quotes.
  async function renameSpeaker(_segmentId: string, speakerId: string, oldName: string, newName: string) {
    if (call.id === 'demo') return
    try {
      await fetch(`/api/transcripts/${call.id}/speakers`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ speakerId, name: newName, oldName }),
      })
      router.refresh()
      setToast(dict.common.save)
    } catch (err) {
      setToast((err as Error).message)
    }
  }

  // The speaker of the paragraph a DOM selection sits in (or null if outside the transcript).
  function selectionSpeaker(sel: Selection | null): string | null {
    let node: Node | null = sel?.anchorNode ?? null
    while (node && node.nodeType !== 1) node = node.parentNode
    const el = (node as Element | null)?.closest('[data-segment-id]') ?? null
    return el?.getAttribute('data-speaker') ?? null
  }

  // The id of the segment a DOM selection sits in — the go-to-quote line anchor.
  function selectionSegmentId(sel: Selection | null): string | null {
    let node: Node | null = sel?.anchorNode ?? null
    while (node && node.nodeType !== 1) node = node.parentNode
    const el = (node as Element | null)?.closest('[data-segment-id]') ?? null
    return el?.getAttribute('data-segment-id') ?? null
  }

  // Selection → Save / Share (brief: "after a quote is marked").
  function onTextSelect() {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    const text = sel?.toString().trim() ?? ''
    if (!text || !sel || sel.rangeCount === 0) {
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
    if (!sel.text) return
    if (!call.companyId) {
      setToast(dict.common.error)
      return
    }
    try {
      await createQuote({
        companyId: call.companyId,
        transcriptId: call.id === 'demo' ? null : call.id,
        text: sel.text,
        speaker: sel.speaker ?? activeSpeaker,
        quarter: call.quarter,
        startSec: currentTime,
        anchor: sel.segmentId ? { segmentId: sel.segmentId, text: sel.text.slice(0, 80) } : null,
      })
      setToast(dict.live.quoteSaved)
    } catch (err) {
      setToast((err as Error).message)
    }
  }

  function shareSelection(text: string) {
    const who = activeSpeaker || name
    const when = call.quarter ? `the ${call.quarter}` : 'an'
    const msg = `${who} said on ${when} investor call: "${text}"`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }

  // Open with LLM (#3) — copy a framed transcript prompt and open the chosen LLM in a tab.
  async function openWithLlm(target: (typeof LLM_TARGETS)[number]) {
    setLlmOpen(false)
    const text = buildLlmPrompt(name, call.quarter, transcriptToText(call.transcript))
    try {
      await navigator.clipboard.writeText(text)
      setToast(`${dict.live.llmCopied} ${target.label}`)
    } catch {
      /* clipboard blocked — still open the LLM */
    }
    window.open(target.url, '_blank', 'noopener')
  }

  const liveTabs = [
    { key: 'overview', label: dict.live.backToOverview },
    { key: 'transcript', label: dict.live.transcript },
    { key: 'slides', label: dict.live.slides },
    { key: 'report', label: dict.live.report },
  ]

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      {/* header */}
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-6 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo src={call.logoUrl} name={title} size={32} />
          <span className="truncate font-bold text-ink">{title}</span>
          <span className="shrink-0 text-sm text-ink-faint">{formatDate(call.date, locale)}</span>
          {call.isLive && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-live/10 px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-live" />
              <span className="text-2xs font-bold tracking-wide text-live">{dict.live.liveBadge}</span>
            </span>
          )}
          <IconButton label={dict.live.switchCall} size={26}>
            <ChevronDownIcon size={16} />
          </IconButton>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label={dict.company.openInChat} size={30} onClick={openInChat}>
            <SparkleIcon size={17} />
          </IconButton>
          <IconButton label={dict.common.close} size={30} onClick={() => router.back()}>
            <CloseIcon size={17} />
          </IconButton>
        </div>
      </header>

      {/* tabs + inline audio chip */}
      <div className="px-6">
        <Tabs
          activeKey={tab}
          onChange={onTab}
          items={liveTabs}
          trailing={
            <button
              type="button"
              onClick={playPause}
              disabled={!call.audioUrl}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
            >
              {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
              <span>{playing ? dict.live.pauseAudio : dict.live.playAudio}</span>
              <span className="tabular-nums text-ink-faint" dir="ltr">{formatClock(currentTime)}</span>
            </button>
          }
        />
      </div>

      {/* sub-toolbar */}
      <div className="flex items-center justify-between px-6 py-2">
        <div className="flex items-center gap-0.5">
          <IconButton label={dict.live.autoScroll} active={autoScroll} size={30} onClick={() => setAutoScroll((v) => !v)}>
            <SyncIcon size={16} />
          </IconButton>
          <IconButton label={dict.live.copy} size={30} onClick={copyAll}>
            <CopyIcon size={16} />
          </IconButton>
          <div className="relative">
            <IconButton label={dict.live.openWithLlm} size={30} onClick={() => setLlmOpen((v) => !v)}>
              <SparkleIcon size={16} />
            </IconButton>
            {llmOpen && (
              <div className="absolute z-50 mt-1 w-40 overflow-hidden rounded-lg bg-canvas p-1 shadow-popover">
                {LLM_TARGETS.map((tg) => (
                  <button
                    key={tg.key}
                    type="button"
                    onClick={() => void openWithLlm(tg)}
                    className="block w-full rounded-md px-2.5 py-1.5 text-start text-sm text-ink hover:bg-subtle"
                  >
                    {tg.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <SearchIcon size={15} className="text-ink-faint" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setMatchPos(0)
            }}
            placeholder={dict.live.searchTranscript}
            className="w-44 bg-transparent text-xs text-ink outline-none placeholder:text-ink-faint"
          />
          {query && (
            <span className="flex items-center gap-1 text-2xs text-ink-faint">
              <span className="tabular-nums">
                {matches.length ? matchPos + 1 : 0}/{matches.length}
              </span>
              <button
                type="button"
                disabled={!matches.length}
                onClick={() => setMatchPos((p) => (p - 1 + matches.length) % matches.length)}
                className="px-1 hover:text-ink disabled:opacity-40"
              >
                ‹
              </button>
              <button
                type="button"
                disabled={!matches.length}
                onClick={() => setMatchPos((p) => (p + 1) % matches.length)}
                className="px-1 hover:text-ink disabled:opacity-40"
              >
                ›
              </button>
            </span>
          )}
        </div>
      </div>

      {/* body */}
      <div
        className="app-scroll relative min-h-0 flex-1 overflow-y-auto px-6 pb-32 pt-2"
        onMouseUp={tab === 'transcript' ? onTextSelect : undefined}
        onScroll={() => selection && setSelection(null)}
      >
        {tab === 'transcript' ? (
          <>
            {!call.transcript.hasWordTimings && (
              <p className="mb-4 rounded-md bg-subtle px-3 py-2 text-xs text-ink-muted">{dict.live.noWordTimings}</p>
            )}
            <TranscriptBody
              transcript={call.transcript}
              activeIndex={activeIndex}
              autoScroll={autoScroll}
              onWordClick={seek}
              karaoke={call.transcript.hasWordTimings}
              onRenameSpeaker={renameSpeaker}
              searchMatches={matches}
              activeMatch={matches[matchPos] ?? -1}
            />
          </>
        ) : (
          <div className="grid h-full place-items-center text-sm text-ink-faint">{dict.common.comingSoon}</div>
        )}
      </div>

      {/* selection toolbar — Save / Share (appears over a text selection) */}
      {selection && (
        <div
          style={{ position: 'fixed', top: selection.top, left: selection.left, transform: 'translate(-50%, -120%)' }}
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
        </div>
      )}

      {/* hidden audio element drives the sync */}
      {call.audioUrl && (
        <audio
          ref={audioRef}
          src={call.audioUrl}
          preload="metadata"
          onLoadedMetadata={(e) => {
            e.currentTarget.volume = volume
            if (initialSeek) e.currentTarget.currentTime = initialSeek
            setDuration(e.currentTarget.duration || duration)
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => !playing && setCurrentTime(e.currentTarget.currentTime)}
        />
      )}

      {call.audioUrl && (
        <MediaPlayer
          logoUrl={call.logoUrl}
          title={name}
          subtitle={call.quarter}
          chapter={call.isLive ? 'Live session' : undefined}
          currentTime={currentTime}
          duration={duration}
          playing={playing}
          isLive={call.isLive}
          volume={volume}
          onPlayPause={playPause}
          onSeek={seek}
          onSkip={skip}
          onVolumeChange={changeVolume}
          onClose={() => router.back()}
        />
      )}

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center">
          <span className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-white shadow-popover">{toast}</span>
        </div>
      )}
    </div>
  )
}
