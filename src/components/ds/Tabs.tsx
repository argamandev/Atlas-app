import * as React from 'react'
import { cn } from '@/lib/utils'

// Bold near-black active tab with an underline indicator; lighter inactive tabs
// (brief §3.6.6). One shared Tabs used by Company + Live Transcript.
export interface TabItem {
  key: string
  label: string
}

export function Tabs({
  items,
  activeKey,
  onChange,
  trailing,
  className,
}: {
  items: TabItem[]
  activeKey: string
  onChange: (key: string) => void
  trailing?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between border-b border-hairline', className)}>
      <div className="flex items-center gap-5">
        {items.map((t) => {
          const active = t.key === activeKey
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px border-b-2 pb-2.5 pt-1 text-sm transition-colors',
                active
                  ? 'border-ink font-semibold text-ink'
                  : 'border-transparent font-medium text-ink-faint hover:text-ink-muted',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      {trailing ? <div className="flex items-center">{trailing}</div> : null}
    </div>
  )
}
