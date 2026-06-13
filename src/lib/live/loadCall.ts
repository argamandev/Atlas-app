import path from 'node:path'
import { supabaseAdmin } from '@/lib/supabase'
import { getCompanyByTicker } from '@/lib/db/companies'
import { loadRecallTranscript } from './recallAdapter'
import type { TranscriptSegment, WordTimedTranscript, IvritSegment } from './syncEngine'
import type { Transcript } from '@/lib/types'
import { DEMO_LIVE_CALL } from '@/data/demo/liveCall'

export interface LiveCall {
  id: string
  title: string
  companyName: string
  companyNameEn: string | null
  logoUrl: string | null
  quarter: string
  date: string
  isLive: boolean
  audioUrl: string | null
  companyId: string | null
  transcript: WordTimedTranscript
}

// The crown-jewel DEMO: real Recall word-timings + matching audio, presented as a
// live call for תיגבור so karaoke sync + word-click-seek are demoable end-to-end.
export async function loadDemoCall(): Promise<LiveCall> {
  const fixture = path.join(process.cwd(), 'scripts', 'fixtures', 'recall-spike.transcript.json')
  const transcript = await loadRecallTranscript(fixture)
  if (transcript.segments[0]) transcript.segments[0].role = 'מנכ"ל' // demo speaker role
  const company = await getCompanyByTicker(DEMO_LIVE_CALL.companyTicker).catch(() => null)
  return {
    id: 'demo',
    title: `${DEMO_LIVE_CALL.companyNameEn} — ${DEMO_LIVE_CALL.quarter}`,
    companyName: DEMO_LIVE_CALL.companyName,
    companyNameEn: DEMO_LIVE_CALL.companyNameEn,
    logoUrl: DEMO_LIVE_CALL.logoUrl,
    quarter: DEMO_LIVE_CALL.quarter,
    date: DEMO_LIVE_CALL.date,
    isLive: true,
    audioUrl: '/demo/demo-call.mp3',
    companyId: company?.id ?? null,
    transcript,
  }
}

function parseTs(ts: string | null | undefined): number {
  if (!ts) return 0
  const parts = ts.split(':').map(Number)
  if (parts.some(Number.isNaN)) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] ?? 0
}

// Build a word-timed (karaoke) transcript from stored IVRIT word_segments. Diarized
// segments are grouped into speaker blocks; otherwise one continuous block. Falls back
// to a chunk-per-segment when a segment lacks per-word timings.
function buildFromIvrit(segs: IvritSegment[], overrides: Record<string, string> = {}): WordTimedTranscript {
  const toWords = (s: IvritSegment) =>
    s.words.length
      ? s.words.map((w) => ({ text: w.word, start: w.start, end: w.end }))
      : [{ text: s.text, start: s.start, end: s.end }]

  const hasSpeakers = segs.some((s) => s.speaker != null)
  const segments: TranscriptSegment[] = []

  if (!hasSpeakers) {
    const words = segs.flatMap(toWords)
    segments.push({
      id: 'seg-0',
      speakerId: 's0',
      speakerName: overrides['s0'] ?? 'דובר',
      role: null,
      words,
      start: words[0]?.start ?? 0,
      end: words[words.length - 1]?.end ?? 0,
    })
  } else {
    const spkIndex = new Map<string, number>()
    let cur: TranscriptSegment | null = null
    for (const s of segs) {
      const key: string = s.speaker ?? cur?.speakerId ?? 's0'
      if (!cur || cur.speakerId !== key) {
        if (cur) segments.push(cur)
        if (!spkIndex.has(key)) spkIndex.set(key, spkIndex.size + 1)
        const label: string = overrides[key] ?? `Speaker ${spkIndex.get(key)}`
        cur = { id: `seg-${segments.length}`, speakerId: key, speakerName: label, role: null, words: [], start: s.start, end: s.end }
      }
      cur.words.push(...toWords(s))
      cur.end = cur.words[cur.words.length - 1]?.end ?? s.end
    }
    if (cur) segments.push(cur)
  }

  const durationSec = segments.reduce((m, s) => Math.max(m, s.end), 0)
  return { segments, durationSec, hasWordTimings: true }
}

// A completed transcript. If IVRIT word timings + audio were stored → real karaoke + audio
// playback. Otherwise a line-level read view from the Gemini transcript (no audio).
export async function loadCompletedCall(id: string): Promise<LiveCall | null> {
  const { data } = await supabaseAdmin
    .from('transcripts')
    .select('id, formatted_data, duration, company_id, audio_url, word_segments, speaker_names')
    .eq('id', id)
    .maybeSingle()
  if (!data?.formatted_data) return null
  const fd = data.formatted_data as Transcript
  const audioUrl = (data.audio_url as string) ?? null
  const wordSegs = (data.word_segments as IvritSegment[] | null) ?? null
  const overrides = (data.speaker_names as Record<string, string> | null) ?? {}

  const meta = {
    id,
    title: `${fd.company ?? ''} — ${fd.quarter ?? ''}`.trim(),
    companyName: fd.company ?? '',
    companyNameEn: fd.company ?? '',
    logoUrl: null,
    quarter: fd.quarter ?? '',
    date: fd.date ?? '',
    isLive: false,
    companyId: (data.company_id as string) ?? null,
  }

  // Word-timed path — real karaoke synced to stored audio.
  if (audioUrl && wordSegs && wordSegs.length) {
    return { ...meta, audioUrl, transcript: buildFromIvrit(wordSegs, overrides) }
  }

  const nameOf = (sid: string) => overrides[sid] ?? fd.speakers?.find((s) => s.id === sid)?.name ?? 'Speaker'
  const roleOf = (sid: string) => fd.speakers?.find((s) => s.id === sid)?.title ?? null
  const lines = fd.sections?.flatMap((sec) => sec.lines) ?? []

  const segments: TranscriptSegment[] = []
  let cur: TranscriptSegment | null = null
  for (const line of lines) {
    const start = parseTs(line.timestamp)
    if (!cur || cur.speakerId !== line.speakerId) {
      if (cur) segments.push(cur)
      cur = { id: `seg-${segments.length}`, speakerId: line.speakerId, speakerName: nameOf(line.speakerId), role: roleOf(line.speakerId), words: [], start, end: start }
    }
    cur.words.push({ text: line.text, start, end: start })
    cur.end = start
  }
  if (cur) segments.push(cur)

  // Give each chunk an end = next chunk's start so the highlight advances.
  const flat = segments.flatMap((s) => s.words)
  for (let i = 0; i < flat.length - 1; i++) flat[i].end = Math.max(flat[i].start, flat[i + 1].start)

  const durationSec = parseTs(data.duration as string) || (flat.at(-1)?.start ?? 0) + 5
  return {
    id,
    title: `${fd.company ?? ''} — ${fd.quarter ?? ''}`.trim(),
    companyName: fd.company ?? '',
    companyNameEn: fd.company ?? '',
    logoUrl: null,
    quarter: fd.quarter ?? '',
    date: fd.date ?? '',
    isLive: false,
    audioUrl: null,
    companyId: (data.company_id as string) ?? null,
    transcript: { segments, durationSec, hasWordTimings: false },
  }
}
