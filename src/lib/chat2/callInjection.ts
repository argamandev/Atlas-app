// ─────────────────────────────────────────────────────────────────────────────
// WHOLE-CALL INJECTION (spec §2.3, ticket 08/B2).
//
// "Ask Atlas on a live call / transcript: that call injected whole (6–18K
// tokens); tools for anything beyond it." A call is small enough to stuff and
// the user is looking AT it, so retrieval over it would be strictly worse: the
// top-k window that best matches "what did the CFO say about margins" is not the
// same thing as the call, and the surface has already promised the call.
//
// TWO PROPERTIES, and both are why this is a module rather than a string
// concatenation in the route:
//
// 1. THE CALL IS UNTRUSTED TEXT. It is a transcription of whatever was said on a
//    a public webcast, and it arrives with speaker names an admin can edit. So it goes
//    through the SAME fence every tool result goes through (`fence.ts`) — anything
//    inside it that looks like an instruction is quoted material, per the static
//    system prompt. A call injected raw would be the one unfenced door into a
//    prompt whose every other door is fenced.
//
// 2. A PARTIAL CALL SAYS SO. `budgetChars` is a real ceiling — a two-hour call
//    genuinely does not fit — and an answer built on the first two thirds of a
//    call, presented identically to one built on all of it, is exactly the
//    invisible degradation `rules/app.md` forbids. So the builder RETURNS whether
//    it truncated, the loop emits it, and the surface renders it. The fact is
//    never inferred downstream from the length of the text.
// ─────────────────────────────────────────────────────────────────────────────

import { fenceSource } from './fence'
import type { ChatSource } from '@/lib/chat/grounding'

/**
 * The chars of call text one turn may carry.
 *
 * Spec §2.3 states the budget in TOKENS (6–18K); this is a char ceiling because
 * that is what can be applied without a tokenizer at request time. 60,000 chars
 * is ~15–17K tokens at the 3.60–4.03 chars/token this repo has measured on its
 * own Hebrew + English prompt blocks (`systemPrompt.ts`), so it sits inside the
 * stated range at BOTH ends of that ratio rather than only at the flattering one.
 *
 * It is not a guess about how long calls are — it is a budget. Whether a given
 * call fits is measured per call, and reported.
 */
export const CALL_BUDGET_CHARS = 60_000

/** The parts of a stored transcript this needs. Structural subset of `Transcript`. */
export interface CallForInjection {
  id: string
  company?: string | null
  quarter?: string | null
  date?: string | null
  speakers?: { id: string; name?: string | null }[] | null
  sections?: { lines: { id: string; speakerId: string; text: string }[] }[] | null
}

export interface CallBlock {
  /** The fenced block, ready to prepend to the turn's first user message. */
  text: string
  /** Did the call fit? `true` means the model saw a PREFIX of the call, not the call. */
  truncated: boolean
  /**
   * What the answer is grounded in, for the citation chip. This is the same fact
   * the old `/api/chat` returned on its `x-chat-source` header, from the same
   * row — so migrating a surface to v2 does not cost it the chip it already had.
   */
  source: ChatSource
}

/**
 * Render one line as `L0031 · Speaker: text`.
 *
 * The LINE ID rides along because the citations contract (spec §2.4) anchors a
 * transcript claim to `transcript_id` + a line range, and a model cannot cite a
 * line it was never shown the id of. Speaker names come from the transcript's own
 * roster; an unknown id renders as a neutral label rather than the raw uuid,
 * which would read to the model as a speaker called `8f2c…`.
 */
function renderLine(
  line: { id: string; speakerId: string; text: string },
  nameOf: (speakerId: string) => string
): string {
  return `${line.id} · ${nameOf(line.speakerId)}: ${line.text}`
}

/**
 * Build the injectable block for one call.
 *
 * PURE, and takes the budget as an argument, so the truncation branch — the one
 * that matters and the one a real call is unlikely to reach in a test — can be
 * driven directly instead of by manufacturing 60,000 characters.
 */
export function buildCallBlock(call: CallForInjection, budgetChars: number = CALL_BUDGET_CHARS): CallBlock {
  const names = new Map((call.speakers ?? []).map((s) => [s.id, (s.name ?? '').trim()]))
  const nameOf = (id: string) => {
    const n = names.get(id)
    return n && n.length > 0 ? n : 'Speaker'
  }

  const lines = (call.sections ?? []).flatMap((s) => s.lines ?? [])

  // Truncation is decided by ACCUMULATION, not by slicing the joined string at
  // the budget: a mid-line cut hands the model half a sentence attributed to a
  // named speaker, which is a fabricated quote waiting to be cited. Whole lines
  // only, and the count of what was dropped is the fact `truncated` reports.
  const kept: string[] = []
  let used = 0
  let truncated = false
  for (const line of lines) {
    const rendered = renderLine(line, nameOf)
    if (used + rendered.length + 1 > budgetChars) {
      truncated = true
      break
    }
    kept.push(rendered)
    used += rendered.length + 1
  }

  const company = (call.company ?? '').trim()
  const quarter = (call.quarter ?? '').trim()
  const date = (call.date ?? '').trim()
  // The label is built from the SAME strings the chip shows, and is defanged by
  // `fenceSource` like every other untrusted label — a company name is stored
  // text, not a constant.
  const label = [company, quarter, date && `(${date})`].filter(Boolean).join(' — ') || 'investor call'

  const body =
    kept.length > 0
      ? kept.join('\n') +
        (truncated
          ? `\n\n[This call was longer than one turn can carry — ${lines.length - kept.length} of ${lines.length} lines are NOT shown. Say so if the answer depends on the part you cannot see.]`
          : '')
      : '(this call has no transcribed lines yet)'

  return {
    text: fenceSource({ kind: 'transcript', label, content: body }),
    truncated,
    source: { company, quarter, transcriptId: call.id },
  }
}
