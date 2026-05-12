import { cn } from '@/lib/utils'
import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full bg-card border rounded px-4 py-2.5 text-sm text-text-primary',
          'placeholder:text-muted',
          'focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40',
          'transition-colors duration-150',
          error
            ? 'border-error/50 focus:ring-error/30 focus:border-error/50'
            : 'border-border hover:border-[#2a2a2a]',
          className
        )}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'
export { Input }
