'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyTextIcon,
  SearchIcon,
  QuoteIcon,
  ShareIcon,
  PencilIcon,
  PlayIcon,
  PauseIcon,
  PlusIcon,
  TranscriptIcon,
  SlidesIcon,
  FileIcon,
} from '@/components/ds/icons'
import { PaneHeader, SlidesPane, ReportPane, useFacetColumns, type Facet } from './FacetPanes'
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
  // remember the last playhead so the "Open audio bar" chip can resume where the user closed it
  const lastPosRef = useRef(0)
  useEffect(() => {
    if (isActiveCall) lastPosRef.current = currentTime
  }, [isActiveCall, currentTime])

  // Tell the player this call is being displayed (URL-independent) so the Return-to-transcript chip
  // hides while we're on it — including the inline live→finished swap, where the URL stays /app/live/live.
  useEffect(() => {
    player.setViewing(call.id)
    return () => player.setViewing(null)
  }, [call.id, player.setViewing])

  const [tab, setTab] = useState('transcript')
  // V2 (Claude Design): call view is dark-first with a Light toggle; Single|Multi facets.
  const [callTheme, setCallTheme] = useState<'dark' | 'light'>('dark')
  const [view, setView] = useState<'single' | 'multi'>('single')
  // Multi view composes facets: ALL chips are ×-removable (founder round-3: transcript too —
  // audio keeps playing without it); the last visible facet can't be removed.
  const [multiFacets, setMultiFacets] = useState<Set<Facet>>(
    () => new Set<Facet>(['transcript', 'slides', 'report'])
  )
  const { colFlex, facetDivider } = useFacetColumns()
  const [autoScroll] = useState(true) // always on; the scroll-pause + "back to current" chip manages it
  const [panelCollapsed, setPanelCollapsed] = useState(false) // user's manual minimize of the speaker panel
  const [toast, setToast] = useState<Toast | null>(null)
  const [selection, setSelection] = useState<{
    text: string
    top: number
    left: number
    speaker: string | null
    segmentId: string | null
    fromWord?: number
    toWord?: number
  } | null>(null)
  const [query, setQuery] = useState('')
  const [matchPos, setMatchPos] = useState(0)
  // in-transcript side chat (Feature 6): open + the seeded quote + a nonce so re-starring re-seeds
  // docRef (multiview): set only when a report-PDF selection seeded the chat, so /api/chat can
  // ground on document + page text; any transcript highlight clears it back to null.
  const [chat, setChat] = useState<{
    open: boolean
    seed: string
    nonce: number
    docRef: { documentId: string; page: number | null } | null
  }>({
    open: false,
    seed: '',
    nonce: 0,
    docRef: null,
  })
  // side chat open → tell the global docked bar to narrow to its left (so offline = live)
  useEffect(() => {
    player.setChatOpen(chat.open)
    return () => player.setChatOpen(false)
  }, [chat.open, player.setChatOpen])
  // diarization edit mode (Feature 1) — finished, real transcripts only
  const [editMode, setEditMode] = useState(false)
  const canEdit = call.companyId != null && call.id !== 'demo'

  const flat = useMemo(() => flattenWords(call.transcript), [call.transcript])
  const activeIndex = useMemo(() => activeWordIndex(flat, effTime), [flat, effTime])
  const matches = useMemo(() => findMatches(call.transcript, query), [call.transcript, query])
  const name = locale === 'en' ? (call.companyNameEn ?? call.companyName) : call.companyName
  const title = `${name} — ${call.quarter}`
  const activeSegmentIndex = flat[activeIndex]?.segmentIndex ?? 0
  const activeSpeaker = call.transcript.segments[activeSegmentIndex]?.speakerName ?? null
  // unique speakers (id → label) for the reassign menu (Feature 1)
  const speakerList = useMemo(() => {
    const seen = new Map<string, string>()
    for (const s of call.transcript.segments) if (!seen.has(s.speakerId)) seen.set(s.speakerId, s.speakerName)
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }))
  }, [call.transcript])

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

  // The global word-index range a selection covers (Feature 1 reassignment).
  function selectedWordRange(sel: Selection | null): { from: number; to: number } | null {
    if (!sel || sel.rangeCount === 0 || typeof document === 'undefined') return null
    let from = Infinity
    let to = -Infinity
    document.querySelectorAll('[data-wi]').forEach((el) => {
      if (sel.containsNode(el, true)) {
        const wi = Number((el as HTMLElement).dataset.wi)
        if (Number.isInteger(wi)) {
          from = Math.min(from, wi)
          to = Math.max(to, wi)
        }
      }
    })
    return Number.isFinite(from) ? { from, to } : null
  }

  // Selection → Save / Share / Star, or (in edit mode) reassign the run to a speaker.
  function onTextSelect() {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    const text = sel?.toString().trim() ?? ''
    if (!text || !sel || sel.rangeCount === 0) {
      setSelection(null)
      return
    }
    // If the side chat is already open, drop the highlight straight into the chat input as a
    // reference (no popup, no extra clicks) — Claude-style. Edit mode still uses the popup.
    if (chat.open && !editMode) {
      setChat((c) => ({ ...c, seed: text, nonce: c.nonce + 1, docRef: null }))
      setSelection(null)
      return
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      setSelection(null)
      return
    }
    const range = editMode ? selectedWordRange(sel) : null
    setSelection({
      text,
      top: rect.top,
      left: rect.left + rect.width / 2,
      speaker: selectionSpeaker(sel),
      segmentId: selectionSegmentId(sel),
      fromWord: range?.from,
      toWord: range?.to,
    })
  }

  // A passage marked inside the report PDF → open the side chat seeded with it (same UX as
  // transcript highlights), tagged with document + page so /api/chat grounds on the page text.
  function onReportAsk(text: string, page: number | null, documentId: string) {
    setChat((c) => ({ open: true, seed: text, nonce: c.nonce + 1, docRef: { documentId, page } }))
  }

  // Reassign the selected run to a speaker → recompute + persist the overlay → reload (Feature 1).
  async function assignSpeaker(speakerId: string) {
    if (!selection || selection.fromWord == null || selection.toWord == null) return
    const { fromWord, toWord } = selection
    setSelection(null)
    try {
      const res = await fetch(`/api/transcripts/${call.id}/diarization`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fromWord, toWord, speakerId }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'failed')
      router.refresh()
      setToast({ text: dict.common.save })
    } catch (err) {
      setToast({ text: (err as Error).message })
    }
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

  const facetTabs = [
    { key: 'transcript', label: dict.live.transcript },
    { key: 'slides', label: dict.live.slides },
    { key: 'report', label: dict.live.report },
  ]

  const segTogBtn = (on: boolean) =>
    `rounded-pill px-3 py-[5px] text-xs font-medium transition-colors ${
      on ? 'bg-ink text-white dark-toggle-on' : 'call-muted hover:call-ink'
    }`

  return (
    <div data-call-theme={callTheme} className="flex h-full min-h-0 flex-1">
      {/* context panel — chapters/sections + speakers (RTL Hebrew). Minimizes to a thin rail while the
          in-transcript chat is open (one click from returning), instead of unmounting. */}
      <TranscriptSidePanel
        transcript={call.transcript}
        activeSegmentIndex={activeSegmentIndex}
        onSeek={seek}
        companyName={name}
        sub={[call.quarter, formatDate(call.date, locale)].filter(Boolean).join(' · ')}
        isLive={call.isLive}
        // stays open when the chat dock slides in (design keeps it; collapsing it too made
        // the whole frame lurch left when Ask Atlas opened)
        collapsed={panelCollapsed}
        onToggleCollapsed={() => setPanelCollapsed((v) => !v)}
      />

      {/* main column — identity header, facet controls, transcript (design lines 251-296) */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* identity header (63px): tile · title · mono date — Dark/Light · Ask Atlas · close */}
        <header className="call-hair flex h-[63px] flex-none items-center justify-between gap-3 border-b px-6">
          <div className="flex min-w-0 items-center gap-2.5" dir="ltr">
            <Logo src={call.logoUrl} name={title} size={30} className="rounded-[7px]" />
            <span className="call-ink max-w-[460px] truncate text-[13.5px] font-semibold">
              <span dir="auto">{title}</span>
            </span>
            <span className="call-muted flex-none font-mono-num text-[11.5px]" dir="ltr">
              {formatDate(call.date, locale)}
            </span>
            {call.isLive && (
              <span className="flex flex-none items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-live"
                  style={{ animation: 'atpulse 2s ease-in-out infinite' }}
                />
                <span className="text-2xs font-bold tracking-wide text-live">{dict.live.liveBadge}</span>
              </span>
            )}
          </div>
          <div className="flex flex-none items-center gap-3.5">
            <div className="call-track-bg flex rounded-pill p-[3px]">
              <button
                type="button"
                onClick={() => setCallTheme('dark')}
                className={`rounded-pill px-3 py-[5px] text-xs font-medium transition-colors ${
                  callTheme === 'dark' ? 'call-bg call-ink' : 'call-muted'
                }`}
              >
                Dark
              </button>
              <button
                type="button"
                onClick={() => setCallTheme('light')}
                className={`rounded-pill px-3 py-[5px] text-xs font-medium transition-colors ${
                  callTheme === 'light' ? 'call-card-bg call-ink' : 'call-muted'
                }`}
              >
                Light
              </button>
            </div>
            <button
              type="button"
              onClick={() => setChat((c) => ({ open: true, seed: '', nonce: c.nonce + 1, docRef: null }))}
              className="call-hair call-ink flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] transition-opacity hover:opacity-80"
            >
              <SparkleIcon size={14} strokeWidth={1.6} />
              {dict.live.askAtlas}
            </button>
            <button
              type="button"
              title={dict.common.close}
              onClick={() => router.back()}
              className="call-muted transition-colors hover:call-ink"
            >
              <CloseIcon size={17} />
            </button>
          </div>
        </header>

        {/* facet controls: Back to Overview | Transcript · Slides · Report — View Single|Multi */}
        <div className="call-hair flex flex-none items-center justify-between border-b px-6">
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
            {/* facet chips (design lines 407-415): icon + label; in Multi, Slides/Report are
                ×-removable and +-re-addable; Transcript is pinned. */}
            <div className="flex items-center gap-2 py-2">
              {facetTabs.map((ft) => {
                const key = ft.key as 'transcript' | 'slides' | 'report'
                const Icon = key === 'transcript' ? TranscriptIcon : key === 'slides' ? SlidesIcon : FileIcon
                const active = view === 'multi' ? multiFacets.has(key) : tab === key
                const removable = view === 'multi'
                return (
                  <button
                    key={ft.key}
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
                        setTab(key)
                      }
                    }}
                    className={`flex items-center gap-[7px] rounded-full px-[11px] py-[5px] text-[12.5px] transition-colors ${
                      active
                        ? 'call-raised-bg call-ink border border-transparent font-semibold'
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
            <button
              type="button"
              onClick={playPause}
              disabled={!call.audioUrl}
              className="call-muted flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:call-ink disabled:opacity-40"
            >
              {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
              <span className="font-mono-num tabular-nums" dir="ltr">
                {formatClock(effTime)}
              </span>
            </button>
            <span className="call-muted text-[11.5px]">{dict.live.viewLabel}</span>
            <div className="call-track-bg flex rounded-pill p-[3px]">
              <button
                type="button"
                onClick={() => setView('single')}
                className={`rounded-pill px-3 py-[5px] text-xs font-medium transition-colors ${
                  view === 'single' ? 'call-bg call-ink' : 'call-muted'
                }`}
              >
                {dict.live.viewSingle}
              </button>
              <button
                type="button"
                onClick={() => setView('multi')}
                className={`rounded-pill px-3 py-[5px] text-xs font-medium transition-colors ${
                  view === 'multi' ? 'call-bg call-ink' : 'call-muted'
                }`}
              >
                {dict.live.viewMulti}
              </button>
            </div>
          </div>
        </div>

        {/* sub-toolbar (design lines 429-440): icon row over a hairline */}
        <div className="call-hair flex items-center justify-between border-b px-[22px] py-[7px]">
          <div className="flex items-center gap-0.5">
            <IconButton label={dict.live.copy} size={30} onClick={copyAll}>
              <CopyTextIcon size={16} />
            </IconButton>
            <IconButton
              label={dict.company.openInChat}
              size={30}
              onClick={() => setChat((c) => ({ open: true, seed: '', nonce: c.nonce + 1, docRef: null }))}
            >
              <SparkleIcon size={16} />
            </IconButton>
            {canEdit && (
              <IconButton
                label={dict.live.editSpeakers}
                active={editMode}
                size={30}
                onClick={() => setEditMode((v) => !v)}
              >
                <PencilIcon size={16} />
              </IconButton>
            )}
            {editMode && (
              <span className="ms-1 hidden text-2xs text-ink-faint sm:inline">
                {dict.live.editSpeakersHint}
              </span>
            )}
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

        {/* body — Single: the active facet; Multi: Transcript | Slides | Report side by side.
            Design line 443: columns keep min-widths and the ROW scrolls horizontally instead
            of squishing — this is what keeps text from reflowing when the chat dock opens. */}
        <div className="atscroll flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
          {(view === 'multi' ? multiFacets.has('transcript') : tab === 'transcript') && (
            <div
              data-facet="transcript"
              style={view === 'multi' ? { flex: `${colFlex.transcript} 1 0px` } : undefined}
              className="flex min-w-[340px] flex-1 flex-col overflow-hidden"
            >
              <PaneHeader
                label={dict.live.transcript}
                right={
                  call.isLive ? (
                    <span className="call-muted flex items-center gap-1.5 text-[11px]">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-live"
                        style={{ animation: 'atpulse 2s ease-in-out infinite' }}
                      />
                      <span className="font-semibold text-live">{dict.live.liveBadge}</span> ·{' '}
                      {dict.live.karaokeTag}
                    </span>
                  ) : undefined
                }
              />
              <div
                className="atscroll relative min-h-0 flex-1 overflow-y-auto px-6 pb-28 pt-4"
                data-ask="1"
                onMouseUp={onTextSelect}
                onScroll={() => selection && setSelection(null)}
              >
                {!call.transcript.hasWordTimings && (
                  <p className="call-panel-bg call-muted mb-4 rounded-md px-3 py-2 text-xs">
                    {dict.live.noWordTimings}
                  </p>
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
                  followLabel={dict.live.backToPlaying}
                />
              </div>
            </div>
          )}
          {view === 'multi' && multiFacets.has('transcript') && multiFacets.has('slides') && facetDivider}
          {(view === 'multi' ? multiFacets.has('slides') : tab === 'slides') && (
            <SlidesPane
              quarter={call.quarter}
              style={view === 'multi' ? { flex: `${colFlex.slides} 1 0px` } : undefined}
            />
          )}
          {view === 'multi' &&
            multiFacets.has('report') &&
            (multiFacets.has('slides') || multiFacets.has('transcript')) &&
            facetDivider}
          {(view === 'multi' ? multiFacets.has('report') : tab === 'report') && (
            <ReportPane
              companyId={call.companyId}
              quarter={call.quarter}
              onAskSelection={onReportAsk}
              style={view === 'multi' ? { flex: `${colFlex.report} 1 0px` } : undefined}
            />
          )}
        </div>

        {/* selection toolbar — reassign-to-speaker (edit mode) OR Save / Share / Star */}
        {selection &&
          (editMode && selection.fromWord != null ? (
            <div
              style={{
                position: 'fixed',
                top: selection.top,
                left: selection.left,
                transform: 'translate(-50%, -120%)',
              }}
              className="z-50 flex max-w-[320px] flex-wrap items-center gap-1 rounded-2xl bg-player px-2 py-1.5 shadow-player"
            >
              <span className="px-1 text-2xs font-medium text-player-faint">{dict.live.assignToSpeaker}</span>
              {speakerList.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void assignSpeaker(s.id)}
                  className="rounded-full px-2.5 py-1 text-xs text-player-ink transition-colors hover:bg-white/15"
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : (
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
                  setChat((c) => ({ open: true, seed: selection.text, nonce: c.nonce + 1, docRef: null }))
                  setSelection(null)
                }}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-player-ink transition-colors hover:bg-white/15"
              >
                <SparkleIcon size={14} />
                {dict.live.askAboutQuote}
              </button>
            </div>
          ))}

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

        {/* "Open audio bar" — reopen the docked bar after ✕, resuming where you left off */}
        {call.audioUrl && !isActiveCall && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center">
            <button
              type="button"
              onClick={() =>
                player.load({
                  id: call.id,
                  companyId: call.companyId,
                  title: name,
                  subtitle: call.quarter,
                  logoUrl: call.logoUrl,
                  audioUrl: call.audioUrl!,
                  isLive: false,
                  duration: call.transcript.durationSec || undefined,
                  startAt: lastPosRef.current,
                })
              }
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-popover transition-opacity hover:opacity-90"
            >
              <PlayIcon size={13} /> {dict.live.openAudioBar}
            </button>
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
          docRef={chat.docRef}
          onClose={() => setChat((c) => ({ ...c, open: false }))}
        />
      )}
    </div>
  )
}
