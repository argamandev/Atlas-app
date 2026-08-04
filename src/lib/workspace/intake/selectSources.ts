import type { AttachableSource } from '../data'
import type { IntakeSelection } from './types'
import { modelObject } from './json'

// ─────────────────────────────────────────────────────────────────────────────
// THE REASONING STEP.
//
// Why this exists, in the founder's words (2026-08-04): *"i asked him to bring me
// the two quarterly reports of 2026 (the first and the second) + to bring the
// last transcribed investor call. he showed me 6 files -> that doesn't even make
// sense."*
//
// He was right, and the cause was the shape of the previous design rather than a
// bug in it. The intake turned a sentence into a FILTER — company, year range,
// kinds — and a filter cannot express "the first and second quarter", "the last
// one", or "two of these and one of those". So it resolved the company correctly
// and then returned everything it had, which reads as not listening.
//
// The fix is to stop filtering and start SELECTING: hand the model the actual
// candidate files and let it choose, then let it answer in its own words.
//
// THE HONESTY INVARIANT IS UNCHANGED AND IS ENFORCED HERE, NOT PROMISED IN THE
// PROMPT: the model may only return ids that were given to it. Anything else is
// dropped by `parseSelection` before it can reach a shelf, so no sentence the
// model writes can conjure a file that does not exist.
// ─────────────────────────────────────────────────────────────────────────────

/** Beyond this the candidate list is too big to hand a model in one go. */
export const SELECTION_CANDIDATE_CAP = 80

const kindLabel = (k: AttachableSource['kind']) => (k === 'transcript' ? 'call' : 'report')

export function buildSelectionPrompt(corpus: AttachableSource[], request: string): string {
  const lines = corpus.map(
    (s) =>
      `- id: ${s.sourceId} | type: ${kindLabel(s.kind)} | company: ${s.company ?? 'unknown'} | date: ${
        s.when ? s.when.slice(0, 10) : 'unknown'
      } | title: ${s.title}`
  )

  return `You are Atlas, helping an equity analyst set up a research workspace.

Below is EVERY file Atlas currently holds. Choose exactly the ones the analyst asked for.

FILES:
${lines.join('\n')}

ANALYST'S REQUEST: ${request}

Reply with ONLY a JSON object:
{
  "reply": "one or two sentences addressed to the analyst, IN THE SAME LANGUAGE THEY WROTE IN, saying what you are adding and — if any part of the request cannot be met — exactly what is missing and why",
  "selected": ["id", "id"]
}

Rules:
- Use ONLY ids from the list above. Never invent a file.
- Honour counts and ordering. "the last call" means the single most recent type:call. "the two 2026 quarterly reports" means exactly those two reports, not every report.
- Read quarters and years out of the titles (Q1, Q2, רבעון ראשון, רבעון שני, and so on).
- Prefer being precise over being generous. Returning six files when three were asked for is a failure.
- If part of the request cannot be met, still select what you can, and SAY plainly in "reply" what is missing.
- If nothing matches, return an empty "selected" and explain why in "reply".
- Do not describe the files' contents. You have only their titles.`
}

/**
 * Read the model's selection, keeping only ids that really exist.
 *
 * Returns null when the answer is unusable — the caller then falls back to the
 * deterministic path and the panel says so, rather than presenting an empty or
 * invented result as an answer.
 */
export function parseSelection(raw: string, corpus: AttachableSource[]): IntakeSelection | null {
  const obj = modelObject(raw)
  if (obj === null) return null

  const reply = typeof obj.reply === 'string' ? obj.reply.trim() : ''
  // A selection with no sentence is not the conversational answer this step
  // exists to produce, so it is refused rather than rendered wordlessly.
  if (!reply) return null

  if (!Array.isArray(obj.selected)) return null

  const known = new Set(corpus.map((s) => s.sourceId))
  const seen = new Set<string>()
  const selectedIds: string[] = []
  const dropped: string[] = []

  for (const raw of obj.selected) {
    if (typeof raw !== 'string') continue
    const id = raw.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    // THE GUARD. A model that hallucinated a plausible-looking id would
    // otherwise put a file on the shelf that cannot be opened.
    if (known.has(id)) selectedIds.push(id)
    else dropped.push(id)
  }

  return { reply, selectedIds, dropped }
}

/** The selected sources, in the model's chosen order, then everything else. */
export function orderBySelection(
  corpus: AttachableSource[],
  selectedIds: string[]
): { selected: AttachableSource[]; others: AttachableSource[] } {
  const byId = new Map(corpus.map((s) => [s.sourceId, s]))
  const selected = selectedIds.map((id) => byId.get(id)).filter((s): s is AttachableSource => s !== undefined)

  const chosen = new Set(selectedIds)
  const others = corpus.filter((s) => !chosen.has(s.sourceId))
  return { selected, others }
}
