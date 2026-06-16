'use client'

import * as React from 'react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Global audio player (Feature 4). Lifts the recorded-call player out of the
// transcript page and into the app shell so audio keeps playing across navigation
// and while chatting. ONE hidden <audio> lives here; the transcript page becomes a
// consumer (karaoke + word-seek) rather than the owner.
//
// `currentTime` is intentionally NOT in the context value — it ticks ~60fps and would
// re-render every consumer. It's exposed via usePlayerTime() (useSyncExternalStore),
// so only the player bar and the transcript karaoke re-render on each frame.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlayerCall {
  id: string
  companyId: string | null
  title: string
  subtitle: string
  logoUrl: string | null
  audioUrl: string
  isLive: boolean
  duration?: number
  /** seek here once metadata loads (e.g. go-to-quote opening a not-yet-loaded call) */
  startAt?: number
}

interface PlayerApi {
  call: PlayerCall | null
  playing: boolean
  duration: number
  volume: number
  /** Load a call as the active track (no-op if it's already active). Does NOT auto-play. */
  load: (c: PlayerCall) => void
  play: () => void
  pause: () => void
  toggle: () => void
  seek: (t: number) => void
  skip: (delta: number) => void
  setVolume: (v: number) => void
  close: () => void
  getCurrentTime: () => number
  subscribeTime: (cb: () => void) => () => void
  viewingId: string | null
  setViewing: (id: string | null) => void
}

const Ctx = createContext<PlayerApi | null>(null)

export function usePlayer(): PlayerApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('usePlayer must be used within <PlayerProvider>')
  return c
}

/** High-frequency playhead (seconds). Only re-renders the calling component. */
export function usePlayerTime(): number {
  const p = usePlayer()
  return useSyncExternalStore(p.subscribeTime, p.getCurrentTime, () => 0)
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [call, setCall] = useState<PlayerCall | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)
  const [viewingId, setViewingId] = useState<string | null>(null) // call a LiveTranscriptView is displaying (URL-independent)

  // time store — a mutable ref + listener set, driven by rAF while playing + timeupdate.
  const timeRef = useRef(0)
  const listeners = useRef(new Set<() => void>())
  const rafRef = useRef(0)
  const pendingSeekRef = useRef<number | null>(null)
  const notify = useCallback(() => listeners.current.forEach((l) => l()), [])
  const subscribeTime = useCallback((cb: () => void) => {
    listeners.current.add(cb)
    return () => listeners.current.delete(cb)
  }, [])
  const getCurrentTime = useCallback(() => timeRef.current, [])

  // point the <audio> at the active call whenever it changes (by id)
  const activeId = call?.id ?? null
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (call) {
      if (a.getAttribute('src') !== call.audioUrl) {
        a.src = call.audioUrl
        a.load()
      }
      pendingSeekRef.current = call.startAt ?? null
      timeRef.current = call.startAt ?? 0
      setDuration(call.duration ?? 0)
      notify()
    } else {
      a.removeAttribute('src')
      a.load()
      timeRef.current = 0
      notify()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  // smooth playhead while playing (the transcript karaoke wants ~rAF granularity)
  useEffect(() => {
    if (!playing) return
    let alive = true
    const tick = () => {
      if (!alive) return
      const a = audioRef.current
      if (a) {
        timeRef.current = a.currentTime
        notify()
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [playing, notify])

  const load = useCallback((c: PlayerCall) => {
    setCall((prev) => (prev?.id === c.id ? prev : c))
  }, [])
  const play = useCallback(() => {
    void audioRef.current?.play().catch(() => {})
  }, [])
  const pause = useCallback(() => audioRef.current?.pause(), [])
  const toggle = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) void a.play().catch(() => {})
    else a.pause()
  }, [])
  const seek = useCallback(
    (t: number) => {
      const a = audioRef.current
      if (!a) return
      const clamped = Math.max(0, t)
      a.currentTime = clamped
      timeRef.current = clamped
      notify()
    },
    [notify],
  )
  const skip = useCallback(
    (delta: number) => {
      const a = audioRef.current
      if (!a) return
      seek(Math.min(a.duration || Infinity, Math.max(0, a.currentTime + delta)))
    },
    [seek],
  )
  const setVolume = useCallback((v: number) => {
    const a = audioRef.current
    if (a) a.volume = v
    setVolumeState(v)
  }, [])
  const setViewing = useCallback((id: string | null) => setViewingId(id), [])
  const close = useCallback(() => {
    audioRef.current?.pause()
    setCall(null)
    setPlaying(false)
    setDuration(0)
  }, [])

  const api: PlayerApi = {
    call,
    playing,
    duration,
    volume,
    load,
    play,
    pause,
    toggle,
    seek,
    skip,
    setVolume,
    close,
    getCurrentTime,
    subscribeTime,
    viewingId,
    setViewing,
  }

  return (
    <Ctx.Provider value={api}>
      {children}
      <audio
        ref={audioRef}
        className="hidden"
        preload="metadata"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || duration)
          e.currentTarget.volume = volume
          if (pendingSeekRef.current != null) {
            e.currentTarget.currentTime = pendingSeekRef.current
            timeRef.current = pendingSeekRef.current
            pendingSeekRef.current = null
            notify()
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          // covers seeking + the gaps between rAF ticks (e.g. when paused)
          timeRef.current = e.currentTarget.currentTime
          notify()
        }}
      />
    </Ctx.Provider>
  )
}
