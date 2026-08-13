// ─────────────────────────────────────────────────────────────────────────────
// LINE-TIMESTAMP ALIGNMENT — run once at birth, PERSISTED (ingestion standard §4).
//
// Every polished transcript line gets a real start time from the IVRIT/Recall
// word timings that already sit in `word_segments`. This is the same
// proportional map the karaoke player re-derives on every page load
// (`buildFromIvritWithGeminiNames` in lib/live/loadCall.ts) — run once here,
// written into `formatted_data.sections[].lines[].timestamp`, with a FIRMER
// JOIN where the word text allows: the proportional guess is refined to the
// nearest timed word whose text matches the line's opening word.
//
// This makes the founding citation law ("Q1 call · 14:02 · L0031") real: the
// minute exists at birth instead of being re-derived per render (W6).
//
// Lines that cannot be timed keep the '00:00:00' sentinel — visibly untimed,
// line-id-only citations, per the founder-approved backfill rule. No fabricated
// times, ever (app.md: degradation must be visible).
//
// Pure: no imports, no env — testable offline, callable from any pipeline.
// ─────────────────────────────────────────────────────────────────────────────

/** The sentinel a line carries when no word timing could be attached. */
export const UNTIMED = '00:00:00'

/** Structural slice of a stored word segment (lib/live/syncEngine IvritSegment). */
export interface AlignableSegment {
  text: string
  start: number
  end?: number
  words?: Array<{ word: string; start: number }> | null
}

/** Structural slice of formatted_data the aligner touches. */
export interface AlignableTranscript {
  sections?: Array<{ lines?: Array<{ id: string; text: string; timestamp: string }> }> | null
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/** Word text → comparable token: strip punctuation/quotes/niqqud, lowercase. */
export function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '') // niqqud + cantillation
    .replace(/[^0-9a-zא-ת]/g, '')
}

/** Flatten stored segments to one start-sorted timed word stream. */
export function flattenTimedWords(
  segments: AlignableSegment[] | null | undefined
): Array<{ word: string; start: number }> {
  const out: Array<{ word: string; start: number }> = []
  for (const s of segments ?? []) {
    if (s.words && s.words.length) {
      for (const w of s.words) out.push({ word: w.word, start: w.start })
    } else if (s.text) {
      // Segment without per-word timings: every word inherits the segment start —
      // coarse but honest (the segment DID start then).
      for (const w of s.text.split(/\s+/).filter(Boolean)) out.push({ word: w, start: s.start })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

const REFINE_WINDOW = 25

/**
 * Return a COPY of `fd` with per-line timestamps written from the timed word
 * stream, plus how many lines got a real time. `fd` itself is not mutated.
 *
 * Join: proportional position map (line's first word index in the polished text
 * → index in the timed stream), refined to an exact text match within ±25 timed
 * words when the line's opening word is distinctive enough (≥2 chars after
 * normalization). Monotonic: a line never starts before the previous line.
 */
export function alignLineTimestamps<T extends AlignableTranscript>(
  fd: T,
  segments: AlignableSegment[] | null | undefined
): { fd: T; timedLines: number; totalLines: number } {
  const copy = JSON.parse(JSON.stringify(fd)) as T
  const lines = (copy.sections ?? []).flatMap((s) => s.lines ?? [])
  const totalLines = lines.length
  const timed = flattenTimedWords(segments)
  const I = timed.length
  if (!I || !totalLines) return { fd: copy, timedLines: 0, totalLines }

  // Gemini word offsets: the polished text's word index at which each line starts.
  const lineFirstWord: number[] = []
  let g = 0
  for (const line of lines) {
    lineFirstWord.push(g)
    g += line.text.split(/\s+/).filter(Boolean).length
  }
  const G = g
  if (!G) return { fd: copy, timedLines: 0, totalLines }

  const timedNorm = timed.map((w) => normalizeWord(w.word))

  let timedCount = 0
  let prevIdx = 0
  lines.forEach((line, li) => {
    const firstTok = normalizeWord(line.text.split(/\s+/).filter(Boolean)[0] ?? '')
    // Proportional guess, exactly the player's map (guarded for G===1 / I===1).
    const gi = lineFirstWord[li]
    let idx = G > 1 && I > 1 ? Math.min(I - 1, Math.round((gi * (I - 1)) / (G - 1))) : 0

    // Firmer join where the word text allows: nearest matching timed word.
    if (firstTok.length >= 2) {
      let best = -1
      for (let d = 0; d <= REFINE_WINDOW; d++) {
        const lo = idx - d
        const hi = idx + d
        if (lo >= 0 && lo >= prevIdx && timedNorm[lo] === firstTok) {
          best = lo
          break
        }
        if (hi < I && timedNorm[hi] === firstTok) {
          best = hi
          break
        }
      }
      if (best >= 0) idx = best
    }

    // Monotonic: never before the previous line's word.
    if (idx < prevIdx) idx = prevIdx
    prevIdx = idx

    line.timestamp = formatClock(timed[idx].start)
    timedCount++
  })

  return { fd: copy, timedLines: timedCount, totalLines }
}
