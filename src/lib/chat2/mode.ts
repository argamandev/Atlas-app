// ─────────────────────────────────────────────────────────────────────────────
// PINPOINT OR SEARCH — the mode, decided as a FUNCTION OF SCOPE, never of prose.
//
// WHY THIS IS A FILE AND NOT AN `if`. Spec §2.3: "Mode is deterministic — never a
// hidden classifier guess." `app.md`'s classifier-visible-failure law says the
// same thing from the other end: a decision resting on natural language over an
// open vocabulary can only be made honest by making its failure visible, and
// Hebrew and English both have unbounded ways to name a company. So Atlas does
// not try. The mode reads ONE fact — did `resolve_company` (or the user's own
// `@mention`) produce a company id — and nothing else. There is deliberately no
// `question: string` parameter here: the type makes "guess the mode from the
// words" unrepresentable rather than merely discouraged (M3.3).
//
// The user is the fallback the classifier would have been. Search mode is shown
// on screen and is one tap from pinpoint, so when Atlas is in the wrong mode the
// user can see it and say so — which is exactly the "buy visible failure" the law
// asks for, bought here instead of a longer word list.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `pinpoint` — grounded in ONE company's calls and filings.
 * `search` — market-wide, answered as leads, per-company diversified (§2.5.6).
 */
export type ChatMode = 'pinpoint' | 'search'

/** The only fact the mode rests on. */
export interface ModeFacts {
  /** The resolved company, or nothing. An empty string is nothing, not a company. */
  companyId?: string | null
}

export function chatMode(facts: ModeFacts): ChatMode {
  return facts.companyId ? 'pinpoint' : 'search'
}

/**
 * Should the loop emit a `mode` event?
 *
 * `prev === null` means nothing has been announced yet, so the OPENING mode is
 * always emitted — a surface that only heard about changes would render its own
 * default until the first `resolve_company` landed, and a default is a guess.
 */
export function modeChanged(prev: ChatMode | null, next: ChatMode): boolean {
  return prev !== next
}
