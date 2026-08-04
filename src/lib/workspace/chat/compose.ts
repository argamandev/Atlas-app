import { modelObject } from '../intake/json'

// ─────────────────────────────────────────────────────────────────────────────
// ATLAS WRITING INTO THE ANALYST'S DOCUMENT.
//
// Founder, 2026-08-04: *"let atlas write button instead of the continue this
// section button -> this one opens a line where the user can guide atlas what to
// write in the document (like open with a short paragraph about the industry,
// then the board, then talk about why this is a good investment because of 1, 2,
// 3 -> then the user can edit this draft and can go back and forth with him)"*,
// and the same mechanism from the other direction: *"when marking text in the
// workspace … there needs to be a 'connect to document' where … he again gives a
// short description on where to put this text in the document and how."*
//
// THE INVARIANT THAT MAKES THIS SAFE TO USE: **Atlas may ADD to the document. It
// may never rewrite or delete what the analyst already wrote.**
//
// The obvious design — send the document, get the document back — is one bad
// generation away from silently eating a paragraph somebody spent an hour on,
// and this editor has no undo and no persistence yet. So the model returns only
// the NEW passage plus where it goes, and the client splices. The worst failure
// available to it is text in the wrong place, which a person can see and move.
// That is a different order of mistake from work disappearing.
//
// Going "back and forth" therefore means asking again and editing by hand, which
// is what the founder described: *"the user can edit this draft"*.
// ─────────────────────────────────────────────────────────────────────────────

export type ComposeResult = {
  /** the new passage, as a small HTML fragment */
  html: string
  /** an existing heading to place it after, or null for the end of the document */
  afterHeading: string | null
}

export type ComposeInput = {
  instruction: string
  /** the document as it stands, in plain text, so the model can see its shape */
  document: string
  /** the shelf's own words — the same grounding the chat gets */
  context: string
  truncated: string[]
  /** "connect to document": the passage the analyst marked */
  passage?: { title: string; text: string } | null
  /** headings already in the document, so `afterHeading` can only name a real one */
  headings: string[]
}

/** Tags the document editor understands. Anything else is stripped client-side. */
const ALLOWED = ['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'br']

export function buildComposePrompt(input: ComposeInput): string {
  const marked = input.passage
    ? `\nTHE ANALYST MARKED THIS PASSAGE, from "${input.passage.title}", and wants it worked into the document:
"""
${input.passage.text}
"""
Their instruction below says where it should go and how it should read. Quote it
where quoting is right, or work it into your own sentence — but do not change
what it says, and attribute it to "${input.passage.title}".
`
    : ''

  const shape =
    input.document.trim().length === 0
      ? '\nTHE DOCUMENT IS EMPTY. You are writing its opening.\n'
      : `\nTHE DOCUMENT SO FAR:
"""
${input.document.slice(0, 20_000)}
"""
`

  const places =
    input.headings.length === 0
      ? 'The document has no headings yet, so "afterHeading" must be null.'
      : `Existing headings, and the ONLY values "afterHeading" may take besides null:
${input.headings.map((h) => `- ${h}`).join('\n')}`

  const partial =
    input.truncated.length === 0
      ? ''
      : `\nYou were given only PART of these, because they are long: ${input.truncated.join(', ')}.
Do not write anything that depends on a part you cannot see.
`

  return `You are Atlas, drafting inside an equity analyst's own research document.

THE FILES ON THEIR SHELF:
${input.context || '(no readable text is available yet)'}
${partial}${shape}${marked}
WHAT THEY ASKED YOU TO WRITE:
${input.instruction}

${places}

Reply with ONLY a JSON object:
{
  "html": "the new passage as HTML",
  "afterHeading": null
}

Rules:
- WRITE ONLY THE NEW PASSAGE. Never repeat or restate what the document already says — it stays exactly as it is and yours is added to it.
- IN THE SAME LANGUAGE THE ANALYST WROTE THEIR INSTRUCTION IN.
- Ground every factual claim in the files above. If they ask for something the files do not support, write the parts you can and say plainly, in one sentence inside the passage, which part you could not source.
- NEVER invent a number, a date, a name or a quote. This is going into a document an analyst will act on.
- Use only these tags: ${ALLOWED.join(', ')}. No attributes, no styles, no ids, no classes.
- If they asked for several parts ("open with X, then Y, then why Z"), write them as separate paragraphs under short <h2> headings, in the order they asked.
- Write the way a good analyst writes: plain, specific, no filler, no marketing language, no "in conclusion".
- "afterHeading" must be null or EXACTLY one of the headings listed above. Never invent one.`
}

/**
 * Read what Atlas wrote, or null when it is unusable.
 *
 * The HTML is scrubbed here rather than trusted: it is going straight into a
 * contentEditable, so a stray attribute is a live XSS surface and a stray tag
 * silently breaks the editor's own formatting. Allow-list, not deny-list.
 */
export function parseCompose(raw: string, headings: string[]): ComposeResult | null {
  const obj = modelObject(raw)
  if (obj === null) return null

  const html = typeof obj.html === 'string' ? sanitizeFragment(obj.html) : ''
  if (!html.trim()) return null

  const after = typeof obj.afterHeading === 'string' ? obj.afterHeading.trim() : ''
  // A heading the document does not have would silently become "at the end"
  // anyway — being explicit means the caller never searches for a ghost.
  const afterHeading = after && headings.includes(after) ? after : null

  return { html, afterHeading }
}

/**
 * Keep the allowed tags, drop everything else, and strip EVERY attribute.
 *
 * Deliberately not a regex-based "remove script tags" — that is the approach
 * that always loses. This keeps only `<tag>` and `</tag>` for names on the list
 * and turns every other angle-bracketed run into nothing, so `onerror=`,
 * `javascript:` hrefs and `<img src=x>` have no way through: the attribute is
 * gone with the tag it lived on.
 */
export function sanitizeFragment(html: string): string {
  return (
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      // THESE GO WITH THEIR CONTENTS. Unwrapping them the way an unknown <div>
      // is unwrapped would leave `alert(1)` or `body{display:none}` sitting in
      // the document as literal prose — harmless, but it is not writing, and a
      // fragment made only of that would then count as a usable draft. Every
      // other unrecognised tag is unwrapped instead, because
      // `<a href=…>click</a>` still means "click".
      .replace(/<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '')
      // An unclosed one of the same family: drop from the tag to the end.
      .replace(/<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*$/gi, '')
      .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_m, tag: string) => {
        const name = tag.toLowerCase()
        if (!ALLOWED.includes(name)) return ''
        return _m.startsWith('</') ? `</${name}>` : `<${name}>`
      })
      // Anything still holding an angle bracket is not markup we recognise.
      .replace(/<(?![/a-zA-Z])/g, '&lt;')
      .trim()
  )
}
