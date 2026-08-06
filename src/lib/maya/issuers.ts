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

/**
 * WORDS THAT NAME AN INDUSTRY, NOT A COMPANY.
 *
 * Israeli corporate names are built out of a small set of these, and they are
 * exactly the length that looks "distinctive" to a naive matcher. Before this
 * list existed, "אלוני חץ נכסים", "נכסים ובנין" and "מבני תעשיה נכסים" — three
 * different, real TASE companies — all resolved to "לוינשטין נכסים", because
 * נכסים was shared and happened to be unique in the rows being searched.
 *
 * A confidently wrong company is the worst outcome this module has: it is not
 * an error the analyst can see, it is another company's annual report arriving
 * under the name they asked for, and on agreement it writes into shared corpus.
 */
const GENERIC_TOKENS = new Set([
  // Hebrew
  'קבוצת',
  'קבוצה',
  'אחזקות',
  'החזקות',
  'השקעות',
  'נכסים',
  'תעשיות',
  'תעשיה',
  'תעשייה',
  'שירותי',
  'שירותים',
  'מערכות',
  'טכנולוגיות',
  'טכנולוגיה',
  'פיתוח',
  'בנייה',
  'בניה',
  'בניין',
  'בנין',
  'ובנין',
  'מוצרי',
  'בית',
  'בתי',
  'מבני',
  'ישראל',
  'ישראלית',
  'הישראלית',
  'לישראל',
  'בנק',
  'ביטוח',
  'פיננסים',
  'אנרגיה',
  'נדלן',
  'מסחר',
  'סחר',
  'כללי',
  'מרכז',
  'תקשורת',
  'חברה',
  'חברת',
  'בעמ',
  // English
  'group',
  'holdings',
  'holding',
  'industries',
  'investments',
  'properties',
  'systems',
  'technologies',
  'technology',
  'services',
  'israel',
  'bank',
  'insurance',
  'energy',
  'development',
  'international',
  'global',
  'company',
])

const wordsOf = (s: string): string[] => s.split(' ').filter((t) => t.length >= MIN_FRAGMENT)

/** The words that actually identify a company, industry nouns removed. */
const identifyingWords = (s: string): string[] => wordsOf(s).filter((t) => !GENERIC_TOKENS.has(t))

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
 * TWO PASSES, and the second one carries the whole safety argument.
 *
 * 1. Exact, after normalisation.
 * 2. COVERAGE: every identifying word the analyst typed must appear in the
 *    candidate's name. Not "shares a word with" — that was the original rule
 *    and it resolved three different real companies to a fourth, because they
 *    all contain נכסים. Requiring the query to be fully accounted for makes the
 *    test asymmetric in the safe direction: "קבוצת תיגבור בע\"מ" resolves to
 *    "תיגבור קבוצה" (its only identifying word, תיגבור, is there), while
 *    "אלוני חץ נכסים" resolves to nothing (אלוני and חץ are not).
 *
 * Either pass answers only if exactly ONE issuer qualifies. A tie is silence.
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

  // A QUERY MADE ENTIRELY OF INDUSTRY WORDS IDENTIFIES NOTHING. "בנק" is every
  // bank; "נכסים" is a third of the exchange. Silence is the only honest answer.
  const needed = identifyingWords(q)
  if (needed.length === 0) return null

  const covered = rows.filter((r) =>
    namesOf(r).some((n) => {
      const have = new Set(wordsOf(n))
      return needed.every((w) => have.has(w))
    })
  )
  return covered.length > 0 ? unique(covered) : null
}
