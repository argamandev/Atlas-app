// Framework-agnostic karaoke sync engine. Pure functions over a word-timed transcript,
// driven by an <audio> element's currentTime. Unit-tested in syncEngine.test.ts.

export interface TimedWord {
  text: string
  start: number // seconds
  end: number
}

// Raw IVRIT word-timed output (stored on transcripts.word_segments). Kept as a light,
// runtime-free type so both the pipeline and the live page can import it without pulling
// the heavy transcription module.
export interface IvritWord {
  word: string
  start: number
  end: number
}
export interface IvritSegment {
  text: string
  start: number
  end: number
  speaker: string | null // diarization label when enabled, else null
  words: IvritWord[]
}

export interface TranscriptSegment {
  id: string
  speakerId: string
  speakerName: string
  role?: string | null
  words: TimedWord[]
  start: number // first word start (or line start for line-level transcripts)
  end: number
}

export interface WordTimedTranscript {
  segments: TranscriptSegment[]
  durationSec: number
  /** false for YouTube/IVRIT transcripts that only have line-level timestamps */
  hasWordTimings: boolean
}

// Manual diarization overlay (Feature 1): ordered split points over the flat word stream.
// The speaker of word i is the speakerId of the latest boundary with atWordIndex <= i.
export interface SpeakerEdits {
  boundaries: { atWordIndex: number; speakerId: string }[]
}

// Re-segment a word-timed transcript by a manual overlay. Word timings/order are preserved
// (karaoke unaffected) — only the speaker turns change. A pure passthrough when there are no
// boundaries, so an un-edited transcript renders identically to before.
export function applySpeakerEdits(
  t: WordTimedTranscript,
  edits: SpeakerEdits | null | undefined
): WordTimedTranscript {
  if (!edits?.boundaries?.length) return t

  // registry (speakerId -> name/role) from the current derived segments
  const reg = new Map<string, { name: string; role: string | null }>()
  for (const s of t.segments)
    if (!reg.has(s.speakerId)) reg.set(s.speakerId, { name: s.speakerName, role: s.role ?? null })

  const flat = t.segments.flatMap((s) => s.words.map((w) => ({ w, speakerId: s.speakerId })))
  const bounds = [...edits.boundaries].sort((a, b) => a.atWordIndex - b.atWordIndex)

  const speakerAt = (i: number): string => {
    let sid = flat[i]?.speakerId ?? 's0'
    for (const b of bounds) {
      if (b.atWordIndex <= i) sid = b.speakerId
      else break
    }
    return sid
  }

  const segments: TranscriptSegment[] = []
  let cur: TranscriptSegment | null = null
  for (let i = 0; i < flat.length; i++) {
    const sid = speakerAt(i)
    const w = flat[i].w
    if (!cur || cur.speakerId !== sid) {
      if (cur) segments.push(cur)
      const meta = reg.get(sid)
      cur = {
        id: `seg-${segments.length}`,
        speakerId: sid,
        speakerName: meta?.name ?? 'דובר',
        role: meta?.role ?? null,
        words: [],
        start: w.start,
        end: w.end,
      }
    }
    cur.words.push(w)
    cur.end = w.end
  }
  if (cur) segments.push(cur)
  return { segments, durationSec: t.durationSec, hasWordTimings: t.hasWordTimings }
}

export interface FlatWord extends TimedWord {
  segmentIndex: number
  wordIndex: number
  globalIndex: number
  speakerId: string
}

export function flattenWords(t: WordTimedTranscript): FlatWord[] {
  const out: FlatWord[] = []
  t.segments.forEach((seg, segmentIndex) => {
    seg.words.forEach((w, wordIndex) => {
      out.push({ ...w, segmentIndex, wordIndex, globalIndex: out.length, speakerId: seg.speakerId })
    })
  })
  return out
}

// Index of the word being spoken at `currentTime`: the last word whose start <= t.
// Returns -1 before the first word. Binary search — `items` must be start-sorted.
export function activeWordIndex(items: { start: number }[], currentTime: number): number {
  let lo = 0
  let hi = items.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (items[mid].start <= currentTime) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

// Active segment (for auto-scroll target + line-level sync). Last segment started.
export function activeSegmentIndex(t: WordTimedTranscript, currentTime: number): number {
  let ans = t.segments.length > 0 ? 0 : -1
  for (let i = 0; i < t.segments.length; i++) {
    if (t.segments[i].start <= currentTime) ans = i
    else break
  }
  return ans
}
