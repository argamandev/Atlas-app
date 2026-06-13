import * as React from 'react'
import { cn } from '@/lib/utils'

// The "floating surface" recipe (brief §3.6.3): a rounded card with soft diffuse
// shadow and NO hard border. One elevation recipe for window / popover / player.
type Elevation = 'window' | 'popover' | 'player' | 'none'
type Tone = 'canvas' | 'panel' | 'charcoal'

const toneClass: Record<Tone, string> = {
  canvas: 'bg-canvas text-ink',
  panel: 'bg-panel text-ink',
  charcoal: 'bg-player text-player-ink',
}

const elevationClass: Record<Elevation, string> = {
  window: 'shadow-window',
  popover: 'shadow-popover',
  player: 'shadow-player',
  none: '',
}

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: Tone
  elevation?: Elevation
}

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { tone = 'canvas', elevation = 'none', className, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cn('rounded-card', toneClass[tone], elevationClass[elevation], className)} {...rest}>
      {children}
    </div>
  )
})
