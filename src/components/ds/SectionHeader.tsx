import * as React from 'react'
import { cn } from '@/lib/utils'

// Quiet section grouping (brief §3.6.5): a small light-gray label; whitespace does
// the separating, not dividers. Optional trailing action (e.g. a Filter control).
export function SectionHeader({
  label,
  action,
  className,
}: {
  label: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between px-1', className)}>
      {/* design section labels are SYSTEM-font caps (probed 11px/.14em/600 #8A867C), not mono */}
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A867C]">{label}</span>
      {action ? <div className="flex items-center text-ink-faint">{action}</div> : null}
    </div>
  )
}
