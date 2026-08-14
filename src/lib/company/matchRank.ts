// ─────────────────────────────────────────────────────────────────────────────
// HOW WELL DID THE TYPED TERM MATCH? — the @-mention dropdown's ordering.
//
// Split out of `db/companies.ts` for the same reason `toolDefs.ts` was split out
// of `tools.ts`: that module imports `supabaseAdmin`, which constructs a client
// at load, so nothing in it can be reached from a test process. The ordering rule
// is the part that was WRONG at review and the part a future edit is most likely
// to "simplify", so it is the part that needs a test.
//
// THE DEFECT IT EXISTS FOR. The first version of alias search put every alias hit
// in front of every name hit and then took the top 20. A broad Hebrew stem —
// "בנק" — matches twenty aliases and evicted the company whose name the user had
// typed EXACTLY. Ordering by which query found a row is a proxy for relevance
// (M3.2); the fact relevance actually rests on is how well the term matches the
// text, so that is what this measures.
// ─────────────────────────────────────────────────────────────────────────────

/** Lower is better. 0 exact · 1 prefix · 2 contains · 3 no textual match. */
export const NO_TEXTUAL_MATCH = 3

/**
 * Rank a company against the typed term over every name it is known by.
 *
 * Deliberately crude — three tiers, no fuzzy distance. It only has to stop a weak
 * infix hit outranking an exact one, which is the whole defect. Rank 3 is
 * reachable and is not a bug: an alias can match Postgres's `ilike` (which folds
 * case per its own collation) without matching this comparison, and such a row
 * should sort last rather than be dropped.
 */
export function matchRank(term: string, candidates: (string | null | undefined)[]): number {
  const t = term.trim().toLowerCase()
  if (!t) return NO_TEXTUAL_MATCH
  let best = NO_TEXTUAL_MATCH
  for (const raw of candidates) {
    if (!raw) continue
    const v = String(raw).trim().toLowerCase()
    if (v === t) return 0
    if (v.startsWith(t)) best = Math.min(best, 1)
    else if (v.includes(t)) best = Math.min(best, 2)
  }
  return best
}
