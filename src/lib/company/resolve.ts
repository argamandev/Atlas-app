// ─────────────────────────────────────────────────────────────────────────────
// "בז\"א" → the בית זיקוק אשדוד companies row.
//
// The company resolver over the seeded `company_aliases` table (smart-layer
// slice A2, spec §2.2 `resolve_company`). Resolving the company FIRST and
// filtering retrieval by `company_id` was the single biggest measured
// retrieval multiplier (MRR 0.300 → 0.365), and this function is how user
// language reaches that filter.
//
// Pure over rows the caller loaded, like `maya/issuers.ts` — no database in
// this layer, which is what lets the בז"א MUST-PASS case (eval case 14) run
// green offline.
//
// AMBIGUITY RETURNS null, AND THAT IS THE POINT. The corpus holds documents of
// BOTH refineries — בז"א (issuer 1361) and בז"ן (issuer 259) — so a resolver
// that guessed between near-matches would hand an analyst the wrong refinery's
// filings under the name they typed. A query matching two companies resolves
// to neither; an unknown name resolves to null, honestly.
// ─────────────────────────────────────────────────────────────────────────────

import { normaliseCompanyName, wordsOf, identifyingWords } from '@/lib/maya/issuers'

/** The four founder-approved kinds, mirroring the migration's CHECK constraint. */
export type CompanyAliasKind = 'registered' | 'abbreviation' | 'ticker' | 'latin'

/** One row of `company_aliases`, as the resolver needs it. */
export type CompanyAliasRow = {
  companyId: string
  alias: string
  kind: CompanyAliasKind
}

/**
 * Resolve user language to a company id, or null.
 *
 * TWO PASSES, the same shape `resolveIssuer` proved on the MAYA directory:
 *
 * 1. Exact, after normalisation — gershayim, quote flavours, the corporate
 *    suffix and casing all collapse, so בז"א · בז״א · בזא are one alias.
 * 2. COVERAGE: every identifying word the user typed must appear in the
 *    candidate alias. Asymmetric in the safe direction: "דוראל" finds
 *    "דוראל אנרגיה" (its identifying word is covered), while "זיקוק" finds
 *    neither refinery (both cover it — a tie is silence).
 *
 * Either pass answers only if exactly ONE company qualifies.
 */
export function resolveCompany(query: string, rows: CompanyAliasRow[]): string | null {
  const q = normaliseCompanyName(query)
  if (!q) return null

  const unique = (matches: CompanyAliasRow[]): string | null => {
    const ids = new Set(matches.map((m) => m.companyId))
    return ids.size === 1 ? matches[0].companyId : null
  }

  const exact = rows.filter((r) => normaliseCompanyName(r.alias) === q)
  if (exact.length > 0) return unique(exact)

  // A query made entirely of industry words identifies nothing — "אנרגיה" is
  // a sector, not a company. Silence is the only honest answer. This same
  // check is the short-fragment floor: `wordsOf` (issuers.ts) drops tokens
  // under 3 chars, so "א"-sized fragments arrive here as an empty list — one
  // floor, owned by the module that learned it when "א" resolved to אמות.
  const needed = identifyingWords(q)
  if (needed.length === 0) return null

  const covered = rows.filter((r) => {
    const have = new Set(wordsOf(normaliseCompanyName(r.alias)))
    return needed.every((w) => have.has(w))
  })
  return covered.length > 0 ? unique(covered) : null
}
