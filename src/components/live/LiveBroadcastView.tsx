'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Logo } from '@/components/ds/Logo'
import { Tabs } from '@/components/ds/Tabs'
import { IconButton } from '@/components/ds/IconButton'
import { CloseIcon, SyncIcon, PlayIcon, QuoteIcon, ShareIcon, SparkleIcon, ChevronRightIcon } from '@/components/ds/icons'
import { TranscriptBody } from './TranscriptBody'
import { TranscriptChatPanel } from './TranscriptChatPanel'
import { MediaPlayer } from './MediaPlayer'
import { flattenWords, activeWordIndex, type WordTimedTranscript } from '@/lib/live/syncEngine'
import { formatDate } from '@/lib/i18n/format'
import { createQuote } from '@/lib/api/quotes'
import { interpolatedEdge, bufferGate, LIVE_BUFFER_SEC } from '@/lib/live/liveTiming'

// LIVE broadcast — the V1 transcript page, fed by the live engine (/api/live/*). Same header,
// tabs, karaoke TranscriptBody and MediaPlayer as the finished-transcript page; the difference
// is the data streams in and the audio is scheduled through Web Audio, held `delaySec` behind
// live. Joining drops you at the LIVE edge (liveEdge − delaySec), not the start of the call.

type LiveWord = { text: string; rawText?: string; start: number | null }
interface LiveState {
  audioStartRel: number | null
  liveEdgeRel: number | null
  liveEnded: boolean
  sampleRate: number
  lines: { id: number; words: LiveWord[] }[]
  offline?: boolean
}

const SR = 16000

export function LiveBroadcastView({
  companyName,
  companyId,
  quarter,
  logoUrl,
  delaySec = LIVE_BUFFER_SEC,
  persistKey,
  playheadRef,
  onSourceEnded,
}: {
  companyName: string
  companyId: string | null
  quarter: string
  logoUrl: string | null
  delaySec?: number
  persistKey?: string
  playheadRef?: React.MutableRefObject<number>
  onSourceEnded?: () => void
}) {
  const { dict, locale } = useI18n()
  const router = useRouter()

  const [words, setWords] = useState<LiveWord[]>([])
  const [phase, setPhase] = useState<'connecting' | 'waiting' | 'buffering' | 'ready' | 'playing'>('connecting')
  const [countdown, setCountdown] = useState(delaySec)
  const [liveEnded, setLiveEnded] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [volume, setVolume] = useState(1)
  const [paused, setPaused] = useState(false)
  // playhead + edges, in recording-relative seconds (drive the player + karaoke)
  const [playingRel, setPlayingRel] = useState(0)
  const [liveEdge, setLiveEdge] = useState(0)

  // 2B — capture/ask/share while the call airs (mirrors the finished view's toolbar)
  const [selection, setSelection] = useState<{ text: string; top: number; left: number; speaker: string | null; segmentId: string | null } | null>(null)
  const [chat, setChat] = useState<{ open: boolean; seed: string; nonce: number }>({ open: false, seed: '', nonce: 0 })
  const [toast, setToast] = useState<{ text: string; action?: { label: string; href: string } } | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const stRef = useRef<LiveState | null>(null)
  const seenLinesRef = useRef(0)
  const ctxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const schedRef = useRef<AudioBufferSourceNode[]>([])
  const playPosRef = useRef<number | null>(null)
  const nextAtRef = useRef(0)
  const fetchingRef = useRef(false)
  const startedRef = useRef(false)
  const pausedRef = useRef(false)
  const rawEdgeRef = useRef(0)   // last polled live edge (recording seconds)
  const edgeWallRef = useRef(0)  // wall-clock ms at that poll — to interpolate between polls
  const seekTokenRef = useRef(0) // bumped on seek; an in-flight pump fetch with a stale token is discarded
  const lastSaveRef = useRef(0) // throttle playhead persistence

  // streaming words → a single-segment word-timed transcript (V1 karaoke renders it)
  const transcript = useMemo<WordTimedTranscript>(() => {
    const w = words.map((x) => ({ text: x.text, start: x.start ?? 0, end: x.start ?? 0 }))
    return {
      segments: [
        { id: 'live', speakerId: 'live', speakerName: companyName, role: null, words: w, start: 0, end: w.at(-1)?.start ?? 0 },
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
    [words, companyName, quarter],
  )

  function flushAudio() {
    for (const s of schedRef.current) {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    }
    schedRef.current = []
  }

  // poll engine + schedule audio
  useEffect(() => {
    let alive = true

    async function refresh() {
      try {
        const r = await fetch('/api/live/state', { cache: 'no-store' })
        const st: LiveState = await r.json()
        if (!alive) return
        stRef.current = st
        setLiveEnded(st.liveEnded)
        rawEdgeRef.current = st.liveEdgeRel ?? 0
        edgeWallRef.current = Date.now()

        const newLines = st.lines.slice(seenLinesRef.current)
        if (newLines.length) {
          const add: LiveWord[] = []
          for (const l of newLines) for (const w of l.words) add.push(w)
          setWords((prev) => [...prev, ...add])
          seenLinesRef.current = st.lines.length
        }
      } catch {
        /* keep last state */
      }
    }

    async function pump() {
      const st = stRef.current
      const ctx = ctxRef.current
      if (!startedRef.current || pausedRef.current || !st || fetchingRef.current || !ctx) return
      if (nextAtRef.current - ctx.currentTime > 6) return
      // delaySec behind the edge while airing; once the source ends, the whole captured buffer is a
      // complete recording — playable to the true end so the viewer can roam freely (6s cap = 1x play).
      const allowedEnd = st.liveEnded ? (st.liveEdgeRel ?? 0) : Math.max(0, (st.liveEdgeRel ?? 0) - delaySec)
      const pos = playPosRef.current ?? 0
      const finalEnd = Math.min(pos + 4, allowedEnd)
      if (finalEnd - pos < 0.5) return
      fetchingRef.current = true
      const token = seekTokenRef.current
      try {
        const r = await fetch(`/api/live/pcm?from=${pos}&to=${finalEnd}`, { cache: 'no-store' })
        if (seekTokenRef.current === token && r.status === 200) {
          const i16 = new Int16Array(await r.arrayBuffer())
          if (i16.length) {
            const buf = ctx.createBuffer(1, i16.length, SR)
            const ch = buf.getChannelData(0)
            for (let i = 0; i < i16.length; i++) ch[i] = i16[i] / 32768
            const src = ctx.createBufferSource()
            src.buffer = buf
            src.connect(gainRef.current ?? ctx.destination)
            if (nextAtRef.current < ctx.currentTime) nextAtRef.current = ctx.currentTime + 0.05
            src.start(nextAtRef.current)
            schedRef.current.push(src)
            src.onended = () => {
              schedRef.current = schedRef.current.filter((s) => s !== src)
            }
            nextAtRef.current += buf.duration
            playPosRef.current = pos + buf.duration
          }
        }
      } catch {
        /* transient */
      } finally {
        fetchingRef.current = false
      }
    }

    const iv = setInterval(() => {
      if (alive) void refresh().then(pump)
    }, 1500)
    void refresh()

    // 10fps tick: interpolate the live edge smoothly between the 1.5s polls (kills the "behind live"
    // + remaining-time sawtooth), drive phase/countdown, and advance the playhead.
    const ph = setInterval(() => {
      const st = stRef.current
      const ended = !!st?.liveEnded
      const edge =
        edgeWallRef.current === 0
          ? rawEdgeRef.current
          : interpolatedEdge(rawEdgeRef.current, edgeWallRef.current, Date.now(), ended)
      setLiveEdge((prev) => (ended ? edge : Math.max(prev, edge)))

      if (startedRef.current) {
        const ctx = ctxRef.current
        if (ctx && playPosRef.current !== null) {
          const ph = Math.max(0, playPosRef.current - (nextAtRef.current - ctx.currentTime))
          setPlayingRel(ph)
          if (playheadRef) playheadRef.current = ph
          if (persistKey && Date.now() - lastSaveRef.current > 1000) {
            lastSaveRef.current = Date.now()
            try { sessionStorage.setItem(persistKey, String(ph)) } catch { /* ignore */ }
          }
        }
        setPhase('playing')
        return
      }
      if (!st) {
        setPhase('connecting')
        return
      }
      if (st.offline || st.audioStartRel === null) {
        setPhase('waiting')
        return
      }
      const g = bufferGate(st.audioStartRel, edge, delaySec, st.liveEnded)
      setPhase(g.phase)
      setCountdown(g.countdown)
    }, 100)

    return () => {
      alive = false
      clearInterval(iv)
      clearInterval(ph)
    }
  }, [delaySec])

  function join() {
    const st = stRef.current
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const gain = ctx.createGain()
    gain.gain.value = volume
    gain.connect(ctx.destination)
    ctxRef.current = ctx
    gainRef.current = gain
    // drop in at the LIVE edge (delaySec behind the call), not the start
    const liveEdgeRel = st?.liveEdgeRel ?? 0
    const startRel = st?.audioStartRel ?? 0
    // resume the persisted playhead across a refresh (clamped to the playable edge); else drop in at live
    const maxEnd = st?.liveEnded ? liveEdgeRel : Math.max(0, liveEdgeRel - delaySec)
    const saved = persistKey ? Number(sessionStorage.getItem(persistKey)) : NaN
    playPosRef.current =
      Number.isFinite(saved) && saved > 0 ? Math.min(saved, Math.max(0, maxEnd)) : Math.max(startRel, liveEdgeRel - delaySec)
    nextAtRef.current = ctx.currentTime + 0.2
    startedRef.current = true
    pausedRef.current = false
    setPaused(false)
    setPhase('playing')
  }

  function playPause() {
    const ctx = ctxRef.current
    if (!ctx) return
    if (pausedRef.current) {
      void ctx.resume()
      pausedRef.current = false
      setPaused(false)
    } else {
      void ctx.suspend()
      pausedRef.current = true
      setPaused(true)
    }
  }

  function seek(t: number) {
    const ctx = ctxRef.current
    if (!ctx || playPosRef.current === null) return
    const maxEnd = liveEnded ? liveEdge : Math.max(0, liveEdge - delaySec)
    const target = Math.min(Math.max(0, t), Math.max(0, maxEnd))
    seekTokenRef.current++
    flushAudio()
    playPosRef.current = target
    nextAtRef.current = ctx.currentTime + 0.1
    setPlayingRel(target)
  }

  function goLive() {
    // jump to the live edge (delaySec behind real-time). Only shown while airing — once the source ends
    // it becomes a recording with free navigation, so there's no "live" to return to.
    seek(Math.max(0, rawEdgeRef.current - delaySec))
  }

  function changeVolume(v: number) {
    setVolume(v)
    if (gainRef.current) gainRef.current.gain.value = v
  }

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
    return ((node as Element | null)?.closest('[data-segment-id]') ?? null)?.getAttribute('data-speaker') ?? null
  }
  function selectionSegmentId(sel: Selection | null): string | null {
    let node: Node | null = sel?.anchorNode ?? null
    while (node && node.nodeType !== 1) node = node.parentNode
    return ((node as Element | null)?.closest('[data-segment-id]') ?? null)?.getAttribute('data-segment-id') ?? null
  }
  function onTextSelect() {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    const text = sel?.toString().trim() ?? ''
    if (!text || !sel || sel.rangeCount === 0) { setSelection(null); return }
    // chat open → drop the highlight straight into the composer as a reference (Claude-style)
    if (chat.open) { setChat((c) => ({ ...c, seed: text, nonce: c.nonce + 1 })); setSelection(null); return }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) { setSelection(null); return }
    setSelection({ text, top: rect.top, left: rect.left + rect.width / 2, speaker: selectionSpeaker(sel), segmentId: selectionSegmentId(sel) })
  }
  async function saveSelection(sel: { text: string; speaker: string | null; segmentId: string | null }) {
    if (!sel.text || !companyId) { setToast({ text: dict.common.error }); return }
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
      setToast({ text: dict.live.quoteSaved, action: { label: dict.company.myQuotes, href: `/app/company/${companyId}?tab=quotes` } })
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
  const behind = Math.max(0, liveEdge - playingRel)
  // Front of the playable window: delaySec behind the live edge while airing; the WHOLE recording once
  // the source ends (free navigation). The bar's currentTime/duration follow from this.
  const broadcastEdge = liveEnded ? liveEdge : Math.max(0, liveEdge - delaySec)

  // Tell the LiveSession wrapper to start the finish pipeline the moment the source ends.
  useEffect(() => { if (liveEnded) onSourceEnded?.() }, [liveEnded]) // eslint-disable-line react-hooks/exhaustive-deps

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
          <span className="shrink-0 text-sm text-ink-faint">{formatDate(new Date().toISOString(), locale)}</span>
          {phase === 'playing' && !liveEnded && (
            <span
              className="shrink-0 whitespace-nowrap rounded-full bg-subtle px-2 py-0.5 text-2xs font-medium text-ink-muted tabular-nums"
              dir="ltr"
            >
              -{fmt(behind)} {dict.live.behindLive}
            </span>
          )}
        </div>
        {/* top-right: LIVE pill while airing → full "ended, AI is processing" status once the source ends */}
        <div className="flex shrink-0 items-center gap-3">
          {liveEnded ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap text-2xs font-medium text-ink-faint">
              <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
              {dict.live.endedStatus}
            </span>
          ) : (
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
        <IconButton label={dict.live.autoScroll} active={autoScroll} size={30} onClick={() => setAutoScroll((v) => !v)}>
          <SyncIcon size={16} />
        </IconButton>
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
        <TranscriptBody transcript={transcript} activeIndex={activeIndex} autoScroll={autoScroll} onWordClick={seek} karaoke />
      </div>

      {selection && (
        <div
          style={{ position: 'fixed', top: selection.top, left: selection.left, transform: 'translate(-50%, -120%)' }}
          className="z-50 flex items-center gap-0.5 rounded-full bg-player px-1 py-1 shadow-player"
        >
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { void saveSelection(selection); setSelection(null) }} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-player-ink transition-colors hover:bg-white/15">
            <QuoteIcon size={13} />{dict.live.saveQuote}
          </button>
          <span className="h-4 w-px bg-white/15" />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { shareSelection(selection.text); setSelection(null) }} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-player-ink transition-colors hover:bg-white/15">
            <ShareIcon size={13} />{dict.common.share}
          </button>
          <span className="h-4 w-px bg-white/15" />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setChat((c) => ({ open: true, seed: selection.text, nonce: c.nonce + 1 })); setSelection(null) }} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-player-ink transition-colors hover:bg-white/15">
            <SparkleIcon size={14} />{dict.live.askAboutQuote}
          </button>
        </div>
      )}
      {toast && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center">
          <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-white shadow-popover">
            {toast.text}
            {toast.action && (
              <Link href={toast.action.href} className="flex items-center gap-0.5 text-white/80 underline-offset-2 transition-colors hover:text-white hover:underline">
                {toast.action.label}<ChevronRightIcon size={13} className="rtl:rotate-180" />
              </Link>
            )}
          </span>
        </div>
      )}

      {/* the audio bar */}
      <MediaPlayer
        logoUrl={logoUrl}
        title={companyName}
        subtitle={quarter}
        chapter={liveEnded ? undefined : 'Live session'}
        currentTime={playingRel}
        duration={broadcastEdge}
        playing={phase === 'playing' && !paused}
        isLive={!liveEnded}
        onGoLive={goLive}
        volume={volume}
        onPlayPause={playPause}
        onSeek={seek}
        onSkip={(d) => seek(playingRel + d)}
        onVolumeChange={changeVolume}
        onClose={() => router.push('/app/home')}
      />

      {/* buffering / join overlay */}
      {phase !== 'playing' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-canvas/95 px-6 text-center">
          <span className="flex items-center gap-1.5 rounded-full bg-live/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
            <span className="text-2xs font-bold tracking-wide text-live">{liveEnded ? 'הסתיים' : dict.live.liveBadge}</span>
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
