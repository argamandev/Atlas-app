// ─────────────────────────────────────────────────────────────────────────────
// SOURCE FENCING — every tool result that quotes untrusted text (corpus content,
// filing titles, web pages) is wrapped so the model can tell "material to answer
// from" apart from "instructions to obey" (spec §2.2 law 2, §2.9). Closes the
// slice-2 BLOCKER: undefanged fence-line titles let a filing's own title string
// break out of the fence and read as a system instruction.
//
// DEFANG, NOT STRIP. Deleting suspicious text would silently answer from a
// document with a different title than the one on screen — the same "corpus
// content is unrepresentable" failure app.md's degradation law forbids. Instead
// every occurrence of the fence delimiter inside untrusted text is broken so it
// cannot close the fence early, and the delimiter itself is never a raw
// substring of what the model receives back as "content".
// ─────────────────────────────────────────────────────────────────────────────

const FENCE_OPEN = '<<<ATLAS-SOURCE>>>'
const FENCE_CLOSE = '<<<END-ATLAS-SOURCE>>>'

/**
 * Break any occurrence of our own fence delimiters (or a lookalike built out of
 * the same tokens) inside untrusted text, so quoted content can never forge a
 * fence boundary. Applied to titles, labels AND body content alike — a title
 * is exactly as untrusted as a quote.
 */
export function defang(text: string): string {
  if (!text) return text
  return text
    .replace(/<<<\s*ATLAS-SOURCE\s*>>>/gi, '<​<<ATLAS-SOURCE>​>>')
    .replace(/<<<\s*END-ATLAS-SOURCE\s*>>>/gi, '<​<<END-ATLAS-SOURCE>​>>')
}

export interface SourceToFence {
  /** e.g. "transcript", "filing", "web" — never user-supplied. */
  // `live_captions` is deliberately distinct from `transcript`: one is a stored,
  // reviewed call, the other is machine transcription of a call still running,
  // and the model is told to treat their last sentence differently (08c-2).
  kind: 'transcript' | 'filing' | 'filing_fact' | 'web' | 'disclosure' | 'workspace' | 'live_captions'
  /** Human label — untrusted (a filing/company title), always defanged. */
  label: string
  /** The quoted body — untrusted, always defanged. */
  content: string
}

/**
 * Wrap one source in the fence, titles and body both defanged. The label rides
 * on its own attribute line so a defanged title cannot be mistaken for content.
 */
export function fenceSource(source: SourceToFence): string {
  // Escaped so a title containing `"` cannot close the attribute early and forge
  // a second kind=/label= pair on the same line — the fence boundary itself was
  // already intact, but an unescaped quote let the attribute LINE be spoofed.
  const label = defang(source.label).replace(/"/g, '\\"')
  const body = defang(source.content)
  return `${FENCE_OPEN} kind=${source.kind} label="${label}"\n${body}\n${FENCE_CLOSE}`
}

export function fenceSources(sources: SourceToFence[]): string {
  return sources.map(fenceSource).join('\n\n')
}
