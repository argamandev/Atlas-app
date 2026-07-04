'use client'

import { cn } from '@/lib/utils'
import { BEAM_RING_DELAYS, BEAM_RING_ANIMATION, BEAM_DOT_ANIMATION } from '@/lib/design/anim'

// The "beaming live" radar indicator (design ref: design-import/reference/live-beam.html):
// a solid live ring around the avatar, three staggered expanding pulse rings, and a
// slow-blinking corner dot. The gap between ring and avatar must match the surface
// behind it, so callers say where the beam sits.
const SURFACE_BG = { card: 'bg-canvas', page: 'bg-shell', rail: 'bg-rail' } as const
const SURFACE_BORDER = { card: 'border-canvas', page: 'border-shell', rail: 'border-rail' } as const

export function LiveBeamAvatar({
  size = 44,
  surface = 'card',
  className,
  children,
}: {
  /** avatar tile diameter in px (outer beam box is 1.2×) */
  size?: number
  surface?: keyof typeof SURFACE_BG
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn('relative inline-flex flex-none items-center justify-center', className)}
      style={{ width: size * 1.2, height: size * 1.2 }}
    >
      {BEAM_RING_DELAYS.map((delay) => (
        <span
          key={delay}
          data-beam-ring
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-live opacity-0"
          style={{ animation: BEAM_RING_ANIMATION, animationDelay: delay }}
        />
      ))}
      <span
        className="relative z-[3] flex items-center justify-center rounded-full bg-live"
        style={{ width: size, height: size, padding: Math.max(2, size * 0.055) }}
      >
        <span
          className={cn(
            'flex h-full w-full items-center justify-center overflow-hidden rounded-full',
            SURFACE_BG[surface]
          )}
          style={{ padding: Math.max(2.5, size * 0.07) }}
        >
          {children}
        </span>
      </span>
      <span
        data-beam-dot
        className={cn('absolute z-[4] rounded-full border-[3px] bg-live', SURFACE_BORDER[surface])}
        style={{
          width: Math.round(size * 0.27),
          height: Math.round(size * 0.27),
          bottom: size * 0.02,
          right: size * 0.02,
          animation: BEAM_DOT_ANIMATION,
        }}
      />
    </span>
  )
}
