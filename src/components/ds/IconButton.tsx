import * as React from 'react'
import { cn } from '@/lib/utils'

// Action hierarchy through fill, not colour (brief §3.6.7):
//  - line:    bare gray line icon (the default, secondary actions)
//  - primary: the one solid-filled action (the send arrow)
//  - framed:  a line icon in a rounded-square outline (special-cased, the slash)
type Variant = 'line' | 'primary' | 'framed'

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  variant?: Variant
  active?: boolean
  size?: number
}

const variantClass: Record<Variant, string> = {
  line: 'text-ink-faint hover:text-ink hover:bg-subtle rounded-md',
  primary: 'text-white rounded-full',
  framed: 'text-ink-faint hover:text-ink rounded-md border border-hairline',
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'line', active = false, size = 32, className, children, type, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      aria-pressed={variant === 'line' ? active : undefined}
      className={cn(
        'inline-flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-default',
        variantClass[variant],
        variant === 'primary' && (active ? 'bg-ink' : 'bg-ink-faint hover:bg-ink-muted'),
        variant === 'line' && active && 'text-ink bg-subtle',
        className
      )}
      style={{ width: size, height: size }}
      {...rest}
    >
      {children}
    </button>
  )
})
