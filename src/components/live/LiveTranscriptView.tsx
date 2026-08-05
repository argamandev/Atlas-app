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
import { PaneHeader, PaneCard, SlidesPane, ReportPane, useFacetColumns, type Facet } from './FacetPanes'
import { TranscriptBody } from './TranscriptBody'
import { TranscriptSidePanel } from './TranscriptSidePanel'
import { TranscriptChatPanel } from './TranscriptChatPanel'
import { usePlayer, usePlayerTimeDerived, useViewingCall } from '@/lib/player/PlayerProvider'
import { flattenWords, activeWordIndex } from '@/lib/live/syncEngine'
import { findMatches } from '@/lib/live/search'
import { createQuote } from '@/lib/api/quotes'
import type { ChatSnip } from '@/lib/api/chat'
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
  const playing = player.playing
  const isActiveCall = player.call?.id === call.id
  // Derived-value subscriptions, NOT the raw 60fps clock: this view renders the whole
  // transcript, and per-frame re-renders froze hour-long word-timed calls. The view now
  // re-renders only when the active word (or the displayed second) actually changes.
  const flat = useMemo(() => flattenWords(call.transcript), [call.transcript])
  const activeIndex = usePlayerTimeDerived((t) => (isActiveCall ? activeWordIndex(flat, t) : -1))
  const clockSec = usePlayerTimeDerived((t) => (isActiveCall ? Math.floor(t) : 0))
  // remember the last playhead so the "Open audio bar" chip can resume where the user closed it
  // (second granularity is plenty — clockSec keeps this off the 60fps tick)
  const lastPosRef = useRef(0)
  useEffect(() => {
    if (isActiveCall) lastPosRef.current = player.getCurrentTime()
  }, [isActiveCall, clockSec, player])

  // Tell the player this call is being displayed (URL-independent) so the Return-to-transcript chip
  // hides while we're on it — including the inline live→finished swap, where the URL stays /app/live/live.
  useViewingCall(call.id)

  const [tab, setTab] = useState('transcript')
  // V2 (Claude Design): call view is dark-first with a Light toggle; Single|Multi facets.
  const [view, setView] = useState<'single' | 'multi'>('single')
  // Multi view composes facets: ALL chips are ×-removable (founder round-3: transcript too —
  // audio keeps playing without it); the last visible facet can't be removed.
  const [multiFacets, setMultiFacets] = useState<Set<Facet>>(
    () => new Set<Facet>(['transcript', 'slides', 'report'])
  )
  const { colFlex, facetDivider } = useFacetColumns()
  const [autoScroll] = useState(true) // always on; the scroll-pause + "back to current" chip manages it
  const [panelCollapsed, setPanelCollapsed] = useState(false) // user's manual minimize of the speaker panel

  // Multi = the full-report experience (founder round 3): entering it collapses the app
  // nav rail (CustomEvent — NavRail listens) and the speaker panel; we restore ONLY what we
  // collapsed, on Single or unmount. Manual toggles afterwards win — this fires per view change.
  const autoCollapsedRef = useRef(false)
  useEffect(() => {
    if (view === 'multi') {
      window.dispatchEvent(new CustomEvent('atlas:rail-collapse', { detail: { collapsed: true } }))
      setPanelCollapsed(true)
      autoCollapsedRef.current = true
    } else if (autoCollapsedRef.current) {
      window.dispatchEvent(new CustomEvent('atlas:rail-collapse', { detail: { collapsed: false } }))
      setPanelCollapsed(false)
      autoCollapsedRef.current = false
    }
  }, [view])
  useEffect(
    () => () => {
      // leaving the call page mid-Multi must not strand the whole app with a collapsed rail
      if (autoCollapsedRef.current)
        window.dispatchEvent(new CustomEvent('atlas:rail-collapse', { detail: { collapsed: false } }))
    },
    []
  )
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
  // search lives as an icon in the chips row (founder round 2); closing it clears the query
  const [searchOpen, setSearchOpen] = useState(false)
  // in-transcript side chat (Feature 6): open + the seeded quote + a nonce so re-starring re-seeds
  // docRef (multiview): set only when a report-PDF selection seeded the chat, so /api/chat can
  // ground on document + page text; any transcript highlight clears it back to null.
  const [chat, setChat] = useState<{
    open: boolean
    seed: string
    nonce: number
    docRef: { documentId: string; pages: number[] } | null
    snip: ChatSnip | null
  }>({
    open: false,
    seed: '',
    nonce: 0,
    docRef: null,
    snip: null,
  })
  // Pinge/unification: a PDF text-mark or snip made while the chat is CLOSED waits here,
  // under a floating Ask-Atlas button at the selection/snip anchor.
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
  // Any other pointerdown dismisses the pending button (same lifecycle as text selections);
  // the button itself acts on pointerdown with stopPropagation, so it wins the race.
  useEffect(() => {
    if (!pdfPending) return
    const clear = () => setPdfPending(null)
    window.addEventListener('pointerdown', clear)
    return () => window.removeEventListener('pointerdown', clear)
  }, [pdfPending])
  // side chat open → tell the global docked bar to narrow to its left (so offline = live)
  useEffect(() => {
    player.setChatOpen(chat.open)
    return () => player.setChatOpen(false)
  }, [chat.open, player.setChatOpen])
  // diarization edit mode (Feature 1) — finished, real transcripts only
  const [editMode, setEditMode] = useState(false)
  const canEdit = call.companyId != null && call.id !== 'demo'

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
      setChat((c) => ({ ...c, seed: text, nonce: c.nonce + 1, docRef: null, snip: null }))
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
  // Unified marking rule (spec 2026-07-17): chat open → auto-reference; chat closed →
  // floating Ask-Atlas button first (same UX as transcript marking).
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
        startSec: isActiveCall ? player.getCurrentTime() : 0,
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
      on ? 'bg-ink text-white' : 'call-muted hover:call-ink'
    }`

  return (
    <div className="call-bg call-ink flex h-full min-h-0 flex-1">
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
        {/* Harvey: flat identity header — no separator line (design h 58, pad 26) */}
        <header className="flex h-[58px] flex-none items-center justify-between gap-3 px-[26px]">
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
              onClick={() => router.back()}
              className="call-muted transition-colors hover:call-ink"
            >
              <CloseIcon size={17} />
            </button>
          </div>
        </header>

        {/* facet controls: Back to Overview | Transcript · Slides · Report — View Single|Multi.
            Harvey (probed): the row is FLAT on the backdrop — no card, no separator; the
            float lives in the pane cards below. */}
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
                    className={`flex items-center gap-[7px] rounded-full border px-[11px] py-[5px] text-[12.5px] transition-colors ${
                      active
                        ? 'call-hair call-panel-bg call-ink font-semibold'
                        : 'call-hair call-muted font-medium hover:call-ink'
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
            {/* relocated sub-toolbar controls (founder round 2): the strip below is gone,
                its icons live here so the panes get the vertical room */}
            <div className="flex items-center gap-0.5">
              <IconButton label={dict.live.copy} size={28} onClick={copyAll}>
                <CopyTextIcon size={15} />
              </IconButton>
              <IconButton
                label={dict.company.openInChat}
                size={28}
                onClick={() =>
                  setChat((c) => ({ open: true, seed: '', nonce: c.nonce + 1, docRef: null, snip: null }))
                }
              >
                <SparkleIcon size={15} />
              </IconButton>
              {canEdit && (
                <IconButton
                  label={dict.live.editSpeakers}
                  active={editMode}
                  size={28}
                  onClick={() => setEditMode((v) => !v)}
                >
                  <PencilIcon size={15} />
                </IconButton>
              )}
              <IconButton
                label={dict.live.searchTranscript}
                active={searchOpen}
                size={28}
                onClick={() =>
                  setSearchOpen((open) => {
                    if (open) {
                      setQuery('')
                      setMatchPos(0)
                    }
                    return !open
                  })
                }
              >
                <SearchIcon size={15} />
              </IconButton>
              {searchOpen && (
                <span className="ms-1 flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setMatchPos(0)
                    }}
                    placeholder={dict.live.searchTranscript}
                    className="call-hair call-ink w-40 rounded-md border bg-transparent px-2 py-1 text-xs outline-none placeholder:opacity-50"
                  />
                  {query && (
                    <span className="call-faint flex items-center gap-1 text-2xs">
                      <span className="tabular-nums">
                        {matches.length ? matchPos + 1 : 0}/{matches.length}
                      </span>
                      <button
                        type="button"
                        disabled={!matches.length}
                        onClick={() => setMatchPos((p) => (p - 1 + matches.length) % matches.length)}
                        className="px-1 hover:call-ink disabled:opacity-40"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        disabled={!matches.length}
                        onClick={() => setMatchPos((p) => (p + 1) % matches.length)}
                        className="px-1 hover:call-ink disabled:opacity-40"
                      >
                        ›
                      </button>
                    </span>
                  )}
                </span>
              )}
              {editMode && (
                <span className="ms-1 hidden text-2xs text-ink-faint xl:inline">
                  {dict.live.editSpeakersHint}
                </span>
              )}
            </div>
            <span className="call-hair h-4 w-px border-s" />
            <button
              type="button"
              onClick={playPause}
              disabled={!call.audioUrl}
              className="call-muted flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:call-ink disabled:opacity-40"
            >
              {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
              <span className="font-mono-num tabular-nums" dir="ltr">
                {formatClock(clockSec)}
              </span>
            </button>
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

        {/* body — Single: the active facet; Multi: Transcript | Slides | Report side by side.
            Design line 443: columns keep min-widths and the ROW scrolls horizontally instead
            of squishing — this is what keeps text from reflowing when the chat dock opens. */}
        <div
          className={`atscroll flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 pb-4 pt-2 ${
            view === 'multi' ? 'bg-desktop' : ''
          }`}
        >
          {(view === 'multi' ? multiFacets.has('transcript') : tab === 'transcript') && (
            <div
              data-facet="transcript"
              style={view === 'multi' ? { flex: `${colFlex.transcript} 1 0px` } : undefined}
              className="flex min-w-[340px] flex-1 flex-col gap-1.5 overflow-hidden"
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
              <PaneCard>
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
              </PaneCard>
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

        {/* START this call — it is not the loaded track, so there is nothing to un-hide;
            load it at the last playhead this view saw.
            REOPENING a hidden bar left here on 2026-08-05: it now lives in the shell
            (components/app/PlayerHiddenChip), because a bar dismissed on THIS page kept
            playing on every other one with no control anywhere. Two chips saying "open
            audio bar" on the same screen is the confusion that fix exists to end. */}
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
          snip={chat.snip}
          snipAvailable={view === 'multi' ? multiFacets.has('report') : tab === 'report'}
          onClose={() => setChat((c) => ({ ...c, open: false, docRef: null, snip: null }))}
        />
      )}
    </div>
  )
}
