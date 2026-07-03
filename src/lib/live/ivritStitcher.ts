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
  const ivritWords = segments.flatMap((s) => s.words)

  let words: LiveWord[]
  let fallbackTiming: boolean | undefined
  if (ivritWords.length > 0) {
    let cursor = prevMaxStart
    words = ivritWords.map((w) => {
      const abs = Math.min(chunk.startSec + w.start, chunk.endSec)
      cursor = Math.max(cursor, abs)
      return { text: w.word, start: cursor }
    })
  } else if (raw) {
    // IVRIT gave text but no timings (seen occasionally): spread words evenly, flag the line.
    const toks = raw.split(/\s+/)
    const step = (chunk.endSec - chunk.startSec) / toks.length
    let cursor = prevMaxStart
    words = toks.map((text, i) => {
      cursor = Math.max(cursor, chunk.startSec + i * step)
      return { text, start: cursor }
    })
    fallbackTiming = true
  } else {
    words = []
  }

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
