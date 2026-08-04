import type { ItemContent } from '../contentTypes'

// ─────────────────────────────────────────────────────────────────────────────
// WHAT THE WORKSPACE CHAT IS ALLOWED TO KNOW.
//
// Founder, 2026-08-04: the workspace chat is *"where the user can communicate
// with an llm about the worksapce itself -> questions, data analysis, asking for
// more documents pulling"*. Answering about the workspace means reading what is
// ON it, so the shelf's actual words go into the prompt.
//
// THE BUDGET IS THE HONEST PART. A two-hour call is ~50k characters and a shelf
// can hold several, so everything does not always fit. When it does not, this
// module does NOT quietly send half a document and let the model answer as if it
// had the whole one — it records exactly which items were shortened, and the
// route passes that to the UI to say so. .claude/rules/app.md: degradation must
// be VISIBLE; a confident answer drawn from the first third of a transcript is
// the most expensive kind of invisible.
//
// This is also the seam the founder chose on 2026-08-04 — *"seam now, vectors
// next"*. When retrieval lands, it replaces the "take the first N characters"
// rule below with "take the N most relevant passages"; everything either side of
// this function stays as it is.
// ─────────────────────────────────────────────────────────────────────────────

/** Total characters of source text one prompt may carry. */
export const CONTEXT_BUDGET_CHARS = 120_000

/** Below this a slice is not worth sending — a paragraph of a filing answers
 *  nothing and still invites the model to sound certain. */
const MIN_USEFUL_CHARS = 500

export type SourceText = { itemId: string; title: string; kind: string; text: string }

export type BuiltContext = {
  /** the block that goes in the prompt */
  text: string
  /** titles that were cut short — the UI must say these were partial */
  truncated: string[]
  /** titles that did not fit at all */
  omitted: string[]
}

/** Flatten one item's content into plain text a model can read. */
export function contentToText(content: ItemContent): string {
  if (content.kind === 'transcript') {
    return content.sections
      .map((sec) => {
        const head = sec.title ? `## ${sec.title}\n` : ''
        const body = sec.lines
          .map((l) => `[${l.id}] ${l.speaker ? `${l.speaker}: ` : ''}${l.text}`)
          .join('\n')
        return head + body
      })
      .join('\n\n')
  }
  if (content.kind === 'document') {
    return content.pages.map((p) => `[p.${p.pageNo}]\n${p.text}`).join('\n\n')
  }
  return ''
}

/**
 * Fit the shelf into one prompt, and say what did not fit.
 *
 * Shares the budget EVENLY rather than first-come-first-served: a single long
 * transcript would otherwise consume the whole allowance and leave every other
 * file on the shelf invisible, so a question about "the two calls" would be
 * answered from one of them with no sign that the other was never read.
 */
export function buildContext(sources: SourceText[], budget = CONTEXT_BUDGET_CHARS): BuiltContext {
  const usable = sources.filter((s) => s.text.trim().length > 0)
  if (usable.length === 0) return { text: '', truncated: [], omitted: [] }

  const share = Math.floor(budget / usable.length)
  const truncated: string[] = []
  const omitted: string[] = []
  const parts: string[] = []

  // Short items give their unused allowance back, so a one-page note beside a
  // long call does not cost the call half the prompt.
  let spare = 0
  for (const s of usable) {
    if (s.text.length <= share) spare += share - s.text.length
  }

  for (const s of usable) {
    const allowance = s.text.length <= share ? share : share + spare
    if (s.text.length <= allowance) {
      parts.push(header(s) + s.text)
      continue
    }
    const room = allowance
    if (room < MIN_USEFUL_CHARS) {
      omitted.push(s.title)
      continue
    }
    spare = 0 // the long item just consumed it
    parts.push(header(s) + s.text.slice(0, room))
    truncated.push(s.title)
  }

  return { text: parts.join('\n\n'), truncated, omitted }
}

const header = (s: SourceText) => `\n=== ${s.title} (${s.kind}, id: ${s.itemId}) ===\n`
