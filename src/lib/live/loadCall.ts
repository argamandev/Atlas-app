import path from 'node:path'
import { supabaseAdmin } from '@/lib/supabase'
import { getCompanyByTicker } from '@/lib/db/companies'
import { loadRecallTranscript } from './recallAdapter'
import { applySpeakerEdits } from './syncEngine'
import type { TranscriptSegment, WordTimedTranscript, IvritSegment, SpeakerEdits } from './syncEngine'
import type { Transcript } from '@/lib/types'
import { DEMO_LIVE_CALL } from '@/data/demo/liveCall'

export interface LiveCall {
  id: string
  /**
   * THE TRANSCRIPT ROW THIS SCREEN ACTUALLY HAS, or null when there is none.
   *
   * NOT a copy of `id`, and that is the whole point. `id` is what the screen is
   * keyed and routed by, and TWO of its producers key on something that is not a
   * transcript: the demo fixture (`'demo'`) and `/app/company/[id]/period/[period]`,
   * which fabricates `period:<companyId>:<period>` for a quarter that holds a
   * report and a deck but no recording.
   *
   * Six sites in `LiveTranscriptView` needed to know "is there a stored transcript
   * here", and each asked it as `call.id !== 'demo'` — a PROXY that named one of
   * the two producers and could not see the other. So the period screen offered
   * `{kind:'call', transcriptId:'period:…:Q1 2026'}` to Ask Atlas, which the chat
   * route refuses outright (`asTranscriptId` rejects the colons and the space):
   * every question on that screen died as "this grounding cannot be honoured",
   * under a caption claiming Atlas was connected to the call.
   *
   * REQUIRED, so `tsc` makes every producer state the fact rather than letting a
   * new screen inherit a wrong answer by saying nothing (rules/app.md M3.3).
   */
  storedTranscriptId: string | null
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
    // A FIXTURE ON DISK, not a row. Nothing that keys on a transcript id may act
    // on this screen — the reason this field exists rather than an `id` compare.
    storedTranscriptId: null,
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
export function buildFromIvrit(
  segs: IvritSegment[],
  overrides: Record<string, string> = {}
): WordTimedTranscript {
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
        cur = {
          id: `seg-${segments.length}`,
          speakerId: key,
          speakerName: label,
          role: null,
          words: [],
          start: s.start,
          end: s.end,
        }
      }
      cur.words.push(...toWords(s))
      cur.end = cur.words[cur.words.length - 1]?.end ?? s.end
    }
    if (cur) segments.push(cur)
  }

  const durationSec = segments.reduce((m, s) => Math.max(m, s.end), 0)
  return { segments, durationSec, hasWordTimings: true }
}

// Keep the EXACT IVRIT word timings (the karaoke) but relabel + regroup the words by the real
// Gemini speaker names. Both transcripts are the same words in the same order, so a proportional
// position map assigns each timed word its Gemini speaker. Word timings are untouched → the
// karaoke highlight is byte-identical; only the speaker turns + labels change.
export function buildFromIvritWithGeminiNames(
  segs: IvritSegment[],
  fd: Transcript,
  overrides: Record<string, string> = {}
): WordTimedTranscript {
  const timed: { text: string; start: number; end: number }[] = []
  for (const s of segs) {
    if (s.words.length) for (const w of s.words) timed.push({ text: w.word, start: w.start, end: w.end })
    else timed.push({ text: s.text, start: s.start, end: s.end })
  }
  const I = timed.length

  const lines = fd.sections?.flatMap((sec) => sec.lines) ?? []
  const gSpeakers: string[] = [] // gemini speakerId per gemini word, in order
  for (const line of lines) {
    const n = line.text.split(/\s+/).filter(Boolean).length
    for (let k = 0; k < n; k++) gSpeakers.push(line.speakerId)
  }
  const G = gSpeakers.length
  if (!G || !I) return buildFromIvrit(segs, overrides)

  // Real name from Gemini; the "Speaker Full Name" placeholder → דובר (still editable).
  const baseName = (sid: string): string => {
    const n = fd.speakers?.find((s) => s.id === sid)?.name
    return !n || /speaker full name|^speaker\b/i.test(n) ? 'דובר' : n
  }
  const nameOf = (sid: string) => overrides[sid] ?? baseName(sid)
  const roleOf = (sid: string) => fd.speakers?.find((s) => s.id === sid)?.title ?? null

  const segments: TranscriptSegment[] = []
  let cur: TranscriptSegment | null = null
  for (let i = 0; i < I; i++) {
    const gi = I > 1 && G > 1 ? Math.min(G - 1, Math.round((i * (G - 1)) / (I - 1))) : 0
    const sid: string = gSpeakers[gi] ?? 's0'
    const w = timed[i]
    if (!cur || cur.speakerId !== sid) {
      if (cur) segments.push(cur)
      cur = {
        id: `seg-${segments.length}`,
        speakerId: sid,
        speakerName: nameOf(sid),
        role: roleOf(sid),
        words: [],
        start: w.start,
        end: w.end,
      }
    }
    cur.words.push({ text: w.text, start: w.start, end: w.end })
    cur.end = w.end
  }
  if (cur) segments.push(cur)

  const durationSec = segments.reduce((m, s) => Math.max(m, s.end), 0)
  return { segments, durationSec, hasWordTimings: true }
}

// A completed transcript. If IVRIT word timings + audio were stored → real karaoke + audio
// playback. Otherwise a line-level read view from the Gemini transcript (no audio).
export async function loadCompletedCall(id: string): Promise<LiveCall | null> {
  const { data } = await supabaseAdmin
    .from('transcripts')
    .select(
      'id, formatted_data, duration, company_id, audio_url, word_segments, speaker_names, speaker_edits'
    )
    .eq('id', id)
    .maybeSingle()
  if (!data?.formatted_data) return null
  const fd = data.formatted_data as Transcript
  const audioUrl = (data.audio_url as string) ?? null
  const wordSegs = (data.word_segments as IvritSegment[] | null) ?? null
  const overrides = (data.speaker_names as Record<string, string> | null) ?? {}
  const edits = (data.speaker_edits as SpeakerEdits | null) ?? null // manual diarization overlay (Feature 1)

  const meta = {
    id,
    // This one IS a stored transcript — the row was just read out of `transcripts`.
    storedTranscriptId: id,
    title: `${fd.company ?? ''} — ${fd.quarter ?? ''}`.trim(),
    companyName: fd.company ?? '',
    companyNameEn: fd.company ?? '',
    logoUrl: null,
    quarter: fd.quarter ?? '',
    date: fd.date ?? '',
    isLive: false,
    companyId: (data.company_id as string) ?? null,
  }

  // Word-timed path — real karaoke synced to stored audio. Prefer Gemini's real speaker names
  // (relabel only; word timings untouched); fall back to anonymous diarization labels.
  if (audioUrl && wordSegs && wordSegs.length) {
    const hasGemini = (fd.sections?.flatMap((s) => s.lines) ?? []).length > 0
    const built = hasGemini
      ? buildFromIvritWithGeminiNames(wordSegs, fd, overrides)
      : buildFromIvrit(wordSegs, overrides)
    return { ...meta, audioUrl, transcript: applySpeakerEdits(built, edits) }
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
      cur = {
        id: `seg-${segments.length}`,
        speakerId: line.speakerId,
        speakerName: nameOf(line.speakerId),
        role: roleOf(line.speakerId),
        words: [],
        start,
        end: start,
      }
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
    storedTranscriptId: id,
    title: `${fd.company ?? ''} — ${fd.quarter ?? ''}`.trim(),
    companyName: fd.company ?? '',
    companyNameEn: fd.company ?? '',
    logoUrl: null,
    quarter: fd.quarter ?? '',
    date: fd.date ?? '',
    isLive: false,
    audioUrl: null,
    companyId: (data.company_id as string) ?? null,
    transcript: applySpeakerEdits({ segments, durationSec, hasWordTimings: false }, edits),
  }
}
