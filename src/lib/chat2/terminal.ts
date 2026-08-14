// ─────────────────────────────────────────────────────────────────────────────
// WHICH TERMINAL EVENT ENDS A TURN — one pure function, so the decision can be
// enumerated instead of trusted.
//
// WHY THIS FILE EXISTS. Round 2's cold review rejected the claim that splitting
// `done` from `incomplete` made a truncated answer "unrepresentable". The split
// is real but it only closes CALLER-side conflation: a caller can no longer read
// one as the other. WHICH of them gets emitted was still decided by inline `if`s
// scattered down the loop — and incomplete guards were exactly what round 1's two
// blockers were. The union alone would not have caught `max_tokens`. Round 2 then
// measured three more holes in those same guards:
//
//   * a clean stop carrying NO text ended in `done` — success with nothing, the
//     one state the loop's header swears cannot exist;
//   * when every tool of a turn errored, the source pool stayed empty, so the
//     `pool ? verify : skip` guard switched citation checking OFF and an invented
//     quote ended in `done`;
//   * a failing dynamic import threw straight out of the generator, ending the
//     stream with ZERO terminal events.
//
// So the honest split of the law is: **impossible** that one terminal event means
// both things (the type does that), and **test** that the right one is chosen
// (this function does that, exhaustively). Overclaiming the first to cover the
// second is what round 2 called a BLOCKER, and it was right — a law that looks
// more enforced than it is, is worse than one honestly marked partial.
//
// The inputs are the FACTS the decision rests on (M3.2), never proxies for them.
// `anySourceSurvived` in particular is not the same question as "is the pool
// non-empty": a turn whose tools all failed has an empty pool AND ran tools, and
// those two cases must not share a branch.
// ─────────────────────────────────────────────────────────────────────────────

// `IncompleteCode` and the terminal event types now live in `protocol.ts` — the
// one declaration both the server and the surface import (08a.2). They were split
// across this file (the type) and `api/chat2.ts` (a hand-maintained runtime array
// consulted by the parser), which let a newly added code parse as
// `stopped_unknown` with the whole battery green. Re-exported here because this
// module's own interface is stated in terms of them.
export type { IncompleteCode } from './protocol'
import type { IncompleteCode } from './protocol'

/** The stop reason a non-clean stop maps to. One place, so code and prose agree. */
export function stopReasonCode(stop: string | null): IncompleteCode {
  if (stop === 'max_tokens') return 'length_limit'
  if (stop === 'refusal') return 'model_refused'
  if (stop === 'pause_turn') return 'model_paused'
  return 'stopped_unknown'
}

/** The terminal events. Exactly one ends every turn, and it is always last. */
export type TerminalEvent = { type: 'done' } | { type: 'incomplete'; code: IncompleteCode; reason: string }

/** `stop_reason`s meaning the model finished saying what it meant to. */
export const CLEAN_STOPS = new Set(['end_turn', 'stop_sequence'])

export interface TerminalFacts {
  /** Anthropic's `stop_reason` for the final message. `null` is not clean. */
  stopReason: string | null
  /** Did the turn actually emit any answer text? */
  anyTextEmitted: boolean
  /** Quotes in the answer that could NOT be verified against the turn's sources. */
  unverifiedQuotes: number
  /** Did at least one tool return a non-error result this turn? */
  anySourceSurvived: boolean
  /** Did the turn call any tool at all? Distinguishes "ungrounded" from "all failed". */
  anyToolRan: boolean
  /** Did the loop exhaust its tool round-trip budget with work still in flight? */
  roundTripCapHit: boolean
}

export function stopReasonExplanation(stop: string | null): string {
  if (stop === 'max_tokens') return 'the answer hit its length limit before finishing'
  if (stop === 'refusal') return 'the model declined to continue this answer'
  if (stop === 'pause_turn') return 'the model paused this turn before finishing'
  return `the model stopped unexpectedly (${stop ?? 'no reason given'})`
}

/**
 * The ONE place a turn's ending is decided. Ordered most-severe first, because
 * several of these can be true at once and the user must be told the worst true
 * thing — not the first one an `if` chain happened to reach.
 */
export function decideTerminal(facts: TerminalFacts): TerminalEvent {
  if (facts.roundTripCapHit) {
    return {
      type: 'incomplete',
      code: 'round_trip_cap',
      reason: 'reached the tool round-trip limit before finishing — try a narrower question',
    }
  }
  // Tools ran and every one of them failed. The answer above is built on nothing,
  // and — the round-2 hole — an empty source pool ALSO disables quote verification,
  // so this is precisely when an invented quote is least likely to be caught.
  if (facts.anyToolRan && !facts.anySourceSurvived) {
    return {
      type: 'incomplete',
      code: 'all_sources_failed',
      reason: 'every source lookup failed this turn, so nothing here could be grounded or verified',
    }
  }
  if (facts.unverifiedQuotes > 0) {
    return {
      type: 'incomplete',
      code: 'unverified_quote',
      reason: 'a quoted claim could not be verified against its source',
    }
  }
  if (!CLEAN_STOPS.has(facts.stopReason ?? '')) {
    return {
      type: 'incomplete',
      code: stopReasonCode(facts.stopReason),
      reason: stopReasonExplanation(facts.stopReason),
    }
  }
  // A clean stop that said nothing is still nothing. Reporting it as a finished
  // answer is the "success with nothing" the degradation law forbids.
  if (!facts.anyTextEmitted) {
    return {
      type: 'incomplete',
      code: 'no_answer_text',
      reason: 'the model returned no answer text',
    }
  }
  return { type: 'done' }
}
