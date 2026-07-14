'use client'

import { cn } from '@/lib/utils'
import { BEAM_RING_DELAYS, BEAM_RING_ANIMATION, BEAM_DOT_ANIMATION } from '@/lib/design/anim'

// The "beaming live" radar indicator — EXACT design anatomy (.ln-* classes, dc lines 53-60):
// a 50px item with three staggered 1.5px pulse rings, a 40px monogram circle wearing a
// 1.5px red outline (the "inner line"), and a 12px red dot pinned ON that line at the
// bottom-right, blinking in the waves' rhythm. `size` is the OUTER item box; the avatar
// circle is 0.8×. The 2px cutout borders must match the surface behind the beam.
const SURFACE_BORDER = { card: 'border-paper', page: 'border-shell', rail: 'border-rail' } as const

export function LiveBeamAvatar({
  size = 50,
  surface = 'page',
  className,
  children,
}: {
  /** outer beam box in px (design: 50; avatar circle is 0.8×, dot 0.24×) */
  size?: number
  surface?: keyof typeof SURFACE_BORDER
  className?: string
  /** the avatar content — typically the company's monogram letter */
  children: React.ReactNode
}) {
  return (
    <span
      className={cn('relative inline-flex flex-none items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {BEAM_RING_DELAYS.map((delay) => (
        <span
          key={delay}
          data-beam-ring
          className="pointer-events-none absolute inset-0 rounded-full border-[1.5px] border-live opacity-0"
          style={{ animation: BEAM_RING_ANIMATION, animationDelay: delay }}
        />
      ))}
      <span
        dir="auto"
        className={cn(
          'relative z-[2] flex items-center justify-center rounded-full border-2 bg-[#ECE9E2] font-semibold text-ink',
          SURFACE_BORDER[surface]
        )}
        style={{
          width: size * 0.8,
          height: size * 0.8,
          fontSize: Math.round(size * 0.3),
          boxShadow: '0 0 0 1.5px #CB4B2E',
        }}
      >
        {children}
      </span>
      <span
        data-beam-dot
        className={cn('absolute z-[4] rounded-full border-2 bg-live', SURFACE_BORDER[surface])}
        style={{
          width: Math.round(size * 0.24),
          height: Math.round(size * 0.24),
          bottom: Math.round(size * 0.08),
          right: Math.round(size * 0.08),
          animation: BEAM_DOT_ANIMATION,
        }}
      />
    </span>
  )
}
