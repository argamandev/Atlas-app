import type { AttachableSource } from '../data'
import type { IntakeSelection, IntakeTurn } from './types'
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

export function buildSelectionPrompt(
  corpus: AttachableSource[],
  conversation: IntakeTurn[],
  /** the ids this conversation has already settled on, if any */
  proposal: string[] = []
): string {
  const lines = corpus.map(
    (s) =>
      `- id: ${s.sourceId} | type: ${kindLabel(s.kind)} | company: ${s.company ?? 'unknown'} | date: ${
        s.when ? s.when.slice(0, 10) : 'unknown'
      } | title: ${s.title}`
  )

  const talk = conversation.map((t) => `${t.role === 'user' ? 'ANALYST' : 'YOU'}: ${t.content}`).join('\n')

  // THE SET, STATED. Without this the model had to re-read its own prose every
  // turn to work out what it had already proposed — which is exactly how it
  // came to name two files and then pull one (founder, 2026-08-04).
  const byId = new Map(corpus.map((s) => [s.sourceId, s]))
  const standing =
    proposal.length === 0
      ? ''
      : `\nTHE FILES YOU ALREADY PROPOSED, and the analyst is responding to THESE:
${proposal
  .map((id) => {
    const s = byId.get(id)
    return `- id: ${id}${s ? ` | ${s.title}` : ''}`
  })
  .join('\n')}
Carry every one of them forward unless the analyst asks to take it out. If they
agree, "selected" must contain ALL of these ids — dropping one is a mistake, not
a shortcut. If they ask to remove one, put it in "removed".
`

  return `You are Atlas, helping an equity analyst set up a research workspace.

You are having a short, ordinary conversation with them — like a colleague, not a form.

FILES ATLAS HOLDS:
${lines.join('\n')}
${standing}
CONVERSATION SO FAR:
${talk}

Reply with ONLY a JSON object:
{
  "reply": "what you say next, IN THE SAME LANGUAGE THE ANALYST IS WRITING IN",
  "status": "clarifying" | "ready",
  "selected": ["id", "id"],
  "removed": ["id the analyst asked to take out, if any"]
}

How to behave:
- Work out which files they mean, then CONFIRM IN WORDS before doing anything: name the files you intend to pull, in a sentence, and ask if that is right. status = "clarifying".
- Write it the way a person would speak — "just to confirm, you want the Q1 2026 board report and the latest investor call?". NEVER a numbered list, a bulleted list, or anything resembling checkboxes.
- If they ask to add, drop or change something, adjust and confirm again. status = "clarifying".
- ONLY when their LATEST message agrees — "כן", "yes", "pull them", "תמשוך", "בוא נתחיל", "go ahead" — set status = "ready", put the final ids in "selected", and let "reply" say you are pulling them in now. Never set "ready" off your own guess; they have to say so.
- NEVER ASK THE SAME CONFIRMATION TWICE. If your previous message already named the files and their reply agrees — even a bare "כן" or "yes" — that IS their agreement: go to "ready". Asking again is the single worst thing you can do here; it reads as not listening.
- If they agree AND add something in the same breath ("כן, אבל תוסיף גם…"), that is a change: confirm the new combined set once, then go on their next agreement.
- Honour counts and ordering. "the last call" means the single most recent type:call. "the two 2026 quarterly reports" means exactly those two, not every report.
- Read quarters and years out of the titles (Q1, Q2, רבעון ראשון, רבעון שני, and so on).
- If something they asked for is not in the list, say so plainly and carry on with the rest.
- Use ONLY ids from the list above. Never invent a file.
- NEVER write an id inside "reply". The analyst must never see one. Refer to a file by its title and date, the way you would say it out loud.
- Do not describe the files' contents. You have only their titles.
- Two or three sentences at most.`
}

/**
 * Take internal ids back out of a sentence meant for a person.
 *
 * The prompt forbids them, and the model still wrote them — observed in the
 * browser 2026-08-04: *"רק מוודא – אתה מתכוון לדוח הדירקטוריון Q1 2026 של תיגבור
 * (e231c676-23d6-4a86-8d02-…) ולשיחת המשקיעים (PyuMxe88e8g_live)?"*. A uuid in
 * the middle of a Hebrew sentence is precisely the "talking to a machine" feel
 * this step exists to remove, so the instruction is backed by a deterministic
 * scrub rather than trusted on its own.
 *
 * Only ids the corpus actually contains are removed, so nothing else in the
 * user's own words can be eaten by accident.
 */
function stripIds(text: string, corpus: AttachableSource[]): string {
  let out = text
  for (const s of corpus) {
    if (s.sourceId.length < 6) continue // too short to remove safely
    out = out.split(s.sourceId).join('')
  }
  return (
    out
      // brackets left holding nothing once the id inside them is gone
      .replace(/\(\s*[-–—,;:]*\s*\)/g, '')
      .replace(/\[\s*[-–—,;:]*\s*\]/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .trim()
  )
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

  const spoken = typeof obj.reply === 'string' ? obj.reply.trim() : ''
  // A selection with no sentence is not the conversational answer this step
  // exists to produce, so it is refused rather than rendered wordlessly.
  if (!spoken) return null
  const reply = stripIds(spoken, corpus)

  if (!Array.isArray(obj.selected)) return null

  // ANYTHING that is not exactly "ready" is treated as still talking. A model
  // that omits the field, or misspells it, must not be able to trigger a pull
  // the user never agreed to — the safe default is to keep the conversation
  // going, because that costs a message and the other mistake costs trust.
  const status = obj.status === 'ready' ? ('ready' as const) : ('clarifying' as const)

  const known = new Set(corpus.map((s) => s.sourceId))
  const dropped: string[] = []

  /** Real, de-duplicated ids from one of the model's arrays. */
  const readIds = (raw: unknown, recordUnknown: boolean): string[] => {
    if (!Array.isArray(raw)) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const entry of raw) {
      if (typeof entry !== 'string') continue
      const id = entry.trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      // THE GUARD. A model that hallucinated a plausible-looking id would
      // otherwise put a file on the shelf that cannot be opened.
      if (known.has(id)) out.push(id)
      else if (recordUnknown) dropped.push(id)
    }
    return out
  }

  const selectedIds = readIds(obj.selected, true)
  // An unknown id in `removed` removes nothing and is not worth alarming about —
  // only invented SELECTIONS are the dangerous direction.
  const removedIds = readIds(obj.removed, false)

  return { reply, status, selectedIds, removedIds, dropped }
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
