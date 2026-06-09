'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Transcript, Speaker, SpeakerRole, Highlight } from '@/lib/types'

interface TranscriptBodyProps {
  transcript: Transcript
  editing?: boolean
  onLineChange?: (sectionId: string, lineId: string, text: string) => void
  onAddHighlight?: (sectionId: string, lineId: string, range: Highlight) => void
  onRemoveHighlight?: (sectionId: string, lineId: string, index: number) => void
}

const roleStyles: Record<SpeakerRole, { name: string; bar: string }> = {
  ceo: {
    name: 'text-white font-semibold',
    bar: 'bg-white/70',
  },
  cfo: {
    name: 'text-accent font-medium',
    bar: 'bg-accent',
  },
  analyst: {
    name: 'text-text-secondary font-medium',
    bar: 'bg-text-secondary/50',
  },
  moderator: {
    name: 'text-muted font-normal',
    bar: 'bg-muted/40',
  },
}

// Compute character offsets of the current selection within an element,
// robust across mixed text/<mark> nodes.
function getOffsetsWithin(el: HTMLElement): Highlight | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.commonAncestorContainer)) return null
  const pre = range.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(range.startContainer, range.startOffset)
  const start = pre.toString().length
  const end = start + range.toString().length
  if (end <= start) return null
  return { start, end }
}

function renderText(
  text: string,
  highlights: Highlight[] | undefined,
  flags: { text: string; reason: string }[] | undefined,
  onRemove?: (index: number) => void,
) {
  type Mark = { start: number; end: number; kind: 'hl' | 'flag'; title?: string; hi?: number }
  const marks: Mark[] = []
  ;(highlights ?? []).forEach((h, i) => marks.push({ start: h.start, end: h.end, kind: 'hl', hi: i }))
  ;(flags ?? []).forEach((f) => {
    const idx = text.indexOf(f.text)
    if (idx >= 0) marks.push({ start: idx, end: idx + f.text.length, kind: 'flag', title: 'מומלץ לשמוע את ההקלטה כדי לוודא את התמלול.' })
  })
  if (marks.length === 0) return text
  marks.sort((a, b) => a.start - b.start)

  const out: React.ReactNode[] = []
  let cursor = 0
  marks.forEach((m, k) => {
    const start = Math.max(cursor, Math.min(m.start, text.length))
    const end = Math.max(start, Math.min(m.end, text.length))
    if (start > cursor) out.push(<span key={`t${cursor}`}>{text.slice(cursor, start)}</span>)
    if (end <= start) return
    if (m.kind === 'flag') {
      out.push(
        <mark
          key={`f${k}`}
          title={m.title}
          className="bg-amber-400/25 text-text-primary rounded-sm px-0.5 underline decoration-dotted decoration-amber-400/70 cursor-help"
        >
          {text.slice(start, end)}
        </mark>,
      )
    } else {
      out.push(
        <mark
          key={`h${m.hi}`}
          onClick={onRemove ? () => onRemove(m.hi as number) : undefined}
          className={cn(
            'bg-accent/25 text-text-primary rounded-sm px-0.5',
            onRemove && 'cursor-pointer hover:bg-accent/40',
          )}
          title={onRemove ? 'הסר סימון' : undefined}
        >
          {text.slice(start, end)}
        </mark>,
      )
    }
    cursor = end
  })
  if (cursor < text.length) out.push(<span key="tail">{text.slice(cursor)}</span>)
  return out
}

export function TranscriptBody({
  transcript,
  editing = false,
  onLineChange,
  onAddHighlight,
  onRemoveHighlight,
}: TranscriptBodyProps) {
  const speakerMap: Record<string, Speaker> = Object.fromEntries(
    transcript.speakers.map(s => [s.id, s]),
  )

  // Floating "סמן" button state for the active text selection (read mode only)
  const [sel, setSel] = useState<{
    sectionId: string
    lineId: string
    range: Highlight
    x: number
    y: number
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  function handleMouseUp(sectionId: string, lineId: string, el: HTMLElement) {
    if (editing || !onAddHighlight) return
    const range = getOffsetsWithin(el)
    if (!range) {
      setSel(null)
      return
    }
    const rect = window.getSelection()?.getRangeAt(0).getBoundingClientRect()
    const wrap = containerRef.current?.getBoundingClientRect()
    if (!rect || !wrap) return
    setSel({
      sectionId,
      lineId,
      range,
      x: rect.left - wrap.left + rect.width / 2,
      y: rect.top - wrap.top,
    })
  }

  function confirmHighlight() {
    if (sel && onAddHighlight) onAddHighlight(sel.sectionId, sel.lineId, sel.range)
    setSel(null)
    window.getSelection()?.removeAllRanges()
  }

  return (
    <div className="space-y-8 relative" ref={containerRef}>
      {/* Floating mark button */}
      {sel && (
        <button
          onClick={confirmHighlight}
          className="absolute z-50 -translate-x-1/2 -translate-y-full -mt-1 bg-accent text-white text-xs font-medium px-3 py-1.5 rounded shadow-lg hover:bg-accent-hover transition-colors flex items-center gap-1.5"
          style={{ left: sel.x, top: sel.y }}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
          </svg>
          סמן
        </button>
      )}

      {transcript.sections.map((section) => (
        <div key={section.id} id={section.id}>
          {/* Section heading */}
          <div className="mb-6 pb-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary" dir="rtl">
              {section.title}
            </h3>
          </div>

          {/* Lines — speaker label shown only when speaker changes */}
          <div className="space-y-0">
            {section.lines.map((line, lineIdx) => {
              const speaker = speakerMap[line.speakerId]
              const style = (speaker ? roleStyles[speaker.role] : null) ?? roleStyles.moderator
              const prevLine = section.lines[lineIdx - 1]
              const speakerChanged = lineIdx === 0 || line.speakerId !== prevLine?.speakerId

              return (
                <div
                  key={line.id}
                  className={cn(
                    'transcript-line',
                    speakerChanged && lineIdx > 0 ? 'mt-8' : 'mt-0',
                  )}
                >
                  {/* Speaker label — only on first paragraph of a speaking block */}
                  {speakerChanged && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className={cn('w-0.5 h-4 rounded-full flex-shrink-0', style.bar)} />
                      <span className={cn('text-xs', style.name)}>
                        {speaker?.name ?? line.speakerId}
                      </span>
                      {speaker?.title && (
                        <span className="text-2xs text-muted">— {speaker.title}</span>
                      )}
                      {speaker?.affiliation && (
                        <span className="text-2xs text-muted">| {speaker.affiliation}</span>
                      )}
                    </div>
                  )}

                  {/* Text */}
                  {editing ? (
                    <textarea
                      value={line.text}
                      onChange={(e) => onLineChange?.(section.id, line.id, e.target.value)}
                      rows={Math.max(2, Math.ceil(line.text.length / 90))}
                      className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text-primary leading-7 focus:outline-none focus:border-accent/50 resize-y mb-2"
                      dir="rtl"
                    />
                  ) : (
                    <p
                      className="text-sm text-text-secondary leading-7 mb-1.5 px-4 -mx-4 rounded hover:bg-white/[0.015] transition-colors cursor-default"
                      onMouseUp={(e) => handleMouseUp(section.id, line.id, e.currentTarget)}
                    >
                      {renderText(
                        line.text,
                        line.highlights,
                        line.flags,
                        onRemoveHighlight
                          ? (i) => onRemoveHighlight(section.id, line.id, i)
                          : undefined,
                      )}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
