'use client'

import { useState } from 'react'

export function DashboardTopBar() {
  const [search, setSearch] = useState('')

  return (
    <div className="h-14 border-b border-border bg-bg-secondary/50 flex items-center justify-between px-6">
      {/* Search */}
      <div className="relative max-w-xs w-full">
        <svg
          className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <circle cx="11" cy="11" r="8" />
          <path strokeLinecap="round" d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש תמלולים..."
          className="w-full bg-card border border-border rounded h-8 pr-9 pl-3 text-xs text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-colors"
        />
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-3">
        <button className="w-8 h-8 rounded hover:bg-white/5 flex items-center justify-center text-muted hover:text-text-secondary transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
        </button>
        <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center cursor-pointer">
          <span className="text-xs font-semibold text-accent">מ</span>
        </div>
      </div>
    </div>
  )
}
