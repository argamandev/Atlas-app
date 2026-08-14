// Per-page Hebrew text extraction (spike-verified 2026-07-14, docs/superpowers/specs/
// 2026-07-14-multiview-backend-design.md). pdf.js getTextContent gives logically-ordered
// Hebrew strings per item; only the WITHIN-LINE item order needs geometric repair.
// IMPORTANT: pdfjs-dist must never be BUNDLED. It may now be used from Next server
// code (the MAYA ingest route needs it) ONLY because `pdfjs-dist` is listed in
// `experimental.serverComponentsExternalPackages` in next.config.js, so Next requires
// it from node_modules at runtime instead of bundling it. Remove that entry and this
// module fails inside a route with "Object.defineProperty called on non-object" —
// observed 2026-08-06, which is how the entry came to exist.
// The BROWSER still must not import this: that path uses the committed
// public/pdf.min.mjs (see `.claude/rules/app.md`).

export interface TextItem {
  str: string
  x: number
  y: number
}

const HEB = /[֐-׿]/
// LTR run members: digit/Latin tokens AND joiner punctuation between them ("-", "/", ".")
// — a naive run break on "-" reversed reference numbers like 2026-01-029201 in the spike.
const LTRISH = /^[0-9A-Za-z]/
const JOINER = /^[-–—/.,:%()]+$/

/** Rebuild one page's reading order: group items into lines by y (±2pt jitter),
 *  lines top-to-bottom, items right-to-left with LTR runs kept left-to-right. */
/**
 * STRIP WHAT POSTGRES CANNOT STORE, at the point the text is born.
 *
 * A `text` column cannot hold U+0000 — the driver rejects the whole statement with
 * "unsupported Unicode escape sequence", so ONE stray NUL anywhere in a 300-page
 * filing loses the entire document. Measured in the A5 backfill: 2 of the first
 * 401 documents, ~0.5%, each visibly `failed` and each a real filing (a 20-F and
 * an investor deck) that a user would have searched for and not found.
 *
 * Lone surrogates go too, for the same reason one level down: they survive a JSON
 * round-trip and then break the UTF-8 encode.
 *
 * HERE RATHER THAN AT THE INSERT, deliberately (M3): the page text reaches
 * `document_pages`, then the chunker, then `document_chunks`, then an embedding
 * request. Cleaning it at one write leaves every other path holding bytes that
 * cannot be stored; cleaning it where it is produced means no consumer ever sees
 * them. A NUL in a PDF's text layer carries no meaning to lose.
 */
export function pgSafe(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u0000/g, '').replace(/[\uD800-\uDFFF]/g, (c, i, s) => {
    const hi = c.charCodeAt(0)
    const next = s.charCodeAt(i + 1)
    const prev = s.charCodeAt(i - 1)
    const paired =
      (hi <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) || (hi >= 0xdc00 && prev >= 0xd800 && prev <= 0xdbff)
    return paired ? c : ''
  })
}

export function reassemblePage(items: TextItem[]): string {
  const kept = items.filter((i) => i.str.trim().length > 0)
  if (kept.length === 0) return ''
  // group by y with jitter tolerance: sort by y desc, start a new line when the gap > 2
  const sorted = [...kept].sort((a, b) => b.y - a.y)
  const lines: TextItem[][] = []
  for (const it of sorted) {
    const line = lines[lines.length - 1]
    if (line && Math.abs(line[0].y - it.y) <= 2) line.push(it)
    else lines.push([it])
  }
  return lines.map(lineToText).join('\n')
}

function lineToText(line: TextItem[]): string {
  const rtl = [...line].sort((a, b) => b.x - a.x) // visual RTL: rightmost first
  const out: TextItem[] = []
  let run: TextItem[] = []
  const isLtrStart = (it: TextItem) => !HEB.test(it.str) && LTRISH.test(it.str.trim())
  const flush = () => {
    if (run.length) {
      out.push(...run.reverse()) // run collected right-to-left → reverse back to LTR
      run = []
    }
  }
  // Joiners ("-", "/", "." …) may only CONTINUE a run when the NEXT item in this
  // descending-x iteration is itself an LTR token — i.e. a joiner joins BETWEEN two LTR
  // tokens (2026 - 01 - 029201). A trailing joiner with no LTR token after it (e.g. a
  // closing ")" at the left edge of the line) is not part of the run — it stays a
  // standalone token in its own visual position.
  for (let idx = 0; idx < rtl.length; idx++) {
    const it = rtl[idx]
    const next = rtl[idx + 1]
    const isJoiner = !HEB.test(it.str) && JOINER.test(it.str.trim())
    const joinerContinuesRun = isJoiner && run.length > 0 && next !== undefined && isLtrStart(next)
    if (isLtrStart(it) || joinerContinuesRun) run.push(it)
    else {
      flush()
      out.push(it)
    }
  }
  flush()
  return out
    .map((i) => i.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Full-PDF extraction for the ingest script. Dynamic import keeps pdfjs out of any
 *  accidental server-bundle path. */
export async function extractPdfPages(data: Uint8Array): Promise<{ pageCount: number; pages: string[] }> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // pdf.js TRANSFERS the buffer it is given (detaching the caller's array — it silently
  // becomes zero-length). Hand it a copy so callers can keep using their bytes; the ingest
  // upload once stored a 0-byte PDF because extraction ran first on the same array.
  const doc = await getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise
  const pages: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const items: TextItem[] = []
    for (const it of tc.items) {
      if ('str' in it) items.push({ str: it.str, x: it.transform[4], y: it.transform[5] })
    }
    pages.push(pgSafe(reassemblePage(items)))
  }
  await doc.destroy()
  return { pageCount: pages.length, pages }
}
