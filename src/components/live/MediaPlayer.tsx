'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { formatClock } from '@/lib/i18n/format'
import {
  RewindCircleIcon,
  ForwardCircleIcon,
  PlayIcon,
  PauseIcon,
  VolumeIcon,
  CloseIcon,
} from '@/components/ds/icons'

// Docked media player (brief §5.5.1): a charcoal pill, three zones (identity ▸
// scrubber/time ▸ controls). Live → red scrubber + handle; recorded → segmented ticks.
export interface MediaPlayerProps {
  logoUrl?: string | null
  title: string
  subtitle: string
  chapter?: string
  currentTime: number
  duration: number
  playing: boolean
  isLive: boolean
  volume: number
  onPlayPause: () => void
  onSeek: (t: number) => void
  onSkip: (delta: number) => void
  onVolumeChange: (v: number) => void
  onClose?: () => void
  onGoLive?: () => void
  /** offline global bar only: narrow the bar to the left when the side chat panel is open */
  chatNarrow?: boolean
}

export function MediaPlayer(props: MediaPlayerProps) {
  const { dict, dir } = useI18n()
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const { currentTime, duration, playing, isLive } = props
  // While live the viewer sits AT the delayed edge, so the playhead is pinned far-right (YouTube-style)
  // from the first frame. currentTime/duration is ~0/0 at join and would otherwise drift in from the left.
  // A real seek backwards (>2s behind the edge) leaves the live edge → the thumb tracks position again.
  const atLiveEdge = isLive && (duration <= 0 || currentTime >= duration - 2)
  const pct = atLiveEdge ? 100 : duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0

  function seekFromClientX(clientX: number) {
    const el = trackRef.current
    if (!el || duration <= 0) return
    const rect = el.getBoundingClientRect()
    let ratio = (clientX - rect.left) / rect.width
    if (dir === 'rtl') ratio = 1 - ratio // scrubber follows reading direction
    props.onSeek(Math.min(duration, Math.max(0, ratio * duration)))
  }

  return (
    // docked pill (design lines 1686-1703): centered black pill, min(880px,72vw), bottom 22px
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[22px]',
        props.chatNarrow && 'lg:pe-[396px]'
      )}
    >
      <div
        className="pointer-events-auto flex w-[min(880px,72vw)] items-center gap-3.5 rounded-pill bg-ink px-4 py-[9px]"
        style={{ boxShadow: '0 1px 3px rgba(28,27,25,.18), 0 12px 36px rgba(28,27,25,.22)' }}
      >
        {/* zone 1 — identity: cream monogram circle + one-line title */}
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <span
            dir="auto"
            className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-paper text-[14px] text-ink"
          >
            {props.title.trim().charAt(0) || '·'}
          </span>
          <span dir="auto" className="max-w-[260px] truncate text-[12.5px] text-[#C9C5BC]">
            {[props.title, props.subtitle].filter(Boolean).join(' — ')}
          </span>
          {isLive && (
            <span className="ms-1.5 flex flex-none items-center gap-1.5">
              <span
                className="h-[7px] w-[7px] rounded-full bg-live"
                style={{ animation: 'atpulse 2s ease-in-out infinite' }}
              />
              <button
                type="button"
                onClick={props.onGoLive}
                className="font-mono-num text-[11.5px] font-medium text-live transition-opacity hover:opacity-80"
              >
                LIVE
              </button>
            </span>
          )}
        </div>

        {/* zone 2 — the 4px track (design line 1694): gray fill on #3A382F */}
        <button
          ref={trackRef as unknown as React.RefObject<HTMLButtonElement>}
          type="button"
          onPointerDown={(e) => {
            if (duration <= 0) return
            draggingRef.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            seekFromClientX(e.clientX)
          }}
          onPointerMove={(e) => {
            if (draggingRef.current) seekFromClientX(e.clientX)
          }}
          onPointerUp={(e) => {
            draggingRef.current = false
            try {
              e.currentTarget.releasePointerCapture(e.pointerId)
            } catch {
              /* ignore */
            }
          }}
          aria-label={dict.player.speed}
          className="relative h-3 min-w-0 flex-1 cursor-pointer touch-none"
        >
          <span className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 overflow-hidden rounded-[4px] bg-[#3A382F]">
            <span
              className="absolute bottom-0 top-0 rounded-[4px] bg-[#8A867C]"
              style={{ insetInlineStart: 0, width: `${pct}%` }}
            />
          </span>
        </button>

        {/* zone 3 — elapsed mono time · play · ghost extras (±15/volume/close kept functional) */}
        <span dir="ltr" className="flex-none font-mono-num text-[11.5px] tabular-nums text-[#8A867C]">
          {formatClock(currentTime)}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => props.onSkip(-15)}
            aria-label={dict.player.rewind15}
            className="grid h-7 w-7 place-items-center text-[#8A867C] transition-colors hover:text-player-ink"
          >
            <RewindCircleIcon size={18} />
          </button>
          <button
            type="button"
            onClick={props.onPlayPause}
            aria-label={playing ? dict.player.pause : dict.player.play}
            className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-paper text-ink transition-opacity hover:opacity-90"
          >
            {playing ? (
              <PauseIcon size={14} />
            ) : (
              <PlayIcon size={14} className="translate-x-px rtl:-translate-x-px" />
            )}
          </button>
          <button
            type="button"
            onClick={() => props.onSkip(15)}
            aria-label={dict.player.forward15}
            className="grid h-7 w-7 place-items-center text-[#8A867C] transition-colors hover:text-player-ink"
          >
            <ForwardCircleIcon size={18} />
          </button>
          <div className="ms-0.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => props.onVolumeChange(props.volume > 0 ? 0 : 1)}
              aria-label={dict.player.volume}
              className={`grid h-7 w-7 place-items-center transition-colors ${props.volume > 0 ? 'text-[#8A867C] hover:text-player-ink' : 'text-[#8A867C]/40'}`}
            >
              <VolumeIcon size={16} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={props.volume}
              onChange={(e) => props.onVolumeChange(parseFloat(e.target.value))}
              aria-label={dict.player.volume}
              className="h-1 w-14 cursor-pointer accent-[#ECECEA]"
            />
          </div>
          {props.onClose && (
            <button
              type="button"
              onClick={props.onClose}
              aria-label={dict.player.close}
              className="ms-0.5 grid h-7 w-7 place-items-center text-[#8A867C] hover:text-player-ink"
            >
              <CloseIcon size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
