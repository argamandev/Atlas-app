// ─────────────────────────────────────────────────────────────────────────────
// What goes INTO `company_aliases` — the derivation, pure and tested.
//
// `scripts/seed-company-aliases.ts` loads the live `companies` rows and writes
// whatever this module derives; keeping the derivation here is what lets the
// בז"א MUST-PASS case prove the whole chain (companies → seed → resolver)
// offline, before a single row is inserted.
//
// COLLISIONS ARE DROPPED, NOT ARBITRATED. The table's UNIQUE(alias) and the
// resolver's ambiguity-is-null rule both say the same thing: an alias that two
// companies would share is a seeding decision a human makes explicitly, never
// a coin-flip. So the builder drops the alias from BOTH companies and reports
// it — the seed script prints the report for the founder to rule on.
// ─────────────────────────────────────────────────────────────────────────────

import { normaliseCompanyName } from '@/lib/maya/issuers'
import type { CompanyAliasKind } from './resolve'

/** A live `companies` row, as the seed needs it. */
export type CompanySeedSource = {
  id: string
  name: string | null
  displayName: string | null
  nameEn: string | null
  taseSecurityId: string | null
  taseIssuerId: string | null
}

export type AliasSeedRow = {
  companyId: string
  alias: string
  kind: CompanyAliasKind
}

/**
 * HAND-CURATED, KEYED BY ISSUER ID — the one company identifier that is a fact
 * rather than a spelling. Every entry here was verified against the record
 * before it was added; a wrong alias is another company's filings arriving
 * under the name the analyst typed, so this list grows slowly and only with
 * verified pairs.
 *
 * - בז"א → issuer 1361, בית זיקוק אשדוד (eval case 14's MUST-PASS; case 13
 *   proved the issuer id).
 * - בז"ן → issuer 259, בתי זיקוק (eval case 09 — users say בז"ן, the row says
 *   בתי זיקוק). NOT the same company as בז"א; the corpus holds both refineries.
 * - ORL → issuer 259 — Oil Refineries Ltd, Bazan's Latin name and TASE symbol.
 */
export const CURATED_ABBREVIATIONS: ReadonlyArray<{
  taseIssuerId: string
  alias: string
  kind: CompanyAliasKind
}> = [
  { taseIssuerId: '1361', alias: 'בז"א', kind: 'abbreviation' },
  { taseIssuerId: '259', alias: 'בז"ן', kind: 'abbreviation' },
  { taseIssuerId: '259', alias: 'ORL', kind: 'latin' },
]

/**
 * Derive the full seed for `company_aliases` from live company rows.
 *
 * Per company: `name` and `display_name` as `registered`, `name_en` as
 * `latin`, `tase_security_id` as `ticker` — deduped within the company by
 * normalized form — plus the curated abbreviations matched by issuer id.
 * A curated alias whose issuer is not in the input is reported, never guessed.
 */
export function buildAliasSeed(companies: CompanySeedSource[]): {
  rows: AliasSeedRow[]
  collisions: { alias: string; companyIds: string[] }[]
  unmatchedCurated: string[]
} {
  const candidates: AliasSeedRow[] = []

  for (const c of companies) {
    const sources: Array<{ value: string | null; kind: CompanyAliasKind }> = [
      { value: c.name, kind: 'registered' },
      { value: c.displayName, kind: 'registered' },
      { value: c.nameEn, kind: 'latin' },
      { value: c.taseSecurityId, kind: 'ticker' },
    ]
    const seen = new Set<string>()
    for (const { value, kind } of sources) {
      const alias = value?.trim()
      if (!alias) continue
      const norm = normaliseCompanyName(alias)
      if (!norm || seen.has(norm)) continue
      seen.add(norm)
      candidates.push({ companyId: c.id, alias, kind })
    }
  }

  const byIssuer = new Map<string, CompanySeedSource>()
  for (const c of companies) if (c.taseIssuerId) byIssuer.set(c.taseIssuerId, c)

  const unmatchedCurated: string[] = []
  for (const cur of CURATED_ABBREVIATIONS) {
    const company = byIssuer.get(cur.taseIssuerId)
    if (!company) {
      unmatchedCurated.push(cur.alias)
      continue
    }
    candidates.push({ companyId: company.id, alias: cur.alias, kind: cur.kind })
  }

  // Cross-company collisions, judged on the NORMALIZED form — the resolver
  // compares normalized strings, so two raw-distinct spellings of one form
  // collide exactly as hard as identical ones.
  const byNorm = new Map<string, AliasSeedRow[]>()
  for (const row of candidates) {
    const norm = normaliseCompanyName(row.alias)
    const bucket = byNorm.get(norm)
    if (bucket) bucket.push(row)
    else byNorm.set(norm, [row])
  }

  const rows: AliasSeedRow[] = []
  const collisions: { alias: string; companyIds: string[] }[] = []
  byNorm.forEach((bucket) => {
    const ids = Array.from(new Set(bucket.map((r) => r.companyId)))
    if (ids.length === 1) rows.push(bucket[0])
    else collisions.push({ alias: bucket[0].alias, companyIds: ids })
  })

  return { rows, collisions, unmatchedCurated }
}

/** One already-seeded `company_aliases` row, as the drift check needs it. */
export type ExistingAliasRow = { alias: string; companyId: string }

/**
 * What a re-run may INSERT, and what it must REPORT instead.
 *
 * The table accumulates across runs while `buildAliasSeed` only sees the
 * current derivation, so UNIQUE(alias) alone would silently swallow the one
 * case a human must rule on: a derived alias whose normalized form is already
 * seeded under a DIFFERENT company (review finding, 2026-08-13). Judged on the
 * normalized form because that is what the resolver compares — a raw-distinct
 * spelling under a second company would otherwise turn a working alias
 * ambiguous at runtime.
 */
export function diffAliasSeedAgainstExisting(
  derived: AliasSeedRow[],
  existing: ExistingAliasRow[]
): {
  toInsert: AliasSeedRow[]
  drifted: { alias: string; derivedCompanyId: string; existingCompanyIds: string[] }[]
} {
  const existingByNorm = new Map<string, Set<string>>()
  for (const row of existing) {
    const norm = normaliseCompanyName(row.alias)
    const bucket = existingByNorm.get(norm)
    if (bucket) bucket.add(row.companyId)
    else existingByNorm.set(norm, new Set([row.companyId]))
  }

  const toInsert: AliasSeedRow[] = []
  const drifted: { alias: string; derivedCompanyId: string; existingCompanyIds: string[] }[] = []
  for (const row of derived) {
    const owners = existingByNorm.get(normaliseCompanyName(row.alias))
    if (!owners) {
      toInsert.push(row)
    } else if (!(owners.size === 1 && owners.has(row.companyId))) {
      drifted.push({
        alias: row.alias,
        derivedCompanyId: row.companyId,
        existingCompanyIds: Array.from(owners),
      })
    }
    // already seeded under the same company: nothing to do, nothing to report
  }
  return { toInsert, drifted }
}
