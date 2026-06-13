'use client'

import * as React from 'react'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { CollapseIcon, ChevronRightIcon } from '@/components/ds/icons'

// A collapsible second column (the "expanded panel" layer). Soft-separated from the main
// content by a tinted background (no hard divider). Collapsing recenters the main content.
export function CollapsiblePanel({
  title,
  panel,
  children,
}: {
  title?: string
  panel: React.ReactNode
  children: React.ReactNode
}) {
  const { dict } = useI18n()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex min-h-0 flex-1">
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title={title}
          className="hidden w-10 shrink-0 items-start justify-center bg-panel pt-3 text-ink-faint transition-colors hover:text-ink lg:flex"
        >
          <ChevronRightIcon size={18} />
        </button>
      ) : (
        <aside className="app-scroll hidden w-[320px] shrink-0 flex-col overflow-y-auto bg-panel p-3 lg:flex">
          <div className="mb-2 flex items-center justify-between px-1">
            {title ? <span className="text-xs font-medium text-ink-faint">{title}</span> : <span />}
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title={dict.nav.collapseSidebar}
              className="text-ink-faint transition-colors hover:text-ink"
            >
              <CollapseIcon size={15} />
            </button>
          </div>
          {panel}
        </aside>
      )}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">{children}</main>
    </div>
  )
}
