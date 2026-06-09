'use client'

import { useState, useRef } from 'react'
import type { Transcript, Highlight } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { TranscriptHeader } from './TranscriptHeader'
import { TranscriptBody } from './TranscriptBody'
import { TranscriptActions } from './TranscriptActions'
import { SectionNav } from './SectionNav'

interface TranscriptEditorProps {
  transcript: Transcript
  id: string
  canEdit: boolean
  isAdmin?: boolean
  youtubeUrl?: string
}

export function TranscriptEditor({ transcript: initial, id, canEdit, isAdmin = false, youtubeUrl }: TranscriptEditorProps) {
  const [transcript, setTranscript] = useState<Transcript>(initial)
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const savedSnapshot = useRef<Transcript>(initial)

  function mutate(updater: (draft: Transcript) => Transcript) {
    setTranscript(prev => updater(structuredClone(prev)))
    setDirty(true)
    setSaved(false)
  }

  function updateField(field: 'company' | 'quarter' | 'ticker', value: string) {
    mutate(d => {
      if (field === 'company') d.company = value
      else if (field === 'quarter') d.quarter = value
      else d.ticker = value
      return d
    })
  }

  function updateSpeakerName(speakerId: string, name: string) {
    mutate(d => {
      const sp = d.speakers.find(s => s.id === speakerId)
      if (sp) sp.name = name
      return d
    })
  }

  function updateLineText(sectionId: string, lineId: string, text: string) {
    mutate(d => {
      const line = d.sections.find(s => s.id === sectionId)?.lines.find(l => l.id === lineId)
      if (line) line.text = text
      return d
    })
  }

  function addHighlight(sectionId: string, lineId: string, range: Highlight) {
    mutate(d => {
      const line = d.sections.find(s => s.id === sectionId)?.lines.find(l => l.id === lineId)
      if (line) line.highlights = [...(line.highlights ?? []), range]
      return d
    })
  }

  function removeHighlight(sectionId: string, lineId: string, index: number) {
    mutate(d => {
      const line = d.sections.find(s => s.id === sectionId)?.lines.find(l => l.id === lineId)
      if (line?.highlights) line.highlights = line.highlights.filter((_, i) => i !== index)
      return d
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/transcripts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formatted_data: transcript }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `שגיאה ${res.status}`)
      }
      savedSnapshot.current = transcript
      setDirty(false)
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'שמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setTranscript(savedSnapshot.current)
    setDirty(false)
    setEditing(false)
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Admin diagnostics: which engine/model produced this transcript */}
      {isAdmin && transcript.engine && (
        <div className="no-print mb-4 inline-flex items-center gap-2 text-2xs text-muted border border-border rounded px-2.5 py-1" dir="ltr">
          <span className={`w-1.5 h-1.5 rounded-full ${transcript.engine === 'ivrit' ? 'bg-success' : 'bg-amber-400'}`} />
          {transcript.engine}{transcript.model ? ` · ${transcript.model}` : ''}{transcript.processingSecs ? ` · ${Math.floor(transcript.processingSecs / 60)}m${transcript.processingSecs % 60}s` : ''}
        </div>
      )}

      {/* Admin diagnostics: auto-generated entity list (V2) used to ground name corrections */}
      {isAdmin && transcript.entities && transcript.entities.length > 0 && (
        <details className="no-print mb-4 text-2xs text-muted border border-border rounded px-2.5 py-1.5" dir="rtl">
          <summary className="cursor-pointer">ישויות שזוהו אוטומטית: {transcript.entities.length}</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {transcript.entities.map((e, i) => (
              <span key={i} className="border border-border rounded px-1.5 py-0.5 font-mono-num" dir="ltr">{e}</span>
            ))}
          </div>
        </details>
      )}

      {/* Admin diagnostics: auto-corrections applied by the Step 0 corrector */}
      {isAdmin && transcript.corrections && transcript.corrections.length > 0 && (
        <details className="no-print mb-4 text-2xs text-muted border border-border rounded px-2.5 py-1.5" dir="rtl">
          <summary className="cursor-pointer">תיקונים אוטומטיים: {transcript.corrections.length}</summary>
          <ul className="mt-2 space-y-1">
            {transcript.corrections.map((c, i) => (
              <li key={i} className="font-mono-num" dir="ltr">
                <span className="text-amber-400">{c.original}</span>
                {c.corrected ? <> → <span className="text-success">{c.corrected}</span></> : null}
                <span className="opacity-60"> · {c.kind}/{c.certainty}{c.reason ? ` · ${c.reason}` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Toolbar */}
      <div className="no-print flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
              ערוך
            </Button>
          )}
          {editing && (
            <>
              <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !dirty}>
                {saving ? 'שומר...' : 'שמור שינויים'}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleCancel} disabled={saving}>
                ביטול
              </Button>
            </>
          )}
          {/* Save also available outside edit mode for highlights */}
          {!editing && dirty && (
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'שומר...' : 'שמור שינויים'}
            </Button>
          )}
          {saved && (
            <span className="text-xs text-success flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              נשמר
            </span>
          )}
        </div>

        <div className="no-print">
          <TranscriptActions transcript={transcript} isAdmin={isAdmin} transcriptId={id} youtubeUrl={youtubeUrl} />
        </div>
      </div>

      {canEdit && !editing && (
        <p className="no-print text-2xs text-muted mb-4">
          סמנו טקסט כדי להדגיש · לחצו &quot;ערוך&quot; לעריכת שם החברה, הדוברים והתוכן
        </p>
      )}

      {/* Exportable content */}
      <div id="transcript-export-root">
        <TranscriptHeader
          transcript={transcript}
          editing={editing}
          onFieldChange={updateField}
          onSpeakerNameChange={updateSpeakerName}
        />

        <div className="flex gap-8">
          <div className="flex-1 min-w-0">
            <div className="bg-card border border-border rounded p-6 md:p-8">
              <TranscriptBody
                transcript={transcript}
                editing={editing}
                onLineChange={updateLineText}
                onAddHighlight={canEdit ? addHighlight : undefined}
                onRemoveHighlight={canEdit ? removeHighlight : undefined}
              />
            </div>
          </div>

          <div className="hidden lg:block w-44 flex-shrink-0 no-print">
            <SectionNav sections={transcript.sections} />
          </div>
        </div>
      </div>

      <div className="mt-8 pt-5 border-t border-border flex items-center justify-between">
        <p className="text-xs text-muted">תמלול נוצר באמצעות תשתית תמלול מוסדית</p>
        <p className="text-xs text-muted font-mono-num" dir="ltr">
          {new Date(transcript.createdAt).toLocaleString('he-IL')}
        </p>
      </div>
    </div>
  )
}
