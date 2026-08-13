// ─────────────────────────────────────────────────────────────────────────────
// THE ONE CHUNKER (ingestion standard §5, LAW).
//
// Production ingestion AND the retrieval-eval harness (scripts/retrieval-eval/
// run.mjs) import THIS module — a harness measuring a copy certifies a fiction
// (M2), so the copy was deleted the day this file was born (slice A3). The
// chunk shapes are the eval-MEASURED ones; changing anything here means a
// harness re-run against docs/eval/retrieval-eval-set.md (the standing gate).
//
// Two shapes, both measured on our own corpus (eval findings 2 and 7):
//   * transcripts — line-windows cut on speaker seams inside a section:
//     accumulate to TARGET 700 chars, cut at a speaker change past target,
//     hard-cut at MAX 1,100. Keeps short Q&A pairs in one window.
//   * filings — page-as-chunk; pages over 3,500 chars split on line boundaries
//     into ~2,200-char parts, every part keeping page_no.
//
// content vs embedding_input, LAW: `content` is verbatim and citable — it is
// what source_quote drift comparison runs against; `embeddingInput` is the
// deterministic metadata prefix + content (removing the prefix collapsed
// retrieval: rank 1 → 417, eval finding 2). The prefix NEVER enters content.
//
// Pure on purpose: no imports, no env, no database — the harness runs it over
// raw JSON rows and the battery tests run it offline.
// ─────────────────────────────────────────────────────────────────────────────

export const WINDOW = { TARGET: 700, MAX: 1100 } as const
export const PAGE = { SPLIT: 3500, PART: 2200 } as const

/** The slice of formatted_data the chunker reads — structural, not the full Transcript type. */
export interface ChunkableLine {
  id: string
  speakerId: string
  text: string
}
export interface ChunkableSection {
  title: string
  lines?: ChunkableLine[]
}

export interface TranscriptChunk {
  kind: 'transcript'
  /** Original line ids — the DB anchor columns (first_line_id / last_line_id). */
  firstLineId: string
  lastLineId: string
  /** Numeric forms of the same anchors — what the eval cases address lines by. */
  firstLine: number
  lastLine: number
  section: string
  speakers: string[]
  /** Verbatim lines joined by \n — citable, never prefixed. */
  content: string
  /** Deterministic metadata prefix + content — the embedded text. */
  embeddingInput: string
}

export interface FilingPageChunk {
  kind: 'filing'
  pageNo: number
  /** null when the page fit whole; 1-based part index when it was split. */
  partNo: number | null
  content: string
  embeddingInput: string
}

export const lineNo = (id: string): number => parseInt(String(id).replace(/\D/g, ''), 10)

/** The measured transcript prefix: `{company} · שיחת ועידה · {section} · {speakers}:` */
export function transcriptPrefix(companyName: string, sectionTitle: string, speakers: string[]): string {
  return `${companyName} · שיחת ועידה · ${sectionTitle} · ${speakers.join(', ')}:\n`
}

/** The measured filing prefix: `{company} · {title} · עמ' {N}` (+ part marker when split). */
export function filingPrefix(
  companyName: string,
  title: string,
  pageNo: number,
  partNo: number | null
): string {
  return `${companyName} · ${title} · עמ' ${pageNo}${partNo ? ` (${partNo})` : ''}:\n`
}

/**
 * Line-windows on speaker seams. `speakersById` maps speakerId → display name
 * (built from formatted_data.speakers); an unknown id falls back to the id
 * itself, exactly as the harness always did.
 */
export function chunkTranscriptSections(
  sections: ChunkableSection[],
  companyName: string,
  speakersById: Record<string, string>
): TranscriptChunk[] {
  const out: TranscriptChunk[] = []
  for (const sec of sections ?? []) {
    let cur: {
      firstId: string
      lastId: string
      speakers: Set<string>
      text: string
      lastSpeaker: string
    } | null = null
    const flush = () => {
      if (!cur || !cur.text.trim()) {
        cur = null
        return
      }
      const speakers = Array.from(cur.speakers)
      const content = cur.text.trim()
      out.push({
        kind: 'transcript',
        firstLineId: cur.firstId,
        lastLineId: cur.lastId,
        firstLine: lineNo(cur.firstId),
        lastLine: lineNo(cur.lastId),
        section: sec.title,
        speakers,
        content,
        embeddingInput: transcriptPrefix(companyName, sec.title, speakers) + content,
      })
      cur = null
    }
    for (const line of sec.lines ?? []) {
      const text = (line.text ?? '').trim()
      if (!text) continue
      const speaker = speakersById[line.speakerId] ?? line.speakerId ?? '?'
      if (
        cur &&
        (cur.text.length + text.length > WINDOW.MAX ||
          (cur.text.length >= WINDOW.TARGET && speaker !== cur.lastSpeaker))
      )
        flush()
      if (!cur)
        cur = { firstId: line.id, lastId: line.id, speakers: new Set(), text: '', lastSpeaker: speaker }
      cur.text += (cur.text ? '\n' : '') + text
      cur.lastId = line.id
      cur.lastSpeaker = speaker
      cur.speakers.add(speaker)
    }
    flush()
  }
  return out
}

/** Page-as-chunk; oversized pages split on line boundaries, all parts keep pageNo. */
export function chunkFilingPage(
  pageText: string,
  pageNo: number,
  companyName: string,
  title: string
): FilingPageChunk[] {
  const text = (pageText ?? '').trim()
  if (!text) return []
  const mk = (body: string, part: number | null): FilingPageChunk => ({
    kind: 'filing',
    pageNo,
    partNo: part,
    content: body,
    embeddingInput: filingPrefix(companyName, title, pageNo, part) + body,
  })
  if (text.length <= PAGE.SPLIT) return [mk(text, null)]
  const parts: string[] = []
  let buf = ''
  for (const ln of text.split('\n')) {
    if (buf && buf.length + ln.length > PAGE.PART) {
      parts.push(buf)
      buf = ''
    }
    buf += (buf ? '\n' : '') + ln
  }
  if (buf.trim()) parts.push(buf)
  return parts.map((p, i) => mk(p, i + 1))
}

/** speakerId → display name, the same derivation the harness used. */
export function speakersById(
  speakers: Array<{ id: string; name?: string | null; title?: string | null }> | null | undefined
): Record<string, string> {
  return Object.fromEntries((speakers ?? []).map((s) => [s.id, s.name || s.title || s.id]))
}
