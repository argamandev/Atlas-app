'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/ds/Avatar'
import { formatClock } from '@/lib/i18n/format'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import type { WordTimedTranscript } from '@/lib/live/syncEngine'

// Karaoke transcript (brief §5.5): spoken words solid near-black, the active word
// highlighted, upcoming words faded gray. Click any word to seek the audio.
export function TranscriptBody({
  transcript,
  activeIndex,
  autoScroll,
  onWordClick,
  karaoke = true,
  onRenameSpeaker,
  searchMatches = [],
  activeMatch = -1,
  followLabel,
}: {
  transcript: WordTimedTranscript
  activeIndex: number
  autoScroll: boolean
  onWordClick: (start: number) => void
  /** false for line-level (no word timings) transcripts — render as a plain read view */
  karaoke?: boolean
  onRenameSpeaker?: (segmentId: string, speakerId: string, oldName: string, newName: string) => void
  /** global word indices matching the search query */
  searchMatches?: number[]
  /** the global word index of the currently-focused match (next/prev) */
  activeMatch?: number
  /** label for the "back to current word" chip shown after the user scrolls away from auto-follow */
  followLabel?: string
}) {
  const { dict } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const activeWordRef = useRef<HTMLSpanElement>(null)
  const activeMatchRef = useRef<HTMLSpanElement>(null)
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [following, setFollowing] = useState(true) // auto-scroll follows the active word; a hand scroll pauses it
  const matchSet = useMemo(() => new Set(searchMatches), [searchMatches])

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

  // Follow the active (spoken/played) word — but only while "following". A hand scroll pauses it.
  useEffect(() => {
    if (autoScroll && following && activeWordRef.current) {
      activeWordRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeIndex, autoScroll, following])

  // Pause auto-follow the moment the user scrolls by hand. We listen for wheel/touch — genuine user input
  // that is NEVER fired by our own programmatic scrollIntoView — so the page stops yanking back to the word.
  useEffect(() => {
    let sc: HTMLElement | null = rootRef.current?.parentElement ?? null
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement
    const target: HTMLElement | Window = sc ?? window
    const pause = () => setFollowing(false)
    target.addEventListener('wheel', pause, { passive: true })
    target.addEventListener('touchmove', pause, { passive: true })
    return () => {
      target.removeEventListener('wheel', pause)
      target.removeEventListener('touchmove', pause)
    }
  }, [])

  // Toggling the master auto-scroll switch (re)engages following.
  useEffect(() => {
    setFollowing(true)
  }, [autoScroll])

  useEffect(() => {
    if (activeMatch >= 0 && activeMatchRef.current) {
      activeMatchRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeMatch])

  return (
    <div ref={rootRef} dir="rtl" className="select-mark space-y-7 text-right">
      {transcript.segments.map((seg, si) => (
        <div key={seg.id} data-segment-id={seg.id} data-speaker={seg.speakerName} className="flex gap-3">
          <Avatar name={seg.speakerName} size={36} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              {editing?.id === seg.id ? (
                <input
                  autoFocus
                  dir="rtl"
                  value={editing.value}
                  onChange={(e) => setEditing({ id: seg.id, value: e.target.value })}
                  onBlur={() => {
                    const v = editing.value.trim()
                    if (v && v !== seg.speakerName)
                      onRenameSpeaker?.(seg.id, seg.speakerId, seg.speakerName, v)
                    setEditing(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  className="w-40 rounded border border-hairline bg-canvas px-1.5 py-0.5 text-sm font-bold text-ink outline-none"
                />
              ) : onRenameSpeaker ? (
                <button
                  type="button"
                  onClick={() => setEditing({ id: seg.id, value: seg.speakerName })}
                  className="text-sm font-bold text-ink hover:underline"
                  title={dict.live.editSpeaker}
                >
                  {seg.speakerName}
                </button>
              ) : (
                <span className="text-[15px] font-bold text-ink">{seg.speakerName}</span>
              )}
              {seg.role && <span className="text-[13px] text-ink-muted">{seg.role}</span>}
              <span className="ms-auto text-xs text-ink-faint tabular-nums" dir="ltr">
                {formatClock(seg.start)}
              </span>
            </div>
            <p className="mt-2 text-[17px] leading-[1.85] text-ink">
              {seg.words.map((w, wi) => {
                const gi = offsets[si] + wi
                // Without word timings, render every word as plain spoken text (no advancing
                // highlight / fade) — a clean read view rather than a stuck cursor.
                const isActive = karaoke && gi === activeIndex
                const spoken = !karaoke || gi <= activeIndex
                const isMatch = matchSet.has(gi)
                const isActiveMatch = gi === activeMatch
                return (
                  <span
                    key={wi}
                    ref={isActiveMatch ? activeMatchRef : isActive ? activeWordRef : undefined}
                    onClick={() => onWordClick(w.start)}
                    data-wi={gi}
                    data-start={w.start}
                    data-state={isActive ? 'active' : spoken ? 'spoken' : 'upcoming'}
                    className={[
                      'cursor-pointer rounded-[3px] transition-colors',
                      isActive ? 'bg-subtle text-ink' : spoken ? 'text-ink' : 'text-ink-faint',
                      'hover:bg-subtle/70',
                      isMatch ? (isActiveMatch ? 'bg-[#C04A00]/30' : 'bg-[#C04A00]/12') : '',
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
      {autoScroll && !following && (
        <div className="pointer-events-none sticky bottom-24 z-20 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setFollowing(true)
              activeWordRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
            }}
            className="pointer-events-auto flex items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-xs font-semibold text-white shadow-popover transition-opacity hover:opacity-90"
          >
            <span aria-hidden>↓</span> {followLabel ?? dict.live.backToLive}
          </button>
        </div>
      )}
    </div>
  )
}
