'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { RecentTranscript } from '@/lib/types'
import { quarterSortKey } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'

interface CompaniesViewProps {
  transcripts: RecentTranscript[]
}

interface CompanyGroup {
  key: string
  name: string
  items: RecentTranscript[]
}

export function CompaniesView({ transcripts }: CompaniesViewProps) {
  const groups = useMemo<CompanyGroup[]>(() => {
    const map = new Map<string, CompanyGroup>()
    for (const t of transcripts) {
      const name = (t.company || 'ללא שם').trim()
      const key = name.toLowerCase().replace(/\s+/g, ' ')
      if (!map.has(key)) map.set(key, { key, name, items: [] })
      map.get(key)!.items.push(t)
    }
    // Sort transcripts within each company by quarter desc (newest on top),
    // tie-break by createdAt desc.
    const list = Array.from(map.values())
    list.forEach((g) => {
      g.items.sort((a, b) => {
        const q = quarterSortKey(b.quarter) - quarterSortKey(a.quarter)
        if (q !== 0) return q
        return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
      })
    })
    // Sort companies alphabetically (Hebrew-aware)
    return list.sort((a, b) => a.name.localeCompare(b.name, 'he'))
  }, [transcripts])

  const [open, setOpen] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? groups.filter(g => g.name.includes(search.trim()))
    : groups

  function toggle(key: string) {
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 max-w-5xl mx-auto w-full" dir="rtl">
      <div className="mb-6">
        <p className="text-xs text-accent tracking-wide uppercase mb-1 font-medium">חברות</p>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">החברות שלי</h1>
        <p className="text-sm text-muted mt-1">{groups.length} חברות · {transcripts.length} תמלולים</p>
      </div>

      {/* Search */}
      <div className="mb-5 relative">
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש חברה..."
          dir="rtl"
          className="w-full bg-card border border-border rounded px-4 py-2.5 pr-10 text-sm text-text-primary placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
        />
      </div>

      {groups.length === 0 ? (
        <div className="border border-border/50 border-dashed rounded p-12 text-center">
          <p className="text-sm text-muted">אין תמלולים עדיין</p>
          <Link href="/dashboard" className="text-xs text-accent hover:underline mt-2 inline-block">
            צרו תמלול חדש
          </Link>
        </div>
      ) : (
        <>
        {filtered.length === 0 && (
          <p className="text-sm text-muted text-center py-8">אין תוצאות עבור &quot;{search}&quot;</p>
        )}
        <div className="border border-border rounded overflow-hidden divide-y divide-border bg-card">
          {filtered.map(group => {
            const isOpen = open.has(group.key)
            return (
              <div key={group.key}>
                {/* Company row */}
                <button
                  onClick={() => toggle(group.key)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors text-right"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <svg
                      className={`w-4 h-4 text-muted flex-shrink-0 transition-transform ${isOpen ? '-rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-semibold text-text-primary truncate">{group.name}</span>
                  </div>
                  <span className="font-mono-num text-2xs text-muted border border-border rounded px-2 py-0.5 flex-shrink-0">
                    {group.items.length} {group.items.length === 1 ? 'תמלול' : 'תמלולים'}
                  </span>
                </button>

                {/* Expanded transcripts (sorted by quarter desc) */}
                {isOpen && (
                  <div className="bg-bg/40 divide-y divide-border/50">
                    {group.items.map(t => {
                      const inner = (
                        <div className="flex items-center justify-between gap-4 px-5 py-3 pr-12">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono-num text-xs text-accent whitespace-nowrap" dir="ltr">
                              {t.quarter || '—'}
                            </span>
                            <span className="text-xs text-text-secondary truncate">
                              {t.date}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {t.duration && (
                              <span className="text-2xs text-muted font-mono-num" dir="ltr">{t.duration}</span>
                            )}
                            <Badge status={t.status} />
                          </div>
                        </div>
                      )
                      return t.status === 'completed' ? (
                        <Link key={t.id} href={`/transcript/${t.id}`} className="block hover:bg-white/[0.03] transition-colors group">
                          {inner}
                        </Link>
                      ) : (
                        <div key={t.id} className="opacity-70">{inner}</div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        </>
      )}
    </div>
  )
}
