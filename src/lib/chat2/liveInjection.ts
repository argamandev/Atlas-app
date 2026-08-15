// ─────────────────────────────────────────────────────────────────────────────
// LIVE-CAPTION INJECTION (spec §2.3, ticket 08c-2).
//
// The live view's "Ask Atlas" is grounded in what is ON SCREEN RIGHT NOW: the
// captions produced so far by the running engine. There is no stored transcript
// yet — the row is written when the call ends — so unlike `callInjection.ts`
// there is nothing to load. THE TEXT ARRIVES FROM THE CLIENT, and that single
// difference is what this module exists to hold honestly:
//
// 1. IT IS UNTRUSTED IN A WAY THE CALL TEXT IS NOT. A stored call is untrusted
//    because a webcast said it; these captions are untrusted because a REQUEST
//    BODY said it. So they go through the same fence every other source does
//    (`fence.ts`) — quoted material, never instructions — and the label rides the
//    fence attribute line where `fenceSource` defangs and escapes it.
//
// 2. THE LABEL IS NOT INSIDE THE CAPTIONS. Which company is speaking has to
//    survive truncation, and it cannot if it is the first 30 characters of a
//    stream that gets cut from the front. It is a separate field for that reason
//    alone.
//
// 3. TRUNCATION KEEPS THE *END*, and this is the one place this module
//    deliberately disagrees with `callInjection.ts`. A finished call is read from
//    the top; a live call is being watched, and the question a user types during
//    it is overwhelmingly about what was just said. Keeping the head would drop
//    exactly the material the surface is pointing at. Either way the fact that
//    something was dropped is RETURNED, never inferred downstream from a length.
//
// 4. THERE IS A REAL "NOTHING YET" STATE. The panel can be opened before the
//    first caption arrives, and that is not an error — it is a live call that has
//    not said anything yet. It gets its own sentence, so the model says so rather
//    than answering from the corpus underneath a caption that reads "Atlas is
//    following this call live".
// ─────────────────────────────────────────────────────────────────────────────

import { fenceSource } from './fence'

/**
 * The chars of caption text one turn may carry.
 *
 * The same budget as a whole stored call (`CALL_BUDGET_CHARS`) and for the same
 * arithmetic — ~15–17K tokens at the 3.60–4.03 chars/token this repo has measured
 * on its own Hebrew + English blocks, which sits inside spec §2.3's stated 6–18K
 * range at both ends of that ratio. Held as its own constant rather than imported
 * from `callInjection.ts`: the two are equal today by coincidence of the same
 * budget, not because one derives from the other, and a live call that needs a
 * different ceiling must not have to move the stored-call one.
 */
export const LIVE_BUDGET_CHARS = 60_000

// The REQUEST-SIZE ceilings on the same text live at the gate that applies them
// (`requestScope.ts`), not here. They answer a different question from the budget
// above — "is this a plausible caption payload at all", versus "how much of a
// legitimate one fits in a turn" — and putting them in one file has already
// invited exactly one reader to conflate them.

/**
 * What the SYSTEM PROMPT is told about a live-grounded turn.
 *
 * A CONSTANT, never interpolated — the same property that lets the call gate be a
 * shape gate rather than an injection gate. Exported for the same reason
 * `CALL_SCOPE_SUMMARY` is: the route and `scripts/measure-chat-answer.mjs` both
 * need the prompt that actually ships.
 *
 * It says the captions are LIVE and ROUGH on purpose. They are machine
 * transcription of a call still in progress, unreviewed and mid-sentence at the
 * end; a model told only "here is the call" will read a truncated final clause as
 * a completed statement and quote it as one.
 */
export const LIVE_SCOPE_SUMMARY =
  'The user is WATCHING an investor call happen right now. The fenced block on this turn is the ' +
  'live machine transcription so far — unreviewed, possibly mis-transcribed, and cut off wherever ' +
  'the call has currently reached. Answer from it first; never present its last, unfinished ' +
  'sentence as a completed statement, and use tools only for anything beyond this call.'

/**
 * The sentence the model gets when a live call has not been transcribed yet.
 *
 * ONE DECLARATION, because BOTH routes need it while `/api/chat` is alive (it
 * dies at 08c-3) and the two had already drifted at review: the legacy copy
 * carried the description without the instruction, so the weaker of the two
 * sentences was the one telling the model not to answer from its own knowledge.
 * A duplicated prompt fragment is the same defect class `protocol.ts` exists to
 * have deleted — two declarations, one consulted, no mechanism noticing.
 */
export const NO_CAPTIONS_YET =
  '(this call is live, but nothing has been transcribed yet) ' +
  'Say that the call has not said anything you can read yet, rather than answering from anything else.'

/**
 * KEEP THE MOST RECENT `maxChars`, snapped forward to a word boundary.
 *
 * THE CHOKE POINT FOR *WHICH HALF* (M3.1), and it is one because the two routes
 * had already disagreed. This module cut from the front; the old `/api/chat` cut
 * `slice(0, 40_000)` — the opposite half, with no notice — so a snip attached
 * during a long live call was answered from the OPENING of the call underneath a
 * panel promising the live edge. Two cuts, two directions, one screen: exactly
 * the invisible degradation this stack keeps re-learning.
 *
 * So the direction is decided in ONE function that every caller passes through,
 * rather than in each caller's own `slice`. Callers still choose their own
 * ceiling — they legitimately differ — but not which end survives.
 */
export function keepRecent(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  let kept = text.slice(text.length - maxChars)
  // Snap forward to the next whitespace so the block does not open on half a
  // word — a fragment the model can read as a name it then attributes a claim to.
  const firstSpace = kept.search(/\s/)
  if (firstSpace !== -1) kept = kept.slice(firstSpace + 1)
  return { text: kept.trimStart(), truncated: true }
}

/**
 * What the model is told when the earlier part of a live call did not fit.
 *
 * ONE DECLARATION, for the same reason `NO_CAPTIONS_YET` is: BOTH routes cut, so
 * both must say they cut. Round 3 of review caught the legacy route taking
 * `keepRecent(...).text` and dropping the `truncated` flag on the floor — the
 * identical cut, silently, while v2 announced it. Sharing the direction without
 * sharing the notice fixed half a defect.
 */
export const LIVE_TRUNCATION_NOTICE =
  '[This call has run longer than one turn can carry. The EARLIER part of it is NOT shown — ' +
  'what follows is only the most recent stretch. Say so if the answer depends on the part you cannot see.]'

export interface LiveCaptions {
  /** The caption text so far. May be empty — a call that has not spoken yet. */
  captions: string
  /** Whose call it is, e.g. `אורמת — Q2 2026`. Untrusted; defanged by the fence. */
  label?: string
}

export interface LiveBlock {
  /** The fenced block, ready to prepend to the turn's first user message. */
  text: string
  /** `true` means the model saw the RECENT PART of the captions, not all of them. */
  truncated: boolean
}

/**
 * Build the injectable block for a live call's captions so far.
 *
 * PURE, and takes the budget as an argument, so the truncation branch can be
 * driven directly instead of by manufacturing 60,000 characters.
 */
export function buildLiveBlock(input: LiveCaptions, budgetChars: number = LIVE_BUDGET_CHARS): LiveBlock {
  const captions = (input.captions ?? '').trim()
  const label = (input.label ?? '').trim() || 'live investor call'

  if (!captions) {
    // NOT an error and NOT an empty block. "Nothing has been said yet" is a state
    // the live surface can genuinely be in, and the model has to be told which of
    // "there is no call" and "the call has not spoken yet" it is looking at — the
    // three-states lesson `callInjection.ts` learned at review.
    return {
      text: fenceSource({ kind: 'live_captions', label, content: NO_CAPTIONS_YET }),
      truncated: false,
    }
  }

  const { text: kept, truncated } = keepRecent(captions, budgetChars)

  const body = truncated ? `${LIVE_TRUNCATION_NOTICE}\n\n${kept}` : kept

  return { text: fenceSource({ kind: 'live_captions', label, content: body }), truncated }
}
