// Which image, if any, represents a company.
//
// PURE, AND IN ITS OWN FILE ON PURPOSE. This lived inside `lib/db/companies.ts`,
// which imports `server-only`, so no test could reach it — and what it did
// wrong was invisible to every gate in the repo for months.

export type CompanyLogoRow = {
  logo_url?: unknown
  tase_security_id?: unknown
  name?: unknown
  display_name?: unknown
}

/**
 * Bundled logos for seed companies whose `logo_url` is not in the database.
 * Keyed on `tase_security_id` — an EXACT identifier, never a name.
 */
export const BUNDLED_LOGO_BY_SECURITY_ID: Record<string, string> = {
  '1105022': '/logos/tigbur.jpg',
  '1083955': '/logos/qualitau.png',
  '1097229': '/logos/tamis.png',
}

/**
 * ⚠ WHAT THIS FUNCTION NO LONGER DOES, AND WHY IT MUST NOT DO IT AGAIN.
 *
 * It used to guess a logo from a two-letter run in the Hebrew name:
 *
 *     if (name.includes('רג')) return '/logos/rga.png'
 *
 * That fires ONLY for rows with no `logo_url` — which, after the MAYA sync, is
 * exactly the 14 of 234 companies whose logo we deliberately store as null
 * because MAYA serves them a shared placeholder. So the companies with NO logo
 * were the only ones eligible to be handed the WRONG one.
 *
 * Measured against the live database: 14 rows have `logo_url is null`, and one
 * matches — **ארגו פרופרטיז** (issuer 1884), which was rendering רג"א's brand
 * mark on Home, on 224 calendar pills, in the hover card and in the page header.
 * Found by the supervisor's review, on the branch that made logos visible
 * everywhere; the line itself is older than that branch.
 *
 * A missing logo draws a monogram. A guessed one asserts the wrong company on
 * an investor product. Those are not comparable failures.
 */
export function resolveCompanyLogo(r: CompanyLogoRow): string | null {
  if (typeof r.logo_url === 'string' && r.logo_url) return r.logo_url
  const tid = typeof r.tase_security_id === 'string' ? r.tase_security_id : ''
  return (tid && BUNDLED_LOGO_BY_SECURITY_ID[tid]) || null
}
