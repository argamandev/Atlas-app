// ─────────────────────────────────────────────────────────────────────────────
// "תיגבור" → 1460.
//
// MAYA is keyed by issuer number and users speak company names, so this is the
// hinge the whole feature turns on. It is a pure function over rows the caller
// loaded, which keeps it testable and keeps this layer free of any database.
//
// AMBIGUITY RETURNS null, AND THAT IS THE POINT. Attaching the wrong company's
// annual report is far worse than asking which one was meant — it is a wrong
// answer wearing the costume of a right one, and the analyst has no way to
// notice. So a query matching two issuers resolves to neither.
//
// Note `tase_security_id` is NOT this number: Tigbur is issuer 1460 and
// security 1105022, unrelated schemes.
// ─────────────────────────────────────────────────────────────────────────────

export type IssuerRow = { issuerId: number; nameHe: string | null; nameEn: string | null }

/** Shortest run of characters allowed to stand in for a company name. */
const MIN_FRAGMENT = 3

/** Hebrew and English company names carry a lot of noise that is never part of
 *  what a person types: the corporate suffix, quote marks in several Unicode
 *  flavours, and inconsistent spacing. */
export function normaliseCompanyName(s: string): string {
  return (
    s
      .normalize('NFKC')
      // geresh/gershayim and every quote variant collapse away entirely, so
      // בע"מ · בע״מ · בע'מ are the same string by the time we compare
      .replace(/["'`׳״‘’“”]/g, '')
      .replace(/[־–—]/g, ' ')
      // NOT `\b`: JavaScript word boundaries are defined over [A-Za-z0-9_], so
      // every Hebrew letter reads as a non-word character and `\bבעמ\b` never
      // matches anything. Space-or-edge is the boundary that actually exists here.
      .replace(/(^|\s)(בעמ|בע מ)(?=\s|$)/g, ' ')
      .replace(/\b(ltd|limited|inc|corp|plc|co)\b/gi, ' ')
      .replace(/[.,;:()[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  )
}

/** Every name a row can be known by, normalised. */
function namesOf(row: IssuerRow): string[] {
  return [row.nameHe, row.nameEn].filter((v): v is string => !!v && !!v.trim()).map(normaliseCompanyName)
}

/**
 * Resolve a company name to an issuer, or null.
 *
 * Three passes, narrowest first: exact, then prefix, then substring. Each pass
 * only answers if it found exactly ONE issuer — a tie falls through to the next
 * pass and, failing that, to null.
 */
export function resolveIssuer(query: string, rows: IssuerRow[]): IssuerRow | null {
  const q = normaliseCompanyName(query)
  if (!q) return null

  const unique = (matches: IssuerRow[]): IssuerRow | null => {
    const ids = new Set(matches.map((m) => m.issuerId))
    return ids.size === 1 ? matches[0] : null
  }

  const exact = rows.filter((r) => namesOf(r).some((n) => n === q))
  if (exact.length > 0) return unique(exact)

  // A FRAGMENT SHORTER THAN THIS IS NOT A COMPANY NAME. Without this floor a
  // single Hebrew letter prefix-matches exactly one issuer in a small
  // directory and resolves confidently to it — which is how "א" became אמות.
  if (q.length < MIN_FRAGMENT) return null

  const contains = rows.filter((r) => namesOf(r).some((n) => n.includes(q) || q.includes(n)))
  if (contains.length > 0) {
    const hit = unique(contains)
    if (hit) return hit
  }

  // A DISTINCTIVE SHARED WORD, which is what Hebrew word order needs.
  // "קבוצת תיגבור בע\"מ" and MAYA's "תיגבור קבוצה" are the same company, but
  // neither string contains the other and קבוצת/קבוצה differ by construct
  // state. The word that identifies the company — תיגבור — is shared, and a
  // word this long is distinctive enough to match on. Still unique-or-nothing:
  // "בנק" is shared by every bank and therefore resolves to none of them.
  const qTokens = new Set(q.split(' ').filter((t) => t.length >= MIN_FRAGMENT))
  if (qTokens.size === 0) return null
  const shared = rows.filter((r) =>
    namesOf(r).some((n) => n.split(' ').some((t) => t.length >= MIN_FRAGMENT && qTokens.has(t)))
  )
  return shared.length > 0 ? unique(shared) : null
}
