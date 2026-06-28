'use client'
// ⚠️ LEGACY (Timlul) — slated for deletion ~2026-07. Do NOT use as a pattern for Atlas. See LEGACY.md

import { cn } from '@/lib/utils'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
}

const variantClasses = {
  primary: 'bg-accent hover:bg-accent-hover text-white border border-accent hover:border-accent-hover',
  secondary: 'bg-card hover:bg-[#1a1a1a] text-text-primary border border-border hover:border-[#2a2a2a]',
  ghost: 'bg-transparent hover:bg-white/5 text-text-secondary hover:text-text-primary border border-transparent',
  danger: 'bg-error/10 hover:bg-error/20 text-error border border-error/30 hover:border-error/50',
}

const sizeClasses = {
  sm: 'h-7 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-base gap-2.5',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, fullWidth, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-medium tracking-normal',
          'rounded transition-all duration-150 cursor-pointer',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50',
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {loading ? (
          <>
            <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
            {children}
          </>
        ) : (
          children
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
export { Button }
