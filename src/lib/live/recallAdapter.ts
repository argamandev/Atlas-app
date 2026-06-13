// (server-only by virtue of node:fs — not importable in a client bundle)
import { readFile } from 'node:fs/promises'
import type { TranscriptSegment, WordTimedTranscript } from './syncEngine'

// Adapts a Recall.ai transcript dump (per-word timestamps — see
// scripts/fixtures/recall-spike.transcript.json) into a WordTimedTranscript for the
// karaoke player. This is the real Hebrew word-timing data from the live Zoom test.
interface RecallWord {
  text: string
  start_timestamp?: { relative: number }
  end_timestamp?: { relative: number }
}
interface RecallSegment {
  participant?: { id?: number | string; name?: string | null }
  words?: RecallWord[]
}

export async function loadRecallTranscript(filePath: string): Promise<WordTimedTranscript> {
  const raw = JSON.parse(await readFile(filePath, 'utf8')) as RecallSegment[]

  const segments: TranscriptSegment[] = raw
    .filter((s) => Array.isArray(s.words) && s.words.length > 0)
    .map((s, i) => {
      const words = (s.words ?? [])
        .filter((w) => w.start_timestamp && w.end_timestamp)
        .map((w) => ({
          text: w.text,
          start: w.start_timestamp!.relative,
          end: w.end_timestamp!.relative,
        }))
      return {
        id: `seg-${i}`,
        speakerId: String(s.participant?.id ?? i),
        speakerName: s.participant?.name?.trim() || 'Speaker',
        role: null,
        words,
        start: words[0]?.start ?? 0,
        end: words[words.length - 1]?.end ?? 0,
      }
    })
    .filter((seg) => seg.words.length > 0)

  const durationSec = segments.reduce((max, s) => Math.max(max, s.end), 0)
  return { segments, durationSec, hasWordTimings: true }
}
