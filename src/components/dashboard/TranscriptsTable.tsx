'use client'
// ⚠️ LEGACY (Timlul) — slated for deletion ~2026-07. Do NOT use as a pattern for Atlas. See LEGACY.md

import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import type { RecentTranscript } from '@/lib/types'

interface TranscriptsTableProps {
  transcripts: RecentTranscript[]
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatCreatedAt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'numeric',
  }) + ' ' + new Date(dateStr).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function TranscriptsTable({ transcripts }: TranscriptsTableProps) {
  if (transcripts.length === 0) {
    return (
      <div className="border border-border rounded bg-card">
        <div className="py-16 text-center">
          <svg className="w-8 h-8 text-muted mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-muted">אין תמלולים עדיין</p>
          <p className="text-xs text-muted/60 mt-1">הדביקו קישור YouTube כדי להתחיל</p>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-border rounded overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-2.5 bg-bg-secondary border-b border-border">
        <span className="text-2xs text-muted uppercase tracking-wider font-medium">חברה</span>
        <span className="text-2xs text-muted uppercase tracking-wider font-medium text-center">רבעון</span>
        <span className="text-2xs text-muted uppercase tracking-wider font-medium text-center" dir="ltr">משך</span>
        <span className="text-2xs text-muted uppercase tracking-wider font-medium text-center">סטטוס</span>
        <span className="text-2xs text-muted uppercase tracking-wider font-medium text-left">נוצר</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/60 bg-card">
        {transcripts.map((t) => (
          <div
            key={t.id}
            className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3.5 items-center hover:bg-white/[0.02] transition-colors group"
          >
            {/* Company */}
            <div className="min-w-0">
              {t.status === 'completed' ? (
                <Link href={`/transcript/${t.id}`} className="block">
                  <span className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors truncate block">
                    {t.company}
                  </span>
                  {t.ticker && (
                    <span className="text-2xs text-muted font-mono-num" dir="ltr">{t.ticker}</span>
                  )}
                </Link>
              ) : (
                <div>
                  <span className="text-sm font-medium text-text-primary truncate block">{t.company}</span>
                  {t.ticker && (
                    <span className="text-2xs text-muted font-mono-num" dir="ltr">{t.ticker}</span>
                  )}
                </div>
              )}
            </div>

            {/* Quarter */}
            <span className="text-xs text-text-secondary font-mono-num whitespace-nowrap" dir="ltr">
              {t.quarter}
            </span>

            {/* Duration */}
            <span className="text-xs text-muted font-mono-num whitespace-nowrap" dir="ltr">
              {t.duration}
            </span>

            {/* Status */}
            <Badge status={t.status} />

            {/* Created */}
            <span className="text-xs text-muted whitespace-nowrap" dir="ltr">
              {formatCreatedAt(t.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
