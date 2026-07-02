'use client'

import * as React from 'react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  interpolatedEdge,
  bufferGate,
  delayedLiveEdge,
  hostedLiveOver,
  LIVE_BUFFER_SEC,
} from '@/lib/live/liveTiming'

// ─────────────────────────────────────────────────────────────────────────────
// Global LIVE audio engine. Mirrors the recorded-call PlayerProvider: lifts the
// Web-Audio engine OUT of LiveBroadcastView and into the app shell so live audio
// keeps playing across navigation (and a "Return to live" chip can bring you back).
// LiveBroadcastView becomes a CONSUMER (transcript UI + controls); this owns the
// engine — the AudioContext, the 1.5s poll of /api/live/state, the PCM pump, the
// 100ms ticker, and the buffer/drain math (liveTiming). Engine internals are moved
// VERBATIM from LiveBroadcastView (relocation, not rewrite); the only additions are
// the start/stop/active lifecycle that lets the provider persist past a page unmount.
//
// Backend reality: /api/live/* is a singleton (one live call at a time, the spike),
// so this provider is effectively a singleton too — `start()` is companyId-keyed and
// idempotent; `stop()` tears the engine down.
// ─────────────────────────────────────────────────────────────────────────────

type LiveWord = { text: string; rawText?: string; start: number | null }
interface LiveState {
  audioStartRel: number | null
  liveEdgeRel: number | null
  liveEnded: boolean
  endedAt: number | null
  sampleRate: number
  lines: { id: number; words: LiveWord[] }[]
  offline?: boolean
}

const SR = 16000

export interface LiveStartConfig {
  companyName: string
  companyId: string | null
  quarter: string
  logoUrl: string | null
  delaySec?: number
  persistKey?: string
}

export type LivePhase = 'connecting' | 'waiting' | 'buffering' | 'ready' | 'playing'

interface LiveAudioApi {
  /** A user has JOINED → audio is playing → show the global bar + return chip. */
  active: boolean
  /** A LiveBroadcastView is currently displaying this call (suppress the global bar/chip). */
  viewing: boolean
  companyName: string
  companyId: string | null
  quarter: string
  logoUrl: string | null
  delaySec: number
  words: LiveWord[]
  phase: LivePhase
  countdown: number
  liveEnded: boolean
  endedAt: number | null
  playingRel: number
  liveEdge: number
  paused: boolean
  volume: number
  broadcastEdge: number
  over: boolean
  behind: number
  /** the in-transcript side chat is open → narrow the docked bar (mirrors PlayerProvider) */
  chatOpen: boolean
  /** Load a call + start polling/the engine. Idempotent: no-op if already loaded for this companyId. */
  start: (c: LiveStartConfig) => void
  /** Create the AudioContext (must be called from a user gesture) and drop in at the live edge. */
  join: () => void
  playPause: () => void
  seek: (t: number) => void
  goLive: () => void
  setVolume: (v: number) => void
  /** Tear the engine down (explicit close, or the live experience is fully over). */
  stop: () => void
  setViewing: (v: boolean) => void
  setChatOpen: (v: boolean) => void
  /** Current playhead without subscribing to the 10fps tick (for the live→finished seek hand-off). */
  getPlayingRel: () => number
}

const Ctx = createContext<LiveAudioApi | null>(null)

export function useLiveAudio(): LiveAudioApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useLiveAudio must be used within <LiveAudioProvider>')
  return c
}

export function LiveAudioProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false) // start() called → the engine polls (independent of join)
  const [active, setActive] = useState(false) // joined → audio playing → global bar/chip
  const [viewing, setViewing] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  const [companyName, setCompanyName] = useState('')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [quarter, setQuarter] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [delaySec, setDelaySec] = useState(LIVE_BUFFER_SEC)

  const [words, setWords] = useState<LiveWord[]>([])
  const [phase, setPhase] = useState<LivePhase>('connecting')
  const [countdown, setCountdown] = useState(LIVE_BUFFER_SEC)
  const [liveEnded, setLiveEnded] = useState(false)
  const [volume, setVolumeState] = useState(1)
  const [paused, setPaused] = useState(false)
  // playhead + edges, in recording-relative seconds (drive the player + karaoke)
  const [playingRel, setPlayingRel] = useState(0)
  const [liveEdge, setLiveEdge] = useState(0)
  const [endedAt, setEndedAt] = useState<number | null>(null)

  // ── engine refs (moved VERBATIM from LiveBroadcastView) ──
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
  const rawEdgeRef = useRef(0) // last polled live edge (recording seconds)
  const edgeWallRef = useRef(0) // wall-clock ms at that poll — to interpolate between polls
  const seekTokenRef = useRef(0) // bumped on seek; an in-flight pump fetch with a stale token is discarded
  const lastSaveRef = useRef(0) // throttle playhead persistence

  // mirrors of state the imperative controls need to read at call time (avoid stale closures)
  const loadedRef = useRef(false)
  const companyIdRef = useRef<string | null>(null)
  const delaySecRef = useRef(LIVE_BUFFER_SEC)
  const persistKeyRef = useRef<string | undefined>(undefined)
  const volumeRef = useRef(1)
  const liveEdgeRef = useRef(0)
  const endedAtRef = useRef<number | null>(null)
  const playingRelRef = useRef(0)

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

  // ── lifecycle ──
  const start = useCallback((c: LiveStartConfig) => {
    // idempotent: already running for this call → keep the engine + its accumulated buffer
    if (loadedRef.current && companyIdRef.current === c.companyId) {
      // metadata may refine (logo/name resolved late) — keep it fresh without restarting
      setCompanyName(c.companyName)
      setLogoUrl(c.logoUrl)
      setQuarter(c.quarter)
      return
    }
    const d = c.delaySec && c.delaySec > 0 ? c.delaySec : LIVE_BUFFER_SEC
    companyIdRef.current = c.companyId
    delaySecRef.current = d
    persistKeyRef.current = c.persistKey
    setCompanyName(c.companyName)
    setCompanyId(c.companyId)
    setQuarter(c.quarter)
    setLogoUrl(c.logoUrl)
    setDelaySec(d)
    loadedRef.current = true
    setLoaded(true)
  }, [])

  const stop = useCallback(() => {
    flushAudio()
    try {
      void ctxRef.current?.close()
    } catch {
      /* already closed */
    }
    ctxRef.current = null
    gainRef.current = null
    startedRef.current = false
    pausedRef.current = false
    playPosRef.current = null
    nextAtRef.current = 0
    fetchingRef.current = false
    stRef.current = null
    seenLinesRef.current = 0
    rawEdgeRef.current = 0
    edgeWallRef.current = 0
    loadedRef.current = false
    companyIdRef.current = null
    liveEdgeRef.current = 0
    endedAtRef.current = null
    playingRelRef.current = 0
    setLoaded(false)
    setActive(false)
    setWords([])
    setPhase('connecting')
    setLiveEnded(false)
    setEndedAt(null)
    setPlayingRel(0)
    setLiveEdge(0)
    setPaused(false)
  }, [])

  // ── poll engine + schedule audio (runs only while loaded; moved VERBATIM) ──
  useEffect(() => {
    if (!loaded) return
    let alive = true

    async function refresh() {
      try {
        const r = await fetch('/api/live/state', { cache: 'no-store' })
        const st: LiveState = await r.json()
        if (!alive) return
        stRef.current = st
        setLiveEnded(st.liveEnded)
        setEndedAt(st.endedAt ?? null)
        endedAtRef.current = st.endedAt ?? null
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
      // delaySec behind the edge while live; after the source ends, drain at 1x toward the true end so the
      // live UX persists through the buffer (6s cap = 1x play).
      const allowedEnd = delayedLiveEdge(st.liveEdgeRel ?? 0, delaySec, st.endedAt ?? null, Date.now())
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
      setLiveEdge((prev) => {
        const next = ended ? edge : Math.max(prev, edge)
        liveEdgeRef.current = next
        return next
      })

      if (startedRef.current) {
        const ctx = ctxRef.current
        if (ctx && playPosRef.current !== null) {
          const cur = Math.max(0, playPosRef.current - (nextAtRef.current - ctx.currentTime))
          setPlayingRel(cur)
          playingRelRef.current = cur
          if (persistKeyRef.current && Date.now() - lastSaveRef.current > 1000) {
            lastSaveRef.current = Date.now()
            try {
              sessionStorage.setItem(persistKeyRef.current, String(cur))
            } catch {
              /* ignore */
            }
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
  }, [loaded, delaySec])

  const join = useCallback(() => {
    const st = stRef.current
    const Ctx2 =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx2()
    const gain = ctx.createGain()
    gain.gain.value = volumeRef.current
    gain.connect(ctx.destination)
    ctxRef.current = ctx
    gainRef.current = gain
    const d = delaySecRef.current
    // drop in at the LIVE edge (delaySec behind the call), not the start
    const liveEdgeRel = st?.liveEdgeRel ?? 0
    const startRel = st?.audioStartRel ?? 0
    // resume the persisted playhead across a refresh (clamped to the playable edge); else drop in at live
    const maxEnd = st?.liveEnded ? liveEdgeRel : Math.max(0, liveEdgeRel - d)
    const saved = persistKeyRef.current ? Number(sessionStorage.getItem(persistKeyRef.current)) : NaN
    playPosRef.current =
      Number.isFinite(saved) && saved > 0
        ? Math.min(saved, Math.max(0, maxEnd))
        : Math.max(startRel, liveEdgeRel - d)
    nextAtRef.current = ctx.currentTime + 0.2
    startedRef.current = true
    pausedRef.current = false
    setPaused(false)
    setPhase('playing')
    setActive(true)
  }, [])

  const playPause = useCallback(() => {
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
  }, [])

  const seek = useCallback((t: number) => {
    const ctx = ctxRef.current
    if (!ctx || playPosRef.current === null) return
    const maxEnd = delayedLiveEdge(liveEdgeRef.current, delaySecRef.current, endedAtRef.current, Date.now())
    const target = Math.min(Math.max(0, t), Math.max(0, maxEnd))
    seekTokenRef.current++
    flushAudio()
    playPosRef.current = target
    nextAtRef.current = ctx.currentTime + 0.1
    setPlayingRel(target)
    playingRelRef.current = target
  }, [])

  const goLive = useCallback(() => {
    // snap to the front of the playable window — the draining edge (ramps to the true end after the
    // source stops), so "return to live" follows the buffer instead of leaping to the end.
    seek(delayedLiveEdge(liveEdgeRef.current, delaySecRef.current, endedAtRef.current, Date.now()))
  }, [seek])

  const setVolume = useCallback((v: number) => {
    volumeRef.current = v
    setVolumeState(v)
    if (gainRef.current) gainRef.current.gain.value = v
  }, [])

  const getPlayingRel = useCallback(() => playingRelRef.current, [])

  // Front of the playable window + over/behind — recomputed each render so they ramp smoothly (the
  // 10fps tick re-renders us). Identical math to the old in-view component.
  const broadcastEdge = delayedLiveEdge(liveEdge, delaySec, endedAt, Date.now())
  const over = hostedLiveOver(liveEnded, broadcastEdge, liveEdge)
  const behind = Math.max(0, liveEdge - playingRel)

  const api: LiveAudioApi = {
    active,
    viewing,
    companyName,
    companyId,
    quarter,
    logoUrl,
    delaySec,
    words,
    phase,
    countdown,
    liveEnded,
    endedAt,
    playingRel,
    liveEdge,
    paused,
    volume,
    broadcastEdge,
    over,
    behind,
    chatOpen,
    start,
    join,
    playPause,
    seek,
    goLive,
    setVolume,
    stop,
    setViewing,
    setChatOpen,
    getPlayingRel,
  }

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}
