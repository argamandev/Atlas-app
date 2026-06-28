'use client'
// ⚠️ LEGACY (Timlul) — slated for deletion ~2026-07. Do NOT use as a pattern for Atlas. See LEGACY.md

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { Transcript } from '@/lib/types'

interface TranscriptActionsProps {
  transcript: Transcript
  isAdmin?: boolean
  transcriptId?: string
  youtubeUrl?: string
}

function buildPlainText(transcript: Transcript): string {
  const speakerMap = Object.fromEntries(transcript.speakers.map(s => [s.id, s]))
  const lines: string[] = [
    `שיחת משקיעים — ${transcript.company}`,
    `${transcript.quarter} | ${transcript.date}`,
    `משך: ${transcript.duration}`,
    '',
    '='.repeat(60),
    '',
  ]
  for (const section of transcript.sections) {
    lines.push(`## ${section.title}`)
    lines.push('')
    for (const line of section.lines) {
      const speaker = speakerMap[line.speakerId]
      const speakerLabel = speaker
        ? `${speaker.name}${speaker.affiliation ? ` (${speaker.affiliation})` : ''}`
        : line.speakerId
      lines.push(`[${line.timestamp}] ${speakerLabel}:`)
      lines.push(line.text)
      lines.push('')
    }
  }
  return lines.join('\n')
}

export function TranscriptActions({ transcript, isAdmin, transcriptId, youtubeUrl }: TranscriptActionsProps) {
  const [copied, setCopied] = useState(false)
  const [retranscribing, setRetranscribing] = useState(false)

  async function handleRetranscribe() {
    if (!youtubeUrl) return
    if (!confirm('תמלל מחדש? יווצר תמלול חדש — הקיים יישמר.')) return
    setRetranscribing(true)
    try {
      const res = await fetch('/api/transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl, force: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה')
      window.location.href = `/processing/${data.id}`
    } catch (e) {
      alert(e instanceof Error ? e.message : 'שגיאה')
      setRetranscribing(false)
    }
  }

  function handleCopy() {
    const text = buildPlainText(transcript)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleExportTxt() {
    const text = buildPlainText(transcript)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${transcript.company}-${transcript.quarter}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportPdf() {
    // Native browser print → "Save as PDF". This is the only engine that
    // renders Hebrew next to numbers correctly. The @media print CSS in
    // globals.css produces a clean white, chrome-free document.
    window.print()
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {isAdmin && youtubeUrl && (
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRetranscribe}
          disabled={retranscribing}
          title="תמלל מחדש (אדמין בלבד)"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {retranscribing ? 'מתמלל...' : 'תמלל מחדש'}
        </Button>
      )}
      <Button
        variant="secondary"
        size="sm"
        onClick={handleCopy}
      >
        {copied ? (
          <>
            <svg className="w-3.5 h-3.5 text-success" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            הועתק
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            העתק תמלול
          </>
        )}
      </Button>

      <Button variant="secondary" size="sm" onClick={handleExportTxt}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        ייצוא TXT
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={handleExportPdf}
        title="ייפתח חלון הדפסה — בחרו יעד 'שמירה כ-PDF' / 'Save as PDF'"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        ייצוא PDF
      </Button>
    </div>
  )
}
