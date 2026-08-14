// ─────────────────────────────────────────────────────────────────────────────
// THE CLIENT-SUPPLIED IDS, GATED AT ONE POINT.
//
// Round 1 found `companyId` arriving from the request body and reaching the SYSTEM
// prompt raw, via `scopeSummary`, in the route whose whole ticket is injection
// discipline — a client could put arbitrary instruction text there. Round 2 then
// noted the fix was correct but inline and unexportable, so nothing tested the one
// guard standing between a request body and the system prompt.
//
// It lives here for that reason. The gate belongs where scope is BUILT, not at the
// interpolation (M3.1): every downstream use — the prompt, the tool handlers, the
// queries — flows through this one point, so closing the prompt path cannot leave
// the others open. All three ids name `uuid` columns, so anything else is not an
// id, and refusing it costs nothing a real client can feel.
// ─────────────────────────────────────────────────────────────────────────────

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A uuid, or nothing. Never a caller-shaped string that merely looks like an id. */
export function asUuid(v: unknown): string | undefined {
  return typeof v === 'string' && UUID_RE.test(v) ? v : undefined
}

export interface ClientScopeIds {
  companyId?: string
  transcriptId?: string
  workspaceId?: string
}

/** Pull the three client-supplied ids out of an untrusted body, uuid-gated. */
export function clientScopeIds(body: unknown): ClientScopeIds {
  const b = (body ?? {}) as Record<string, unknown>
  return {
    companyId: asUuid(b.companyId),
    transcriptId: asUuid(b.transcriptId),
    workspaceId: asUuid(b.workspaceId),
  }
}
