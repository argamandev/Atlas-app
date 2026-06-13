import path from 'node:path'
import { supabaseAdmin } from '@/lib/supabase'
import { getCompanyByTicker } from '@/lib/db/companies'
import { loadRecallTranscript } from './recallAdapter'
import type { TranscriptSegment, WordTimedTranscript } from './syncEngine'
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

// A completed transcript (YouTube/IVRIT path) → line-level transcript (no word timings,
// no stored audio yet). Each line becomes a clickable chunk; highlight is line-level.
export async function loadCompletedCall(id: string): Promise<LiveCall | null> {
  const { data } = await supabaseAdmin
    .from('transcripts')
    .select('id, formatted_data, duration, company_id')
    .eq('id', id)
    .maybeSingle()
  if (!data?.formatted_data) return null
  const fd = data.formatted_data as Transcript

  const nameOf = (sid: string) => fd.speakers?.find((s) => s.id === sid)?.name ?? 'Speaker'
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
