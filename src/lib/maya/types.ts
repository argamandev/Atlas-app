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
