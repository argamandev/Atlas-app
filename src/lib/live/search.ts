import type { WordTimedTranscript } from './syncEngine'

// Global word indices (matching TranscriptBody's data-wi numbering) whose text contains
// the query, case-insensitive. Empty/whitespace query → no matches.
export function findMatches(transcript: WordTimedTranscript, query: string): number[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: number[] = []
  let gi = 0
  for (const seg of transcript.segments) {
    for (const w of seg.words) {
      if (w.text.toLowerCase().includes(q)) out.push(gi)
      gi++
    }
  }
  return out
}
