'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Avatar } from '@/components/ds/Avatar'
import { formatClock } from '@/lib/i18n/format'
import type { WordTimedTranscript } from '@/lib/live/syncEngine'

// Karaoke transcript (brief §5.5): spoken words solid near-black, the active word
// highlighted, upcoming words faded gray. Click any word to seek the audio.
export function TranscriptBody({
  transcript,
  activeIndex,
  autoScroll,
  onWordClick,
  karaoke = true,
}: {
  transcript: WordTimedTranscript
  activeIndex: number
  autoScroll: boolean
  onWordClick: (start: number) => void
  /** false for line-level (no word timings) transcripts — render as a plain read view */
  karaoke?: boolean
}) {
  const activeWordRef = useRef<HTMLSpanElement>(null)

  // starting global word index per segment
  const offsets = useMemo(() => {
    const out: number[] = []
    let acc = 0
    for (const seg of transcript.segments) {
      out.push(acc)
      acc += seg.words.length
    }
    return out
  }, [transcript])

  useEffect(() => {
    if (autoScroll && activeWordRef.current) {
      activeWordRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeIndex, autoScroll])

  return (
    <div className="space-y-7">
      {transcript.segments.map((seg, si) => (
        <div key={seg.id} className="flex gap-3">
          <Avatar name={seg.speakerName} size={36} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-ink">{seg.speakerName}</span>
              {seg.role && <span className="text-xs text-ink-muted">{seg.role}</span>}
              <span className="ms-auto text-xs text-ink-faint tabular-nums" dir="ltr">
                {formatClock(seg.start)}
              </span>
            </div>
            <p dir="auto" className="mt-1.5 text-[15px] leading-[1.9] text-ink">
              {seg.words.map((w, wi) => {
                const gi = offsets[si] + wi
                // Without word timings, render every word as plain spoken text (no advancing
                // highlight / fade) — a clean read view rather than a stuck cursor.
                const isActive = karaoke && gi === activeIndex
                const spoken = !karaoke || gi <= activeIndex
                return (
                  <span
                    key={wi}
                    ref={isActive ? activeWordRef : undefined}
                    onClick={() => onWordClick(w.start)}
                    data-wi={gi}
                    data-start={w.start}
                    data-state={isActive ? 'active' : spoken ? 'spoken' : 'upcoming'}
                    className={[
                      'cursor-pointer rounded-[3px] transition-colors',
                      isActive ? 'bg-subtle text-ink' : spoken ? 'text-ink' : 'text-ink-faint',
                      'hover:bg-subtle/70',
                    ].join(' ')}
                  >
                    {w.text}{' '}
                  </span>
                )
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
