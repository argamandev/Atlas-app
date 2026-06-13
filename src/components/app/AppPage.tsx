import * as React from 'react'
import { cn } from '@/lib/utils'

// Layout for a page inside the shell: an optional contextual ExpandedPanel (second
// column) + the main content area. The NavRail is provided by the (persistent) layout.
export function ExpandedPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <aside
      className={cn(
        'app-scroll hidden w-[320px] shrink-0 flex-col gap-2 overflow-y-auto p-3 lg:flex',
        className,
      )}
    >
      {children}
    </aside>
  )
}

export function AppPage({
  panel,
  children,
  contentClassName,
}: {
  panel?: React.ReactNode
  children: React.ReactNode
  contentClassName?: string
}) {
  return (
    <div className="flex min-h-0 flex-1">
      {panel ? <ExpandedPanel>{panel}</ExpandedPanel> : null}
      <main className={cn('relative flex min-w-0 flex-1 flex-col overflow-hidden', contentClassName)}>
        {children}
      </main>
    </div>
  )
}
