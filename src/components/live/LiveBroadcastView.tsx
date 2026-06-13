'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/ds/Logo'
import { IconButton } from '@/components/ds/IconButton'
import { CloseIcon, PlayIcon } from '@/components/ds/icons'

// LIVE broadcast — streams audio + karaoke captions from the live engine (via /api/live/*),
// held in a buffer so playback runs `delaySec` behind the real call. Word timings drive the
// karaoke exactly like the finished-transcript page; the audio is scheduled chunk-by-chunk
// through the Web Audio API (the only way to play a growing live stream). V1-styled.

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
  quarter,
  logoUrl,
  delaySec = 300,
}: {
  companyName: string
  quarter: string
  logoUrl: string | null
  delaySec?: number
}) {
  const router = useRouter()
  const [words, setWords] = useState<LiveWord[]>([])
  const [activeIdx, setActiveIdx] = useState(-1)
  const [phase, setPhase] = useState<'connecting' | 'waiting' | 'buffering' | 'ready' | 'playing'>('connecting')
  const [countdown, setCountdown] = useState(delaySec)
  const [behind, setBehind] = useState(0)
  const [liveEnded, setLiveEnded] = useState(false)

  const stRef = useRef<LiveState | null>(null)
  const wordsRef = useRef<LiveWord[]>([])
  const seenLinesRef = useRef(0)
  const ctxRef = useRef<AudioContext | null>(null)
  const playPosRef = useRef<number | null>(null)
  const nextAtRef = useRef(0)
  const fetchingRef = useRef(false)
  const startedRef = useRef(false)
  const activeWordRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    wordsRef.current = words
  }, [words])

  useEffect(() => {
    if (activeIdx >= 0 && activeWordRef.current) {
      activeWordRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeIdx])

  // poll engine state + schedule audio
  useEffect(() => {
    let alive = true

    async function refresh() {
      try {
        const r = await fetch('/api/live/state', { cache: 'no-store' })
        const st: LiveState = await r.json()
        if (!alive) return
        stRef.current = st
        setLiveEnded(st.liveEnded)

        const newLines = st.lines.slice(seenLinesRef.current)
        if (newLines.length) {
          const add: LiveWord[] = []
          for (const l of newLines) for (const w of l.words) add.push(w)
          setWords((prev) => [...prev, ...add])
          seenLinesRef.current = st.lines.length
        }

        if (startedRef.current) {
          setPhase('playing')
        } else if (st.offline || st.audioStartRel === null) {
          setPhase('waiting')
        } else {
          const buffered = (st.liveEdgeRel ?? 0) - st.audioStartRel
          if (buffered < delaySec && !st.liveEnded) {
            setPhase('buffering')
            setCountdown(Math.max(0, Math.round(delaySec - buffered)))
          } else {
            setPhase('ready')
          }
        }
      } catch {
        /* keep last state */
      }
    }

    async function pump() {
      const st = stRef.current
      const ctx = ctxRef.current
      if (!startedRef.current || !st || fetchingRef.current || !ctx) return
      if (nextAtRef.current - ctx.currentTime > 6) return // keep ~6s scheduled ahead
      const allowedEnd = st.liveEnded ? st.liveEdgeRel ?? 0 : (st.liveEdgeRel ?? 0) - delaySec
      const pos = playPosRef.current ?? 0
      const finalEnd = Math.min(pos + 4, allowedEnd)
      if (finalEnd - pos < 0.5) return
      fetchingRef.current = true
      try {
        const r = await fetch(`/api/live/pcm?from=${pos}&to=${finalEnd}`, { cache: 'no-store' })
        if (r.status === 200) {
          const i16 = new Int16Array(await r.arrayBuffer())
          if (i16.length) {
            const buf = ctx.createBuffer(1, i16.length, SR)
            const ch = buf.getChannelData(0)
            for (let i = 0; i < i16.length; i++) ch[i] = i16[i] / 32768
            const src = ctx.createBufferSource()
            src.buffer = buf
            src.connect(ctx.destination)
            if (nextAtRef.current < ctx.currentTime) nextAtRef.current = ctx.currentTime + 0.05
            src.start(nextAtRef.current)
            nextAtRef.current += buf.duration
            playPosRef.current = pos + buf.duration
          }
        }
      } catch {
        /* transient */
      }
      fetchingRef.current = false
    }

    const iv = setInterval(() => {
      if (alive) void refresh().then(pump)
    }, 1500)
    void refresh()

    let raf = 0
    const tick = () => {
      const st = stRef.current
      const ctx = ctxRef.current
      if (startedRef.current && st && ctx && playPosRef.current !== null) {
        const playingRel = playPosRef.current - (nextAtRef.current - ctx.currentTime)
        setBehind(Math.max(0, (st.liveEdgeRel ?? 0) - playingRel))
        const ws = wordsRef.current
        let lo = 0,
          hi = ws.length - 1,
          idx = -1
        while (lo <= hi) {
          const m = (lo + hi) >> 1
          if (ws[m].start !== null && (ws[m].start as number) <= playingRel) {
            idx = m
            lo = m + 1
          } else hi = m - 1
        }
        setActiveIdx((prev) => (prev === idx ? prev : idx))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      alive = false
      clearInterval(iv)
      cancelAnimationFrame(raf)
    }
  }, [delaySec])

  function join() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ctxRef.current = ctx
    playPosRef.current = stRef.current?.audioStartRel ?? 0
    nextAtRef.current = ctx.currentTime + 0.3
    startedRef.current = true
    setPhase('playing')
  }

  const fmt = (s: number) => {
    s = Math.max(0, Math.round(s))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  const overlayMsg =
    phase === 'connecting'
      ? 'מתחבר לשידור…'
      : phase === 'waiting'
        ? 'ממתין לתחילת השיחה…'
        : phase === 'buffering'
          ? `השידור יתחיל בעוד ${fmt(countdown)} (מאגר השהיה נבנה)`
          : `השידור זמין — בהשהיה של ${fmt(delaySec)} מאחורי השיחה החיה`

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col" dir="rtl">
      {/* header */}
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-6 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo src={logoUrl} name={companyName} size={32} />
          <span className="truncate font-bold text-ink">
            {companyName} — {quarter}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-live/10 px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse" />
            <span className="text-2xs font-bold tracking-wide text-live">{liveEnded ? 'הסתיים' : 'שידור חי'}</span>
          </span>
          {phase === 'playing' && (
            <span className="shrink-0 text-xs text-ink-faint tabular-nums" dir="ltr">
              -{fmt(behind)} מאחורי החי
            </span>
          )}
        </div>
        <IconButton label="סגירה" size={30} onClick={() => router.push('/app/home')}>
          <CloseIcon size={17} />
        </IconButton>
      </header>

      {/* transcript */}
      <div className="app-scroll relative min-h-0 flex-1 overflow-y-auto px-6 pb-24 pt-6 text-right">
        <p className="text-[26px] font-medium leading-[2.0]">
          {words.map((w, i) => {
            const fixed = w.rawText && w.rawText !== w.text
            const cls =
              i === activeIdx
                ? 'bg-subtle text-ink'
                : i < activeIdx
                  ? 'text-ink'
                  : 'text-ink-faint'
            return (
              <span
                key={i}
                ref={i === activeIdx ? activeWordRef : undefined}
                title={fixed ? `מקור: ${w.rawText}` : undefined}
                className={`rounded-[3px] ${cls} ${fixed ? 'underline decoration-[#C04A00]/50 underline-offset-4' : ''}`}
              >
                {w.text}{' '}
              </span>
            )
          })}
        </p>
      </div>

      {/* buffering / join overlay */}
      {phase !== 'playing' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-canvas/95 px-6 text-center">
          <span className="flex items-center gap-1.5 rounded-full bg-live/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse" />
            <span className="text-2xs font-bold tracking-wide text-live">שידור חי</span>
          </span>
          <h2 className="text-xl font-bold text-ink">
            {companyName} — שיחת משקיעים
          </h2>
          <p className="text-sm text-ink-muted tabular-nums">{overlayMsg}</p>
          <button
            type="button"
            onClick={join}
            disabled={phase !== 'ready'}
            className="flex items-center gap-2 rounded-full bg-[#C04A00] px-7 py-3 text-[15px] font-semibold text-white transition-opacity disabled:bg-subtle disabled:text-ink-faint"
          >
            <PlayIcon size={16} />
            הצטרפו לשידור
          </button>
        </div>
      )}
    </div>
  )
}
