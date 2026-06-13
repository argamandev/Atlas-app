import * as React from 'react'
import { cn } from '@/lib/utils'

// The single selection / active treatment (brief §3.6.4): a subtle light-gray rounded
// rectangle. Reused by sidebar nav, @-mention rows, hovered list rows — never a new colour.
export function selectionClasses(active?: boolean): string {
  return active ? 'bg-subtle' : 'hover:bg-subtle/70'
}

export interface SelectableRowProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

export const SelectableRow = React.forwardRef<HTMLButtonElement, SelectableRowProps>(function SelectableRow(
  { active, className, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(
        'flex w-full items-center gap-3 rounded-md text-start transition-colors',
        selectionClasses(active),
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
