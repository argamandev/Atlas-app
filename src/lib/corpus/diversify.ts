// ─────────────────────────────────────────────────────────────────────────────
// SEARCH MODE MUST NOT ANSWER ABOUT ONE COMPANY (spec §2.5.6, measured on eval
// case 04).
//
// A market-wide question has no scope to fall back on, so the top-k comes back
// ranked purely by similarity — and similarity clusters. One issuer whose filings
// happen to phrase the topic the way the user did takes the whole head of the
// list, and Chat then answers a question about the market with evidence from a
// single company while looking entirely confident. That is the "success with
// nothing" shape one level up: not an empty answer, a CONFIDENTLY NARROW one.
//
// This is a pure reordering over rows the caller already ranked. It never
// promotes a worse row above a better one from the same company — it only
// interleaves companies, so the leads the surface renders are per-company by
// construction rather than by the model's good manners.
//
// It runs ONLY unscoped. In pinpoint mode every row is the one company the user
// asked about and diversifying would be actively wrong.
// ─────────────────────────────────────────────────────────────────────────────

/** The only field diversification reads. Anything with a company id qualifies. */
export interface HasCompany {
  companyId: string
}

export interface DiversifyOptions {
  /** Total rows to return. */
  limit: number
  /** Ceiling per company — the anti-monopoly bound. */
  perCompany: number
}

/**
 * Round-robin the ranking across companies.
 *
 * Companies enter the rotation in the order their BEST row appeared, so the
 * single top-ranked row is still first; from there each pass takes one row per
 * company. `limit` and `perCompany` are both hard ceilings.
 */
export function diversifyByCompany<T extends HasCompany>(
  ranked: readonly T[],
  { limit, perCompany }: DiversifyOptions
): T[] {
  // Insertion order of a Map is the order keys were first seen — which is the
  // order of each company's best row, exactly the tie-break we want.
  const byCompany = new Map<string, T[]>()
  for (const row of ranked) {
    const bucket = byCompany.get(row.companyId)
    if (bucket) bucket.push(row)
    else byCompany.set(row.companyId, [row])
  }

  const out: T[] = []
  for (let pass = 0; pass < perCompany && out.length < limit; pass++) {
    for (const bucket of Array.from(byCompany.values())) {
      if (out.length >= limit) break
      const row = bucket[pass]
      if (row) out.push(row)
    }
  }
  return out
}
