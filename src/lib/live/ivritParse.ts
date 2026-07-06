// IVRIT/RunPod output → word-timed segments. Extracted from transcription.ts so the live
// engine can import it without pulling openai/ffmpeg. Behavior is identical.
import type { IvritSegment, IvritWord } from './syncEngine'

function asNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : null
}

// Walk RunPod's output ({type:'segments',data:[...]} chunks, {result}, arrays, bare segments)
// and collect raw segment objects — defensive because the exact envelope varies.
function collectRawSegments(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!node) return out
  if (Array.isArray(node)) {
    for (const n of node) collectRawSegments(n, out)
    return out
  }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (o.type === 'segments' && Array.isArray(o.data)) {
      for (const s of o.data) collectRawSegments(s, out)
      return out
    }
    if (Array.isArray(o.segments)) {
      for (const s of o.segments) collectRawSegments(s, out)
      return out
    }
    if ('text' in o && ('start' in o || 'words' in o)) {
      out.push(o)
      return out
    }
    if ('result' in o) return collectRawSegments(o.result, out)
    if ('output' in o) return collectRawSegments(o.output, out)
    if ('data' in o) return collectRawSegments(o.data, out)
  }
  return out
}

// Normalize raw IVRIT segments into our word-timed shape.
export function parseIvritSegments(output: unknown): IvritSegment[] {
  const segs: IvritSegment[] = []
  for (const s of collectRawSegments(output)) {
    const start = asNum(s.start)
    if (start == null) continue
    const end = asNum(s.end) ?? start
    const extra = (s.extra_data ?? {}) as Record<string, unknown>
    const wordsRaw = (
      Array.isArray(s.words) ? s.words : Array.isArray(extra.words) ? extra.words : []
    ) as Record<string, unknown>[]
    const words: IvritWord[] = wordsRaw
      .map((w) => ({
        word: String(w.word ?? w.text ?? '').trim(),
        start: asNum(w.start) ?? start,
        end: asNum(w.end) ?? asNum(w.start) ?? end,
      }))
      .filter((w) => w.word)
    // IVRIT diarization exposes the speaker as a segment-level `speakers: [label]` array
    // (and per-word `speaker`); fall back through the singular forms. Reading only `s.speaker`
    // dropped diarization → every turn collapsed into one block.
    const firstWordSpeaker = (wordsRaw[0]?.speaker as string | undefined) ?? undefined
    const speakerRaw =
      s.speaker ??
      (Array.isArray(s.speakers) ? s.speakers[0] : undefined) ??
      extra.speaker ??
      (Array.isArray(extra.speakers) ? (extra.speakers as unknown[])[0] : undefined) ??
      firstWordSpeaker ??
      null
    segs.push({
      text: String(s.text ?? '').trim(),
      start,
      end,
      speaker: speakerRaw != null ? String(speakerRaw) : null,
      words,
    })
  }
  return segs.filter((s) => s.text || s.words.length)
}

// Plain-text fallback extraction (string result / {text} / segment arrays).
export function extractIvritText(output: unknown): string {
  const segs = parseIvritSegments(output)
  if (segs.length)
    return segs
      .map((s) => s.text)
      .join(' ')
      .trim()
  const data = Array.isArray(output) ? (output as unknown[])[0] : output
  const result = (data as { result?: unknown } | undefined)?.result
  if (typeof result === 'string') return result.trim()
  if (result && typeof result === 'object' && 'text' in result)
    return String((result as { text: unknown }).text).trim()
  return ''
}
