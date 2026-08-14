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
//
// ...EXCEPT THAT `transcripts.id` IS NOT A UUID, and the sentence above said it
// was for a whole ticket. Measured against the live database (2026-08-15, while
// verifying 08b): `transcripts.id` is `text`, holding YouTube ids and slugs —
// `PyuMxe88e8g`, `PyuMxe88e8g_live`, `live-finish-demo-tamis-2026-06-14`. Only
// `company_id` and `user_id` are uuid columns there.
//
// It went unnoticed because ticket 07 uuid-gated `transcriptId` and then removed
// it for being CONSUMED BY NOTHING — a field no code reads is a field whose
// validator can be wrong forever. The moment 08b wired it to a real handler, the
// gate would have refused 100% of real calls with a 400: every "open in chat"
// from a call, dead, in a way no unit test written against a made-up uuid could
// see. Found by looking up an actual id before driving the surface, which is why
// `/verify-app` insists on real data (M1 — a green test answers the question you
// typed).
// ─────────────────────────────────────────────────────────────────────────────

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A uuid, or nothing. Never a caller-shaped string that merely looks like an id. */
export function asUuid(v: unknown): string | undefined {
  return typeof v === 'string' && UUID_RE.test(v) ? v : undefined
}

/**
 * A TRANSCRIPT id — a `text` primary key, so this cannot be the uuid gate.
 *
 * WHAT THE GATE IS ACTUALLY FOR, since "it is a uuid" is no longer available as
 * the argument. Two questions, and the answer differs:
 *
 *   * Does this string reach the SYSTEM PROMPT? No. A `call` grounding's scope
 *     summary is a CONSTANT sentence — the id is not interpolated into it, unlike
 *     `companyId`, which is (`/api/chat/v2/route.ts`). That is the path round 1
 *     of ticket 06 found and closed, and this id does not travel it.
 *   * Does it reach a QUERY? Yes — `.eq('id', …)`, parameterized by the Supabase
 *     client, so it is data there rather than syntax.
 *
 * So this is a SHAPE gate, not an injection gate: the charset of an id, bounded.
 * Everything an injection payload needs — whitespace, newlines, quotes, angle
 * brackets, the fence delimiter — is outside it, and it still admits every id the
 * live table actually holds. It is deliberately narrower than "any text" and
 * deliberately wider than a uuid, and saying which of the two it is protecting
 * against matters more than the pattern: a gate whose stated reason is wrong gets
 * widened by the next person for a reason nobody can check.
 */
export const TRANSCRIPT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export function asTranscriptId(v: unknown): string | undefined {
  return typeof v === 'string' && TRANSCRIPT_ID_RE.test(v) ? v : undefined
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
      // NOT `asUuid` — `transcripts.id` is `text`. See `asTranscriptId`.
      const transcriptId = asTranscriptId(r.transcriptId)
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
