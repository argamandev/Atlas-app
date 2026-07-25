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
          className="hidden w-10 shrink-0 items-start justify-center border-e border-hairline bg-shell pt-4 text-ink-faint transition-colors hover:text-ink lg:flex"
        >
          <ChevronRightIcon size={18} className="rtl:rotate-180" />
        </button>
      ) : (
        <aside className="app-scroll hidden w-[312px] shrink-0 flex-col overflow-y-auto border-e border-hairline bg-shell p-5 lg:flex">
          <div className="mb-[18px] flex items-center justify-between">
            {title ? (
              // design panel labels are system caps (line 190), not mono
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#767676]">
                {title}
              </span>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title={dict.nav.collapseSidebar}
              className="text-[15px] leading-none text-ink-faint transition-colors hover:text-ink"
            >
              <span className="rtl:hidden">«</span>
              <span className="hidden rtl:inline">»</span>
            </button>
          </div>
          {panel}
        </aside>
      )}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-shell">{children}</main>
    </div>
  )
}
