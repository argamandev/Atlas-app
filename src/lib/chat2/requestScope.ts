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

/**
 * WHAT THIS TURN IS GROUNDED IN — spec §2.3's four recipes, as ONE union.
 *
 * Before this, grounding was eight optional fields spread across two request
 * shapes, and the CLIENT held a boolean deciding which backend could honour
 * which combination of them. Two consequences, both of which had already
 * happened: a surface could send a pair of fields no recipe describes (a call id
 * AND a workspace id — grounded in what?), and the question "can the backend
 * honour what this screen is promising" was answered by a hand-maintained `&&`
 * in a component. A union makes the first unrepresentable (M3.3) and gives the
 * second exactly four answers to check.
 *
 * `none` is a REAL recipe, not a fallback: blank Chat, which searches the market.
 * Nothing degrades INTO it — see `parseGrounding`.
 */
export type Grounding =
  /** Chat, blank → search mode over the whole corpus. */
  | { kind: 'none' }
  /** An `@mention`, or the company page → pinpoint, tools scoped to the company. */
  | { kind: 'company'; companyId: string }
  /** A live call or a transcript → that call injected WHOLE (`callInjection.ts`). */
  | { kind: 'call'; transcriptId: string }
  /** Workspace chat → the shelf, via `read_workspace`. Ticket 09 wires the surface. */
  | { kind: 'shelf'; workspaceId: string }

/**
 * AN ACCEPTED SCOPE MUST BE A CONSUMED SCOPE (ticket 07, cold review, BLOCKER).
 *
 * `transcriptId` was here once before. It was uuid-gated, placed on `ChatScope`,
 * and read by NOTHING — no tool handler, no system prompt. The client could send
 * it, the backend took it, and the answer was not grounded in that transcript.
 * That is worse than refusing it: the "open in chat" entry point from a call
 * renders a transcript chip on screen, so the surface promised a grounding the
 * backend had silently dropped — success UI for content the server never used.
 *
 * It is BACK, in the `call` variant, and it is back together with the code that
 * reads it: `loop.ts` injects that call whole before the first model call, and
 * ends the turn visibly when it cannot. That is the only order in which
 * accepting it is honest, and the guard stays mechanical —
 * `requestScope.test.ts` asserts every id this module can produce is consumed
 * somewhere in `src/lib/chat2`.
 */
export interface ScopeIds {
  companyId?: string
  transcriptId?: string
  workspaceId?: string
}

/** The ids a grounding puts on `ChatScope`. One recipe, so at most one id. */
export function scopeIdsFor(g: Grounding): ScopeIds {
  switch (g.kind) {
    case 'none':
      return {}
    case 'company':
      return { companyId: g.companyId }
    case 'call':
      return { transcriptId: g.transcriptId }
    case 'shelf':
      return { workspaceId: g.workspaceId }
  }
}

/**
 * Read the grounding out of an untrusted body — uuid-gated, and REFUSING rather
 * than downgrading.
 *
 * `null` means "the client asked for a grounding I cannot honour", and the route
 * turns that into a 400. It deliberately does NOT fall back to `{kind:'none'}`:
 * a malformed `call` grounding silently becoming a market-wide search is the
 * ticket-07 defect with an extra step — the surface still renders its transcript
 * chip, and the answer is still not from that call. A refused request is visible;
 * a downgraded one is not.
 *
 * An ABSENT grounding is not malformed. It is blank Chat.
 */
export function parseGrounding(body: unknown): Grounding | null {
  const b = (body ?? {}) as Record<string, unknown>
  const g = b.grounding
  if (g == null) return { kind: 'none' }
  if (typeof g !== 'object' || Array.isArray(g)) return null
  const r = g as Record<string, unknown>
  switch (r.kind) {
    case 'none':
      return { kind: 'none' }
    case 'company': {
      const companyId = asUuid(r.companyId)
      return companyId ? { kind: 'company', companyId } : null
    }
    case 'call': {
      const transcriptId = asUuid(r.transcriptId)
      return transcriptId ? { kind: 'call', transcriptId } : null
    }
    case 'shelf': {
      const workspaceId = asUuid(r.workspaceId)
      return workspaceId ? { kind: 'shelf', workspaceId } : null
    }
    default:
      return null
  }
}
