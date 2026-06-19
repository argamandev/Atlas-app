'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Avatar } from '@/components/ds/Avatar'
import { SectionHeader } from '@/components/ds/SectionHeader'
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
  sub,
  isLive = false,
  collapsed,
  onToggleCollapsed,
}: {
  transcript: WordTimedTranscript
  activeSegmentIndex: number
  onSeek: (start: number) => void
  companyName: string
  sub?: string
  isLive?: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const { dict } = useI18n()

  // Group consecutive same-speaker segments into "sections" (one navigable part each).
  const parts = useMemo(() => {
    const out: { key: string; speaker: string; role: string | null; start: number; segmentId: string; from: number; to: number }[] = []
    transcript.segments.forEach((seg, i) => {
      const last = out[out.length - 1]
      if (last && last.speaker === seg.speakerName) {
        last.to = i
      } else {
        out.push({ key: seg.id, speaker: seg.speakerName, role: seg.role ?? null, start: seg.start, segmentId: seg.id, from: i, to: i })
      }
    })
    return out
  }, [transcript])

  const speakers = useMemo(() => {
    const seen = new Map<string, { name: string; role: string | null }>()
    for (const seg of transcript.segments) {
      if (!seen.has(seg.speakerName)) seen.set(seg.speakerName, { name: seg.speakerName, role: seg.role ?? null })
    }
    return Array.from(seen.values())
  }, [transcript])

  function jump(part: { start: number; segmentId: string }) {
    onSeek(part.start)
    if (typeof document !== 'undefined') {
      document.querySelector(`[data-segment-id="${CSS.escape(part.segmentId)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapsed}
        title={companyName}
        className="hidden w-10 shrink-0 items-start justify-center border-e border-hairline bg-panel pt-3 text-ink-faint transition-colors hover:text-ink lg:flex"
      >
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </button>
    )
  }

  return (
    <aside dir="rtl" className="app-scroll hidden w-[300px] shrink-0 flex-col overflow-y-auto border-e border-hairline bg-panel lg:flex">
      <div className="flex items-start justify-between px-4 pb-1 pt-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-ink">{companyName}</h2>
          {sub && <div className="mt-0.5 truncate text-xs text-ink-faint">{sub}</div>}
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={dict.nav.collapseSidebar}
          className="shrink-0 text-ink-faint transition-colors hover:text-ink"
        >
          <CollapseIcon size={15} />
        </button>
      </div>

      <div className="px-3 pb-24">
        <SectionHeader label={dict.live.parts} className="px-2 pb-1 pt-4" />
        {parts.map((p) => {
          const active = activeSegmentIndex >= p.from && activeSegmentIndex <= p.to
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => jump(p)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-start transition-colors ${active ? 'bg-subtle' : 'hover:bg-subtle/60'}`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  active ? (isLive ? 'bg-live animate-pulse-live' : 'bg-ink') : 'bg-ink-faint/40'
                }`}
              />
              <span className={`min-w-0 flex-1 truncate text-sm ${active ? 'font-semibold text-ink' : 'font-medium text-ink-muted'}`}>
                {p.speaker}
              </span>
              <span className="shrink-0 text-xs text-ink-faint tabular-nums" dir="ltr">
                {formatClock(p.start)}
              </span>
            </button>
          )
        })}

        <SectionHeader label={dict.live.speakers} className="px-2 pb-1 pt-6" />
        {speakers.map((s) => (
          <div key={s.name} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <Avatar name={s.name} size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{s.name}</div>
              {s.role && <div className="truncate text-xs text-ink-faint">{s.role}</div>}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
