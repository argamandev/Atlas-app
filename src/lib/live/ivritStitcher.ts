// Chunk-relative IVRIT word times → one stream-relative, non-decreasing caption timeline.
// Pure; the engine owns ids, offsets and the running prevMaxStart cursor.
import type { IvritSegment } from './syncEngine'

export interface LiveWord {
  text: string
  start: number
}

export interface LiveLine {
  id: number
  raw: string
  words: LiveWord[]
  chunkStartSec: number
  chunkEndSec: number
  fallbackTiming?: boolean
  failed?: boolean
}

export function stitchChunk(
  id: number,
  segments: IvritSegment[],
  chunk: { startSec: number; endSec: number },
  prevMaxStart: number
): LiveLine {
  const raw = segments
    .map((s) => s.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Per-segment stitch: timed segments keep IVRIT word times; untimed segments (text but no
  // words[]) get their tokens distributed evenly across the segment's own window — so a chunk
  // mixing both never silently drops the untimed segments' words.
  const words: LiveWord[] = []
  let fallbackTiming: boolean | undefined
  let cursor = prevMaxStart
  segments.forEach((s, i) => {
    if (s.words.length > 0) {
      for (const w of s.words) {
        // chunkEndSec caps IVRIT overshoot, but is not an absolute cap when prevMaxStart
        // already exceeds it — whole-stream monotonicity wins by design.
        const abs = Math.min(chunk.startSec + w.start, chunk.endSec)
        cursor = Math.max(cursor, abs)
        words.push({ text: w.word, start: cursor })
      }
      return
    }
    const text = s.text.trim()
    if (!text) return
    // IVRIT gave text but no timings (seen occasionally): spread tokens evenly, flag the line.
    const toks = text.split(/\s+/)
    const segStartAbs = chunk.startSec + s.start
    const segBound =
      s.end > s.start
        ? chunk.startSec + s.end
        : i + 1 < segments.length
          ? chunk.startSec + segments[i + 1].start
          : chunk.endSec
    const step = (segBound - segStartAbs) / toks.length
    toks.forEach((tok, j) => {
      cursor = Math.max(cursor, segStartAbs + j * step)
      words.push({ text: tok, start: cursor })
    })
    fallbackTiming = true
  })

  return { id, raw, words, chunkStartSec: chunk.startSec, chunkEndSec: chunk.endSec, fallbackTiming }
}

/** The monotonic cursor after this line: last word start, or carried prevMaxStart for gap lines. */
export function lastWordStart(line: LiveLine, prevMaxStart: number): number {
  return line.words.length ? line.words[line.words.length - 1].start : prevMaxStart
}

/** Caption for a chunk must exist before delayed viewers reach the chunk's start. */
export function captionOnTime(
  chunkStartSec: number,
  readyAtSec: number,
  bufferSec: number,
  marginSec = 60
): boolean {
  return readyAtSec <= chunkStartSec + bufferSec - marginSec
}
