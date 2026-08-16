// ─────────────────────────────────────────────────────────────────────────────
// WHICH CAVEAT THE INTAKE PANEL SHOWS — one function, one answer.
//
// The panel can be honest about five different things and may say only ONE, so
// the order between them IS the meaning: name the failure closest to the user's
// question, because a second explanation for the same missing result reads as a
// second problem. Until 09b this order lived in a nested ternary in the
// component, next to the wording — which is exactly where a fourth case gets
// appended in the wrong place and nobody can see it happen.
//
// The WORDING still belongs to the component (both locales live there). This
// decides only WHICH thing is true, from facts the server sent.
// ─────────────────────────────────────────────────────────────────────────────

import type { IntakeResponse } from './types'

export type IntakeNotice =
  /** they TYPED a name no issuer matches — the useful answer is "pick it with @" */
  | 'unknown_company'
  /**
   * They already PICKED it with `@` and the row has no MAYA issuer id.
   *
   * Its own state because the sentence must not be the one above: advising `@`
   * to someone who just used `@` answers a dead end with the action that
   * produced it (round-5 review, pass B — the same law one layer down from
   * where this commit had already broken it once).
   */
  | 'pinned_company_unreachable'
  /** the company resolved, MAYA did not answer */
  | 'maya_unreachable'
  /** no company survived, so MAYA was never asked */
  | 'request_not_understood'
  /** the company came from a pin; only the period/kind were unreadable */
  | 'request_partly_understood'
  /** the model's words and its ids disagreed, and its own sentence is on screen */
  | 'unresolved'
  | null

export function chooseIntakeNotice(r: {
  unknownCompany: IntakeResponse['unknownCompany']
  /** how that company was named — see `pinned_company_unreachable` */
  unknownCompanyFrom: IntakeResponse['unknownCompanyFrom']
  sourceError: IntakeResponse['sourceError']
  /** whether there is an unresolved-selection line worth saying at all */
  hasUnresolvedLine: boolean
  /** whether the model's OWN sentence is being shown this turn */
  hasReply: boolean
}): IntakeNotice {
  // FIRST, because it is the most specific answer to "why did I not get that
  // company's files". Saying MAYA was unreachable about a company we never
  // identified is a second, wrong explanation for one missing result.
  //
  // `!= null` and NOT truthiness: a pinned row with an empty name arrives as
  // `''`, which is a real degradation wearing a falsy value (09b review).
  if (r.unknownCompany != null) {
    return r.unknownCompanyFrom === 'pin' ? 'pinned_company_unreachable' : 'unknown_company'
  }

  if (r.sourceError === 'maya_unreachable') return 'maya_unreachable'
  if (r.sourceError === 'request_not_understood') return 'request_not_understood'
  // Narrower than the line above and mutually exclusive with it by construction:
  // the route raises this one only when a company WAS settled.
  if (r.sourceError === 'request_partly_understood') return 'request_partly_understood'

  // Last, and only beside the model's own sentence — with `reply === null` the
  // same line becomes the spoken turn instead, and saying it twice is worse
  // than saying it once.
  if (r.hasUnresolvedLine && r.hasReply) return 'unresolved'
  return null
}
