'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Logo } from '@/components/ds/Logo'
import { formatClock } from '@/lib/i18n/format'
import {
  RewindCircleIcon,
  ForwardCircleIcon,
  PlayIcon,
  PauseIcon,
  VolumeIcon,
  CloseIcon,
  ChevronRightIcon,
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
  const { currentTime, duration, playing, isLive } = props
  // While live the viewer sits AT the delayed edge, so the playhead is pinned far-right (YouTube-style)
  // from the first frame. currentTime/duration is ~0/0 at join and would otherwise drift in from the left.
  // A real seek backwards (>2s behind the edge) leaves the live edge → the thumb tracks position again.
  const atLiveEdge = isLive && (duration <= 0 || currentTime >= duration - 2)
  const pct = atLiveEdge ? 100 : duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
  const remaining = Math.max(0, duration - currentTime)

  function seekFromEvent(e: React.MouseEvent) {
    const el = trackRef.current
    if (!el || duration <= 0) return
    if (e.detail === 0) return // keyboard-activated click (Enter/Space) has clientX 0 — ignore
    const rect = el.getBoundingClientRect()
    let ratio = (e.clientX - rect.left) / rect.width
    if (dir === 'rtl') ratio = 1 - ratio // scrubber follows reading direction
    props.onSeek(Math.min(duration, Math.max(0, ratio * duration)))
  }

  return (
    <div className={cn('pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4', props.chatNarrow && 'lg:pe-[396px]')}>
      <div className="pointer-events-auto flex w-full max-w-[1080px] items-center gap-4 rounded-pill bg-player px-4 py-2.5 shadow-player">
        {/* zone 1 — identity */}
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          <Logo src={props.logoUrl} name={props.title} size={34} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-bold text-player-ink">{props.title}</div>
            <div className="truncate text-2xs text-player-faint">{props.subtitle}</div>
          </div>
        </div>

        {/* zone 2 — scrubber + timing */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5 text-2xs text-player-faint">
            <span dir="ltr" className="tabular-nums">{formatClock(currentTime)}</span>
            {props.chapter && (
              <>
                <span>·</span>
                <span className="truncate text-player-ink/80">{props.chapter}</span>
                <ChevronRightIcon size={12} className="shrink-0" />
              </>
            )}
            {isLive ? (
              <button
                type="button"
                onClick={props.onGoLive}
                className="ms-auto font-semibold text-live transition-opacity hover:opacity-80"
                aria-label="חזרה לשידור החי"
              >
                LIVE
              </button>
            ) : (
              <span dir="ltr" className="ms-auto tabular-nums">-{formatClock(remaining)}</span>
            )}
          </div>

          <button
            ref={trackRef as unknown as React.RefObject<HTMLButtonElement>}
            type="button"
            onClick={seekFromEvent}
            aria-label={dict.live.searchTranscript}
            className="group relative h-3 w-full cursor-pointer"
          >
            {isLive ? (
              <>
                <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-player-track" />
                <span className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-live" style={{ insetInlineStart: 0, width: `${pct}%` }} />
                <span className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-live shadow" style={{ insetInlineStart: `calc(${pct}% - 6px)` }} />
              </>
            ) : (
              <span className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-between">
                {Array.from({ length: 56 }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-[6px] w-[1.5px] rounded-full ${(i / 56) * 100 <= pct ? 'bg-player-ink' : 'bg-player-track'}`}
                  />
                ))}
              </span>
            )}
          </button>
        </div>

        {/* zone 3 — controls */}
        <div className="flex shrink-0 items-center gap-1 text-player-ink">
          <IconCircleLabel label={dict.player.rewind15} onClick={() => props.onSkip(-15)}>
            <RewindCircleIcon size={20} />
          </IconCircleLabel>
          <button
            type="button"
            onClick={props.onPlayPause}
            aria-label={playing ? dict.player.pause : dict.player.play}
            className="grid h-8 w-8 place-items-center rounded-full text-player-ink hover:bg-white/10"
          >
            {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
          </button>
          <IconCircleLabel label={dict.player.forward15} onClick={() => props.onSkip(15)}>
            <ForwardCircleIcon size={20} />
          </IconCircleLabel>

          {/* volume — icon toggles mute, slider sets level */}
          <div className="ms-1 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => props.onVolumeChange(props.volume > 0 ? 0 : 1)}
              aria-label={dict.player.volume}
              className={`grid h-7 w-7 place-items-center transition-colors ${props.volume > 0 ? 'text-player-faint hover:text-player-ink' : 'text-player-faint/40'}`}
            >
              <VolumeIcon size={18} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={props.volume}
              onChange={(e) => props.onVolumeChange(parseFloat(e.target.value))}
              aria-label={dict.player.volume}
              className="h-1 w-16 cursor-pointer accent-[#ECECEA]"
            />
          </div>

          {props.onClose && (
            <button type="button" onClick={props.onClose} aria-label={dict.player.close} className="ms-1 grid h-7 w-7 place-items-center text-player-faint hover:text-player-ink">
              <CloseIcon size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function IconCircleLabel({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative grid h-7 w-7 place-items-center text-player-faint hover:text-player-ink"
    >
      {children}
      <span className="pointer-events-none absolute inset-0 grid place-items-center text-[7px] font-semibold" dir="ltr">
        15
      </span>
    </button>
  )
}
