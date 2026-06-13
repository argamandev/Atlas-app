// Framework-agnostic karaoke sync engine. Pure functions over a word-timed transcript,
// driven by an <audio> element's currentTime. Unit-tested in syncEngine.test.ts.

export interface TimedWord {
  text: string
  start: number // seconds
  end: number
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
