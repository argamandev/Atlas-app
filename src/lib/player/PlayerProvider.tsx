'use client'

import * as React from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { addViewer, removeViewer, type ViewerCounts } from './viewers'

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
  /** The docked bar's ✕ hides the BAR, not the audio (founder round 3): playback, the
   *  chips-row timer and karaoke all keep running; showBar()/load() bring the bar back. */
  barHidden: boolean
  hideBar: () => void
  showBar: () => void
  /** the current source failed to load — nothing will play until another is chosen */
  loadFailed: boolean
  getCurrentTime: () => number
  subscribeTime: (cb: () => void) => () => void
  /** call ids some surface is currently DISPLAYING — see `useViewingCall` */
  viewingIds: string[]
  addViewing: (id: string) => void
  removeViewing: (id: string) => void
  /** the in-transcript side chat is open → the docked bar narrows to sit left of it */
  chatOpen: boolean
  setChatOpen: (v: boolean) => void
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

/** Derived playhead value (active word index, whole seconds, …). `compute` runs at tick
 *  rate, but the component re-renders only when the derived PRIMITIVE changes — wiring the
 *  raw 60fps clock into a large view froze hour-long word-timed calls (every frame
 *  re-rendered thousands of word spans). Keep `compute` cheap; memoization not required. */
export function usePlayerTimeDerived<T extends number | string | boolean>(compute: (t: number) => T): T {
  const p = usePlayer()
  return useSyncExternalStore(
    p.subscribeTime,
    () => compute(p.getCurrentTime()),
    () => compute(0)
  )
}

/**
 * "This component is SHOWING that call's words right now."
 *
 * Registers on mount, releases on unmount, so the floating "Return to transcript"
 * chip never offers to carry you somewhere you already are. Founder, 2026-08-05:
 * playing a call from a workspace pane raised that chip — and following it would
 * have thrown away the panes he had arranged, to reach a transcript already open
 * in front of him.
 *
 * Pass `null` when there is nothing to declare (a pane with no recording).
 */
export function useViewingCall(callId: string | null) {
  const { addViewing, removeViewing } = usePlayer()
  useEffect(() => {
    if (!callId) return
    addViewing(callId)
    return () => removeViewing(callId)
  }, [callId, addViewing, removeViewing])
}

/**
 * The list form: "all of these calls are reachable HERE, without navigating."
 *
 * A workspace holding a call as a labelled tab is the case this exists for. The
 * analyst switches from the transcript to the report while the audio keeps
 * playing; the chip has no business appearing then, because its offer — go to
 * the call page — would empty the workspace he built to reach words that are one
 * visible tab away.
 *
 * Keyed on the joined ids so a re-render with an equal list does not re-register.
 * Call ids never contain the separator (uuids and YouTube ids).
 */
export function useViewingCalls(callIds: string[]) {
  const { addViewing, removeViewing } = usePlayer()
  const key = callIds.join('|')
  useEffect(() => {
    const ids = key ? key.split('|') : []
    ids.forEach(addViewing)
    return () => ids.forEach(removeViewing)
  }, [key, addViewing, removeViewing])
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [call, setCall] = useState<PlayerCall | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)
  // Calls some surface is DISPLAYING right now (URL-independent) — a workspace pane
  // or a LiveTranscriptView. Counted, not flagged: see lib/player/viewers.ts.
  const [viewingIds, setViewingIds] = useState<string[]>([])
  const viewerCounts = useRef<ViewerCounts>(new Map())
  const [chatOpen, setChatOpen] = useState(false) // in-transcript side chat open → narrow the docked bar
  const [barHidden, setBarHidden] = useState(false) // bar UI dismissed while audio keeps playing
  /** the current source failed to load — the bar says so instead of sitting mute */
  const [loadFailed, setLoadFailed] = useState(false)

  // time store — a mutable ref + listener set, driven by rAF while playing + timeupdate.
  const timeRef = useRef(0)
  const listeners = useRef(new Set<() => void>())
  const rafRef = useRef(0)
  const pendingSeekRef = useRef<number | null>(null)
  /**
   * A PRESS OF PLAY CAN ARRIVE BEFORE THE <audio> HAS A SOURCE.
   *
   * `load()` only sets React state; the element is pointed at the new URL in an
   * effect one render LATER. A surface that loads and plays in the same handler
   * — the workspace's "Play the recording", and clicking a word to hear it —
   * therefore called `play()` on a source-less element, which rejects, and then
   * the effect ran `a.load()`, which would have aborted it anyway. Nothing
   * played until the button was pressed a SECOND time.
   *
   * It survived because it was invisible: the pane lit up its karaoke on the
   * press regardless, so the only tell was silence. Gating the karaoke on real
   * playback (lib/live/syncMode) is what exposed it.
   *
   * So the intent is remembered and replayed on `canplay` — the same shape as
   * `pendingSeekRef` above, for the same reason. ONE SHOT: the flag is cleared
   * before the retry, and by any pause/close, so a remembered press can never
   * become a standing order that starts audio the user has since stopped.
   */
  const pendingPlayRef = useRef(false)
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
    setBarHidden(false) // loading (or re-summoning) a call always surfaces the bar
    setLoadFailed(false) // a new source has not failed yet
  }, [])
  const hideBar = useCallback(() => setBarHidden(true), [])
  const showBar = useCallback(() => setBarHidden(false), [])
  const play = useCallback(() => {
    pendingPlayRef.current = true
    const a = audioRef.current
    if (!a) return
    void a
      .play()
      .then(() => {
        pendingPlayRef.current = false
      })
      .catch(() => {}) // left pending on purpose — onCanPlay retries once
  }, [])
  const pause = useCallback(() => {
    pendingPlayRef.current = false
    audioRef.current?.pause()
  }, [])
  const toggle = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      pendingPlayRef.current = true
      void a
        .play()
        .then(() => {
          pendingPlayRef.current = false
        })
        .catch(() => {})
    } else {
      pendingPlayRef.current = false
      a.pause()
    }
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
    [notify]
  )
  const skip = useCallback(
    (delta: number) => {
      const a = audioRef.current
      if (!a) return
      seek(Math.min(a.duration || Infinity, Math.max(0, a.currentTime + delta)))
    },
    [seek]
  )
  const setVolume = useCallback((v: number) => {
    const a = audioRef.current
    if (a) a.volume = v
    setVolumeState(v)
  }, [])
  const addViewing = useCallback((id: string) => setViewingIds(addViewer(viewerCounts.current, id)), [])
  const removeViewing = useCallback((id: string) => setViewingIds(removeViewer(viewerCounts.current, id)), [])
  const close = useCallback(() => {
    pendingPlayRef.current = false
    audioRef.current?.pause()
    setCall(null)
    setPlaying(false)
    setDuration(0)
    // Ending the call ends the HIDDEN state with it. Leaving it set would carry
    // "the bar is dismissed" across to a call the user has not started yet.
    setBarHidden(false)
    setLoadFailed(false)
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
    barHidden,
    hideBar,
    showBar,
    getCurrentTime,
    subscribeTime,
    loadFailed,
    viewingIds,
    addViewing,
    removeViewing,
    chatOpen,
    setChatOpen,
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
        onCanPlay={(e) => {
          if (!pendingPlayRef.current) return
          pendingPlayRef.current = false // one shot, before the retry
          void e.currentTarget.play().catch(() => {})
        }}
        // A SOURCE THAT WILL NEVER LOAD MUST NOT LOOK LIKE ONE STILL LOADING.
        //
        // `canplay` never fires for a 404 or an expired URL, so without this the
        // remembered press sits in `pendingPlayRef` forever: "Play the recording"
        // does nothing, no karaoke starts, and nothing anywhere says why. That is
        // the same invisible-failure shape the pendingPlay mechanism was written
        // to fix (rules/app.md, 2026-08-05) reappearing through the one door it
        // left open. Clearing the flag is what makes the next press try again
        // instead of being swallowed by a stale intent.
        onError={() => {
          pendingPlayRef.current = false
          setPlaying(false)
          setLoadFailed(true)
        }}
        onPlay={() => {
          setLoadFailed(false)
          setPlaying(true)
        }}
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
