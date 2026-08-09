'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Avatar } from '@/components/ds/Avatar'
import { CollapseIcon, ChevronRightIcon } from '@/components/ds/icons'
import { formatClock } from '@/lib/i18n/format'
import type { WordTimedTranscript } from '@/lib/live/syncEngine'

// Transcript context panel (the design's chapters + speakers column), kept RTL Hebrew.
// "Sections" are contiguous speaker turns — click one to jump the audio + scroll there.
// "Speakers" lists the unique participants. The active section tracks the playhead.
export function TranscriptSidePanel({
  transcript,
  activeSegmentIndex,
  onSeek,
  companyName,
  subParts,
  isLive = false,
  collapsed,
  onToggleCollapsed,
}: {
  transcript: WordTimedTranscript
  activeSegmentIndex: number
  onSeek: (start: number) => void
  companyName: string
  /** Kept as separate runs, never pre-joined — the line is bidi-mixed. See below. */
  subParts?: string[]
  isLive?: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const { dict } = useI18n()

  // Group consecutive same-speaker segments into "sections" (one navigable part each).
  const parts = useMemo(() => {
    const out: {
      key: string
      speaker: string
      role: string | null
      start: number
      segmentId: string
      from: number
      to: number
    }[] = []
    transcript.segments.forEach((seg, i) => {
      const last = out[out.length - 1]
      if (last && last.speaker === seg.speakerName) {
        last.to = i
      } else {
        out.push({
          key: seg.id,
          speaker: seg.speakerName,
          role: seg.role ?? null,
          start: seg.start,
          segmentId: seg.id,
          from: i,
          to: i,
        })
      }
    })
    return out
  }, [transcript])

  const speakers = useMemo(() => {
    const seen = new Map<string, { name: string; role: string | null }>()
    for (const seg of transcript.segments) {
      if (!seen.has(seg.speakerName))
        seen.set(seg.speakerName, { name: seg.speakerName, role: seg.role ?? null })
    }
    return Array.from(seen.values())
  }, [transcript])

  function jump(part: { start: number; segmentId: string }) {
    onSeek(part.start)
    if (typeof document !== 'undefined') {
      document
        .querySelector(`[data-segment-id="${CSS.escape(part.segmentId)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapsed}
        title={companyName}
        className="call-hair call-faint hidden w-[46px] shrink-0 flex-col items-center gap-4 border-e pt-4 transition-colors hover:call-ink lg:flex"
      >
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </button>
    )
  }

  return (
    <aside
      dir="rtl"
      className="atscroll call-hair hidden w-[270px] shrink-0 flex-col overflow-y-auto border-e py-4 lg:flex"
    >
      {/* call identity (design lines 221-232): title + mono date + collapse */}
      <div className="flex items-start justify-between gap-2 px-[18px] pb-2.5">
        <div className="min-w-0">
          <h2 className="call-ink truncate text-[13px] font-semibold leading-[1.4]" dir="auto">
            {companyName}
          </h2>
          {/* The parts arrive SEPARATE, not pre-joined, because this line mixes
              directions: "Q1 2026" is Latin and "31 במרץ 2024" is Hebrew. dir="ltr"
              on the line threw the Hebrew date's day to the wrong end. Each run gets
              its own <bdi> (which is dir="auto", so each resolves independently) and
              the container keeps the locale's direction. rules/app.md. */}
          {subParts && subParts.length > 0 && (
            <div className="call-muted mt-1 truncate font-mono-num text-[11.5px]">
              {subParts.map((part, i) => (
                <span key={part}>
                  {i > 0 && ' · '}
                  <bdi>{part}</bdi>
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={dict.nav.collapseSidebar}
          className="call-muted mt-0.5 shrink-0 transition-colors hover:call-ink"
        >
          <CollapseIcon size={15} />
        </button>
      </div>

      {/* CALL SECTIONS (design lines 233-243) */}
      <div className="call-muted px-[18px] py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em]">
        {dict.live.parts}
      </div>
      <div className="pb-6">
        {parts.map((p) => {
          const active = activeSegmentIndex >= p.from && activeSegmentIndex <= p.to
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => jump(p)}
              className={`flex w-full items-center justify-between gap-2 px-[18px] py-2 text-start transition-colors ${
                active ? 'call-panel-bg' : 'call-hover-bg'
              }`}
            >
              <span
                className={`min-w-0 flex-1 truncate text-[12.5px] ${
                  active ? 'call-ink font-semibold' : 'call-muted'
                }`}
              >
                {p.speaker}
              </span>
              <span className="call-faint shrink-0 font-mono-num text-[11px] tabular-nums" dir="ltr">
                {formatClock(p.start)}
              </span>
              {active && (
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${isLive ? 'bg-live' : 'call-ink-dot'}`}
                  style={
                    isLive
                      ? { animation: 'atpulse 2s ease-in-out infinite' }
                      : { background: 'var(--call-ink)' }
                  }
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="call-muted px-[18px] py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em]">
        {dict.live.speakers}
      </div>
      <div className="px-2 pb-24">
        {speakers.map((s) => (
          <div key={s.name} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <Avatar name={s.name} size={28} />
            <div className="min-w-0 flex-1">
              <div className="call-ink truncate text-[12.5px] font-semibold">{s.name}</div>
              {s.role && <div className="call-faint truncate text-[11px]">{s.role}</div>}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
