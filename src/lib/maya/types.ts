// The MAYA / TASE Data Hub wire types, exactly as the API returns them.
//
// Verified against live 200s on 2026-08-06 — see `docs/MAYA-API.md`. The odd
// spelling of `assosiated` is TASE's, not a typo here; renaming it would be
// inventing a contract we do not control.

export type MayaEvent = { eventId: number; eventName: string }

export type MayaIssuerRef = {
  issuerId: number
  issuerName: string
  assosiated?: boolean
}

export type MayaAttachedFile = { url: string }

export type MayaFiling = {
  publicationDate: string
  mayaReportId: number
  isPriorityReport?: boolean
  /**
   * NULL WHENEVER THE FEED IS READ IN ENGLISH. The `en-US` catalog carries no
   * titles at all, which is why `Accept-Language: he-IL` is not a locale
   * preference but a hard requirement (`config.ts`).
   */
  title: string | null
  isCorrection?: boolean
  url: string | null
  issuer: MayaIssuerRef[]
  events: MayaEvent[]
  attachedFiles: MayaAttachedFile[]
}

/**
 * A row of the LIVE FILINGS FEED (`latest-companies-disclosures`, product 1.0.0).
 *
 * NEARLY `MayaFiling`, AND THE DIFFERENCES ARE THE ENTIRE REASON THIS TYPE EXISTS
 * — measured against both endpoints on 2026-08-14, not assumed:
 *   `attachedfiles`  lower-case f. `attachedFiles` appears on 0% of this feed's
 *                    rows and 100% of `by-issuer`'s.
 *   `associated`     v2 carries TASE's own misspelling, `assosiated`.
 * Typing it as `MayaFiling` would compile, run, find no attachments on any row,
 * and quietly ingest nothing forever.
 */
export type MayaLatestRow = Omit<MayaFiling, 'attachedFiles' | 'issuer'> & {
  attachedfiles?: MayaAttachedFile[]
  issuer: Array<{ issuerId: number; issuerName: string; associated?: boolean }>
}

/** `latest-companies-disclosures` does NOT use `MayaEnvelope` — same story as
 *  `company-details`, a different wrapper per product version. */
export type MayaLatestResponse = {
  mayaReports?: { result?: MayaLatestRow[] | null } | null
}

/** A row of the financial-report schedule — consumers ③ (calendar) and ④ (live). */
export type MayaScheduleRow = {
  scheduledDate: string
  scheduledTime: string | null
  financialReportTypeId: number
  issuerId: number
  year: number
  periodTypeId: number
  timeZone: string | null
  url: string | null
}

/** Every list endpoint answers in this envelope. */
export type MayaEnvelope<T> = {
  data: T[]
  meta?: { total?: number; hasMore?: boolean; keyset?: unknown }
}

/**
 * A company profile row from `company-details` (MAYA product version 1.0.0).
 *
 * EVERY FIELD IS OPTIONAL ON PURPOSE. Measured across all 1,630 rows on
 * 2026-08-09: `sector` was present on every one, `website` on 1,005, and
 * `email`/`incorporation`/`securityIncludedIndices` are null on plenty. Typing
 * the sparse ones as required would make the parser lie about the feed.
 */
export type MayaCompanyDetail = {
  issuerId: number
  issuerName?: string | null
  /** Space-padded and hierarchical: `"ריאלי-מסחר ושרותים-שרותים          "`. */
  sector?: string | null
  /** The business description MAYA's own company page prints under אודות החברה. */
  about?: string | null
  /** Bare host, no scheme: `"www.tigbur.co.il"`. */
  website?: string | null
  address?: string | null
  zip?: string | null
  phone?: string | null
  fax?: string | null
  email?: string | null
  incorporation?: string | null
  /** Index membership with weights. Not consumed yet — it needs a table of its own. */
  securityIncludedIndices?: { securityId: number; indexCd: number; weight: number; factor: number }[] | null
}

/**
 * `company-details` does NOT use `MayaEnvelope`. It answers
 * `{ getCompanyDetails: { result: [...], total: n } }`, which is why this has
 * its own type rather than reusing the one every other endpoint shares.
 */
export type MayaCompanyDetailsResponse = {
  getCompanyDetails?: { result?: MayaCompanyDetail[] | null; total?: number } | null
}

/**
 * Why a call did not produce data.
 *
 * A DISCRIMINATED UNION RATHER THAN AN Error, because the callers must answer
 * different questions with each: an unreachable MAYA has to be SAID to the
 * analyst ("I could not reach MAYA"), while a 400 is our bug and must never be
 * dressed up as "there are no filings". Collapsing them into one Error is how a
 * coverage failure starts reading like an empty result.
 */
export type MayaFailure =
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited' }
  | { kind: 'bad_request'; fields: Record<string, string[]> }
  | { kind: 'unavailable'; detail?: string }

export type MayaResult<T> = { ok: true; data: T } | { ok: false; failure: MayaFailure }

/** A one-line, human-readable rendering — for logs and thrown messages, never for the UI
 *  (the UI says it in the user's own language from a dictionary key). */
export function describeFailure(f: MayaFailure): string {
  switch (f.kind) {
    case 'unauthorized':
      return 'MAYA rejected the API key'
    case 'rate_limited':
      return 'MAYA rate limit exceeded'
    case 'bad_request':
      return `MAYA rejected the request: ${Object.entries(f.fields)
        .map(([k, v]) => `${k}: ${v.join('; ')}`)
        .join(' | ')}`
    case 'unavailable':
      return f.detail ? `MAYA unavailable (${f.detail})` : 'MAYA unavailable'
  }
}
