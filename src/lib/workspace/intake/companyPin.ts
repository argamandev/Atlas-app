// ─────────────────────────────────────────────────────────────────────────────
// WHICH COMPANY THE INTAKE SEARCHES — one function, given the facts.
//
// Two things can name a company on an intake turn: a row the analyst POINTED AT
// with `@`, and a name the filter model READ out of their sentence. Deciding
// between them inside the route, in the branch where each arrives, is how the
// same lie gets four doors (rules/app.md M3.1) — so both facts come here and
// exactly one answer leaves.
//
// THE PIN OUTRANKS THE SENTENCE, always. The analyst picked a row out of a list;
// no reading of their prose is better evidence than that. It also means a
// clarification is a PICK rather than a re-spelling, which is the whole reason
// this exists: `בז"א`, `בית הזיקוק באשדוד` and one typo all resolve to nothing
// against MAYA's registered names, and on 2026-08-15 the founder watched Atlas
// answer "I don't have their documents" about a company holding 12 filings.
//
// AND THE PIN CARRIES ITS OWN FAILURE. A company row without a
// `tase_issuer_id` cannot be searched on MAYA at all (1 of 234 today), and that
// is not the same event as "I could not read a company out of your sentence" —
// it is a named company Atlas cannot reach. It leaves here as `unknownCompany`
// under the name the analyst SAW on the chip, never silently as "no company",
// which would search nothing and say nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveIssuer, type IssuerRow } from '@/lib/maya/issuers'

/**
 * The pinned company, as the ROUTE read it out of the database — never as the
 * browser reported it. The client sends an id; the issuer number behind that id
 * is a fact about the shared corpus, and a request body is not allowed to state
 * it. Null when nothing was pinned, or when the id named no company.
 */
export type PinnedCompany = {
  /** MAYA's ISSUER id as stored on `companies`, or null if that row has none. */
  taseIssuerId: string | null
  /** What the analyst is looking at on the chip. Used only to name a failure. */
  name: string
}

export type IntakeCompany = {
  /** The issuer to ask MAYA about, or null when there is nothing to ask. */
  issuerId: number | null
  /** A company that was NAMED and could not be reached. Drives the panel's notice. */
  unknownCompany: string | null
  /**
   * WHICH way that company was named, because the two are different dead ends
   * and one sentence cannot serve both (round-5 review, pass B).
   *
   * `name` — they typed something no issuer matches, so the useful answer is
   * "pick it from the list with @".
   * `pin`  — they ALREADY picked it from the list and the row carries no MAYA
   * issuer id. Telling them to use `@` would advise the action that just
   * failed; the honest sentence is that Atlas cannot look this company up at
   * all.
   */
  unknownCompanyFrom: 'pin' | 'name' | null
  /**
   * Whether a company was settled at all — by either route.
   *
   * The route raises `request_not_understood` when the filter model fails, and
   * that notice tells the analyst their COMPANY could not be worked out and
   * that only Atlas's own library was searched. With a pin that reached MAYA
   * both halves are untrue, so the flag is gated on this rather than on the
   * model's success alone (rules/app.md M2 — never certify an untrue premise).
   */
  settled: boolean
}

/**
 * Decide the company for one intake turn.
 *
 * `modelCompany` is what the filter stage read, already parsed — null when it
 * read none or did not answer. `issuerRows` is the MAYA directory the
 * name-matching path searches; it is untouched by the pin path, which needs no
 * matching at all.
 */
export function resolveIntakeCompany(
  pin: PinnedCompany | null,
  modelCompany: string | null,
  issuerRows: IssuerRow[]
): IntakeCompany {
  if (pin) {
    // `Number()` on a stored id, not a body field: `''` and a non-numeric row
    // both become "named but unreachable" rather than issuer 0, which MAYA
    // would answer for somebody.
    const issuerId = Number(pin.taseIssuerId)
    if (pin.taseIssuerId && Number.isInteger(issuerId) && issuerId > 0) {
      return { issuerId, unknownCompany: null, unknownCompanyFrom: null, settled: true }
    }
    return { issuerId: null, unknownCompany: pin.name, unknownCompanyFrom: 'pin', settled: true }
  }

  if (!modelCompany) {
    return { issuerId: null, unknownCompany: null, unknownCompanyFrom: null, settled: false }
  }

  const issuer = resolveIssuer(modelCompany, issuerRows)
  // SAID, NOT GUESSED — the resolver returns null for an unknown name AND for
  // an ambiguous one, and both mean the same thing here: do not present local
  // results as an answer to a question about a company we never identified.
  if (!issuer) {
    return { issuerId: null, unknownCompany: modelCompany, unknownCompanyFrom: 'name', settled: false }
  }
  return { issuerId: issuer.issuerId, unknownCompany: null, unknownCompanyFrom: null, settled: true }
}
