'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Logo } from '@/components/ds/Logo'
import { Tabs } from '@/components/ds/Tabs'
import { IconButton } from '@/components/ds/IconButton'
import {
  SparkleIcon,
  CloseIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SyncIcon,
  RefreshIcon,
  CopyIcon,
  SearchIcon,
  QuoteIcon,
  ShareIcon,
  StarIcon,
  PlayIcon,
  PauseIcon,
} from '@/components/ds/icons'
import { TranscriptBody } from './TranscriptBody'
import { TranscriptSidePanel } from './TranscriptSidePanel'
import { TranscriptChatPanel } from './TranscriptChatPanel'
import { usePlayer, usePlayerTime } from '@/lib/player/PlayerProvider'
import { flattenWords, activeWordIndex } from '@/lib/live/syncEngine'
import { findMatches } from '@/lib/live/search'
import { createQuote } from '@/lib/api/quotes'
import { formatClock, formatDate } from '@/lib/i18n/format'
import type { LiveCall } from '@/lib/live/loadCall'

type Toast = { text: string; action?: { label: string; href: string } }

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

  // Playback is global now (Feature 4): the transcript page loads the call into the shared
  // player and reads the playhead from it, rather than owning an <audio> element. This is
  // what lets the audio keep playing while you browse/chat and return via the Return chip.
  const player = usePlayer()
  const currentTime = usePlayerTime()
  const playing = player.playing
  const isActiveCall = player.call?.id === call.id
  const effTime = isActiveCall ? currentTime : 0

  const [tab, setTab] = useState('transcript')
  const [autoScroll, setAutoScroll] = useState(true)
  const [toast, setToast] = useState<Toast | null>(null)
  const [selection, setSelection] = useState<
    { text: string; top: number; left: number; speaker: string | null; segmentId: string | null } | null
  >(null)
  const [query, setQuery] = useState('')
  const [matchPos, setMatchPos] = useState(0)
  // in-transcript side chat (Feature 6): open + the seeded quote + a nonce so re-starring re-seeds
  const [chat, setChat] = useState<{ open: boolean; seed: string; nonce: number }>({ open: false, seed: '', nonce: 0 })

  const flat = useMemo(() => flattenWords(call.transcript), [call.transcript])
  const activeIndex = useMemo(() => activeWordIndex(flat, effTime), [flat, effTime])
  const matches = useMemo(() => findMatches(call.transcript, query), [call.transcript, query])
  const name = locale === 'en' ? call.companyNameEn ?? call.companyName : call.companyName
  const title = `${name} — ${call.quarter}`
  const activeSegmentIndex = flat[activeIndex]?.segmentIndex ?? 0
  const activeSpeaker = call.transcript.segments[activeSegmentIndex]?.speakerName ?? null

  // Load this call into the global player (once per call). No auto-play — the user presses play.
  useEffect(() => {
    if (!call.audioUrl) return
    player.load({
      id: call.id,
      companyId: call.companyId,
      title: name,
      subtitle: call.quarter,
      logoUrl: call.logoUrl,
      audioUrl: call.audioUrl,
      isLive: false,
      duration: call.transcript.durationSec || undefined,
      startAt: initialSeek,
    })
    if (initialSeek != null) player.seek(initialSeek)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.id, call.audioUrl])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  // Go-to-quote: scroll to + flash-highlight the anchored line.
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
    if (call.audioUrl) player.seek(t)
  }
  function playPause() {
    player.toggle()
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
    if (!call.companyId) return
    const tid = call.id === 'demo' ? '' : `&transcript=${encodeURIComponent(call.id)}`
    router.push(`/app/chat?company=${call.companyId}${tid}`)
  }

  async function copyAll() {
    const text = call.transcript.segments.map((s) => s.words.map((w) => w.text).join(' ')).join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setToast({ text: dict.live.copied })
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
      setToast({ text: dict.common.save })
    } catch (err) {
      setToast({ text: (err as Error).message })
    }
  }

  function selectionSpeaker(sel: Selection | null): string | null {
    let node: Node | null = sel?.anchorNode ?? null
    while (node && node.nodeType !== 1) node = node.parentNode
    const el = (node as Element | null)?.closest('[data-segment-id]') ?? null
    return el?.getAttribute('data-speaker') ?? null
  }
  function selectionSegmentId(sel: Selection | null): string | null {
    let node: Node | null = sel?.anchorNode ?? null
    while (node && node.nodeType !== 1) node = node.parentNode
    const el = (node as Element | null)?.closest('[data-segment-id]') ?? null
    return el?.getAttribute('data-segment-id') ?? null
  }

  // Selection → Save / Share (appears over a text selection).
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
      setToast({ text: dict.common.error })
      return
    }
    try {
      await createQuote({
        companyId: call.companyId,
        transcriptId: call.id === 'demo' ? null : call.id,
        text: sel.text,
        speaker: sel.speaker ?? activeSpeaker,
        quarter: call.quarter,
        startSec: effTime,
        anchor: sel.segmentId ? { segmentId: sel.segmentId, text: sel.text.slice(0, 80) } : null,
      })
      // Clickable toast → jump straight to that company's My Quotes tab (audio keeps playing).
      setToast({
        text: dict.live.quoteSaved,
        action: { label: dict.company.myQuotes, href: `/app/company/${call.companyId}?tab=quotes` },
      })
    } catch (err) {
      setToast({ text: (err as Error).message })
    }
  }

  function shareSelection(text: string) {
    const who = activeSpeaker || name
    const when = call.quarter ? `the ${call.quarter}` : 'an'
    const msg = `${who} said on ${when} investor call: "${text}"`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }

  function sharePdf() {
    if (call.id === 'demo') {
      window.print()
      return
    }
    window.open(`/print/${call.id}`, '_blank', 'noopener')
  }

  const liveTabs = [
    { key: 'overview', label: dict.live.backToOverview },
    { key: 'transcript', label: dict.live.transcript },
    { key: 'slides', label: dict.live.slides },
    { key: 'report', label: dict.live.report },
  ]

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* context panel — chapters/sections + speakers (RTL Hebrew). Hidden while the
          in-transcript chat is open, to give the transcript + chat room. */}
      {!chat.open && (
        <TranscriptSidePanel
          transcript={call.transcript}
          activeSegmentIndex={activeSegmentIndex}
          onSeek={seek}
          companyName={name}
          sub={[call.quarter, formatDate(call.date, locale)].filter(Boolean).join(' · ')}
          isLive={call.isLive}
        />
      )}

      {/* main column — header, tabs, transcript (the player is now the global docked bar) */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* header */}
        <header className="flex items-center justify-between gap-3 border-b border-hairline px-6 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Logo src={call.logoUrl} name={title} size={32} />
            <span className="truncate font-bold text-ink">{title}</span>
            <span className="shrink-0 text-sm text-ink-faint">{formatDate(call.date, locale)}</span>
            {call.isLive && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-live/10 px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
                <span className="text-2xs font-bold tracking-wide text-live">{dict.live.liveBadge}</span>
              </span>
            )}
            <IconButton label={dict.live.switchCall} size={26}>
              <ChevronDownIcon size={16} />
            </IconButton>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label={dict.live.shareTranscript} size={30} onClick={sharePdf}>
              <ShareIcon size={17} />
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
                <span className="tabular-nums text-ink-faint" dir="ltr">
                  {formatClock(effTime)}
                </span>
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
            <IconButton label={dict.live.refresh} size={30} onClick={() => router.refresh()}>
              <RefreshIcon size={16} />
            </IconButton>
            <IconButton label={dict.live.copy} size={30} onClick={copyAll}>
              <CopyIcon size={16} />
            </IconButton>
            <IconButton label={dict.company.openInChat} size={30} onClick={openInChat}>
              <SparkleIcon size={16} />
            </IconButton>
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
          className="app-scroll relative min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-2"
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
                karaoke={call.transcript.hasWordTimings && isActiveCall}
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
              <StarIcon size={13} />
              {dict.live.askAboutQuote}
            </button>
          </div>
        )}

        {/* toast — quote-saved gets a clickable "My Quotes →" jump (audio keeps playing) */}
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
      </div>

      {/* in-transcript side chat (Feature 6) — opens beside the transcript; audio keeps playing */}
      {chat.open && (
        <TranscriptChatPanel
          companyId={call.companyId}
          transcriptId={call.id === 'demo' ? undefined : call.id}
          quote={chat.seed}
          seedNonce={chat.nonce}
          onClose={() => setChat((c) => ({ ...c, open: false }))}
        />
      )}
    </div>
  )
}
