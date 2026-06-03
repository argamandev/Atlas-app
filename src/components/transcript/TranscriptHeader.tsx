'use client'

import type { Transcript } from '@/lib/types'

interface TranscriptHeaderProps {
  transcript: Transcript
  editing?: boolean
  onFieldChange?: (field: 'company' | 'quarter' | 'ticker', value: string) => void
  onSpeakerNameChange?: (speakerId: string, name: string) => void
}

export function TranscriptHeader({
  transcript,
  editing = false,
  onFieldChange,
  onSpeakerNameChange,
}: TranscriptHeaderProps) {
  const formattedDate = new Date(transcript.date).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="border-b border-border pb-5 mb-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-4 text-xs text-muted">
        <span className="hover:text-text-secondary cursor-pointer transition-colors">תמלולים</span>
        <svg className="w-3 h-3 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-text-secondary">{transcript.company}</span>
      </div>

      {/* Main header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              value={transcript.company}
              onChange={(e) => onFieldChange?.('company', e.target.value)}
              className="text-2xl font-bold text-text-primary tracking-tight mb-1.5 bg-bg border border-border rounded px-2 py-1 w-full max-w-md focus:outline-none focus:border-accent/50"
              dir="rtl"
              placeholder="שם החברה"
            />
          ) : (
            <h1 className="text-2xl font-bold text-text-primary tracking-tight mb-1.5">
              {transcript.company}
            </h1>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {editing ? (
              <input
                value={transcript.quarter}
                onChange={(e) => onFieldChange?.('quarter', e.target.value)}
                className="text-sm font-medium text-accent font-mono-num bg-bg border border-border rounded px-2 py-0.5 w-24 focus:outline-none focus:border-accent/50"
                dir="ltr"
                placeholder="Q1 2026"
              />
            ) : (
              <span className="text-sm font-medium text-accent font-mono-num" dir="ltr">
                {transcript.quarter}
              </span>
            )}
            <span className="text-muted">·</span>
            <span className="text-sm text-text-secondary">{formattedDate}</span>
            <span className="text-muted">·</span>
            <span className="text-sm text-muted font-mono-num" dir="ltr">{transcript.duration}</span>
            {editing ? (
              <input
                value={transcript.ticker ?? ''}
                onChange={(e) => onFieldChange?.('ticker', e.target.value)}
                className="text-xs font-mono-num font-medium text-muted bg-card border border-border px-2 py-0.5 rounded w-24 focus:outline-none focus:border-accent/50"
                dir="ltr"
                placeholder="TICKER"
              />
            ) : (
              transcript.ticker && (
                <>
                  <span className="text-muted">·</span>
                  <span className="text-xs font-mono-num font-medium text-muted bg-card border border-border px-2 py-0.5 rounded" dir="ltr">
                    {transcript.ticker}
                  </span>
                </>
              )
            )}
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-success/30 bg-success/5 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          <span className="text-xs text-success font-medium">הושלם</span>
        </div>
      </div>

      {/* Speakers */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted">דוברים:</span>
        {transcript.speakers.map((s) => (
          editing ? (
            <input
              key={s.id}
              value={s.name}
              onChange={(e) => onSpeakerNameChange?.(s.id, e.target.value)}
              className="text-xs text-text-primary bg-bg border border-accent/40 px-2 py-0.5 rounded w-32 focus:outline-none focus:border-accent"
              dir="rtl"
              title="שינוי השם יתעדכן בכל מקום שהדובר מופיע"
            />
          ) : (
            <span
              key={s.id}
              className="text-xs text-text-secondary bg-card border border-border px-2 py-0.5 rounded"
            >
              {s.name}
              {s.affiliation && <span className="text-muted mr-1">({s.affiliation})</span>}
            </span>
          )
        ))}
      </div>
    </div>
  )
}
