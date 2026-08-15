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

// The snip byte limits are NOT redeclared here. `lib/chat/attachments.ts` is the
// one declaration and still gates the workspace routes; two copies of "how big
// may a snipped PNG be" is two answers waiting to disagree. That module is pure
// (no `server-only`), so importing it keeps this one client-safe.
import { ATTACHMENT_MAX, ATTACHMENT_MAX_B64, PNG_DATA_URL_PREFIX } from '@/lib/chat/attachments'

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

/**
 * The hard ceiling on the CAPTION TEXT a live-grounded request may carry.
 *
 * NOT the injection budget — `LIVE_BUDGET_CHARS` decides how much of a legitimate
 * caption stream reaches the model, and exceeding that is an ordinary, visible
 * truncation. This decides whether the body is a plausible caption payload at
 * all: a three-hour Hebrew call sits comfortably under 200,000 characters, so
 * anything past it is not a call, and taking it would mean defanging and slicing
 * a megabyte per turn on the way to discarding four fifths of it.
 *
 * It lives HERE, with the gate that applies it, rather than beside the budget it
 * would be confused with.
 */
export const LIVE_CAPTIONS_MAX_CHARS = 200_000

/** The longest label a client may attach: a company name plus a quarter, bounded. */
export const LIVE_LABEL_MAX_CHARS = 200

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
  /**
   * A call happening RIGHT NOW → the on-screen captions, injected
   * (`liveInjection.ts`). THE ONLY RECIPE THAT CARRIES CONTENT RATHER THAN AN ID,
   * and that is not an inconsistency to tidy away: while a call is running there
   * is no row to name. The transcript is written when it ends. So the client
   * sends what the user is looking at, which is exactly the thing the surface has
   * promised — and it is gated as CONTENT below (bounded, then fenced) rather
   * than as an identifier.
   */
  | { kind: 'live'; captions: string; label?: string }
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
  projectId?: string
}

/**
 * THE REPORT PAGES AND SNIPPED IMAGES RIDING THIS TURN (ticket 08c-3).
 *
 * A THIRD QUESTION, beside the grounding and the project, and for the third time
 * the answer is "not a variant of the union". `Grounding` says where the answer
 * comes from; a project says under whose instructions it is written; this says
 * what the user has PUT ON THE TURN from the pane next to the one they are
 * grounded in. Multiview is a call AND a report simultaneously — that is the
 * whole point of the layout — so making the document a fifth recipe would have
 * made the ordinary case unrepresentable and forced the panel to choose which
 * half of its own screen to honour. Exactly the regression 08c-1 caught for
 * `projectId`, one field over.
 *
 * Both parts name the SAME document: the scissors and the marker live in one
 * pane. That is asserted at the gate rather than assumed, because two document
 * ids on one turn is a shape nothing downstream could compose coherently.
 */
export interface TurnDocuments {
  /** The document both the marked pages and the snips came from. Always a uuid. */
  documentId: string
  /** Marked pages, deduped and ordered. May be empty when only snips ride the turn. */
  pages: number[]
  /** Snipped page images, as captured PNG data URLs. May be empty. */
  snips: TurnSnip[]
}

/**
 * One snipped page image, AFTER the gate.
 *
 * It carries no `documentId`, unlike the wire's `ChatSnip`. That is the M3.3
 * move rather than a tidy-up: the gate has already established that every snip
 * on a turn names the parent document, so a downstream reader cannot express —
 * let alone act on — a snip pointing somewhere else. A shape that cannot hold
 * the disagreement beats a check that the disagreement is absent.
 */
export interface TurnSnip {
  /** `data:image/png;base64,…`, validated at the gate. */
  dataUrl: string
  /** The 1-based page this image was cut from. */
  page: number
}

/**
 * The most marked pages one turn may name.
 *
 * REFUSED past this, never sliced. The old `/api/chat` did `pages.slice(0, 4)`
 * inside its loader, so a fifth marked page vanished between the reference block
 * on screen and the text the model read — the silent half-grounding this whole
 * ticket exists to stop shipping. Eight is well past what a selection can
 * produce (a marked passage spans one or two pages) and past the four snips a
 * turn may carry, so no real client can feel the ceiling.
 */
export const DOCUMENT_PAGES_MAX = 8

/**
 * WHAT THIS TURN IS GROUNDED IN, **plus** whose standing instructions it runs
 * under. Two questions, deliberately not one union (ticket 08c).
 *
 * A PROJECT IS NOT A FIFTH RECIPE, and modelling it as one was the obvious move
 * that would have shipped a silent regression. `Grounding` answers *where the
 * answer comes from*; a project answers *under whose written instructions it is
 * written*. They compose: today, on the old `/api/chat`, a user inside a project
 * can `@mention` a company and gets BOTH — the project's instructions in the
 * system prompt and the company on the scope. Making `project` a variant of the
 * union makes that pair unrepresentable, so the `@mention` would have silently
 * stopped scoping (`ChatView` sets `companyId` from the mention picker in a
 * project chat exactly as it does anywhere else). The union's job is to make an
 * INCOHERENT pair unrepresentable — grounded in a call AND a workspace — not to
 * flatten two orthogonal facts into one field.
 *
 * The union's four recipes are therefore untouched, and the second question gets
 * its own field with its own gate.
 */
export interface TurnScope {
  grounding: Grounding
  /** The project this chat lives inside, if any. Its context is INJECTED, not searched. */
  projectId?: string
  /**
   * The report pages and snipped images the user attached to THIS turn (08c-3).
   *
   * A THIRD orthogonal question — see `TurnDocuments`. Its id deliberately does
   * NOT reach `scopeIdsFor`: `ChatScope` is what the tool handlers FILTER on, and
   * this document is not a filter, it is content for one turn. That is the same
   * call the `live` recipe made, and for the same reason — putting an id on the
   * scope that no handler reads is precisely the "accepted ⇒ consumed" defect
   * `requestScope.test.ts` exists to catch.
   */
  documents?: TurnDocuments
}

/**
 * The ids a turn puts on `ChatScope` — at most one from the grounding (one
 * recipe, one id) plus the project, which is orthogonal to all four.
 */
export function scopeIdsFor(s: TurnScope): ScopeIds {
  const ids: ScopeIds = s.projectId ? { projectId: s.projectId } : {}
  switch (s.grounding.kind) {
    case 'none':
      return ids
    case 'company':
      return { ...ids, companyId: s.grounding.companyId }
    case 'call':
      return { ...ids, transcriptId: s.grounding.transcriptId }
    case 'live':
      // NO ID. The live recipe carries its own content, so there is nothing for
      // the tool scope to be pinned to — and inventing a synthetic id here would
      // put a field on `ChatScope` that no handler reads, which is the exact
      // "accepted ⇒ consumed" defect this module's tests exist to catch. The
      // captions reach the loop as what they are: text on the turn.
      return ids
    case 'shelf':
      return { ...ids, workspaceId: s.grounding.workspaceId }
  }
}

/**
 * Read the whole turn scope out of an untrusted body: the grounding, and the
 * project it runs inside.
 *
 * `null` propagates from `parseGrounding` — a grounding that cannot be honoured
 * is a 400, never a downgrade. A MALFORMED `projectId` is refused the same way
 * and for the same reason: the project chat renders its own header and capacity
 * meter, so answering without the project's instructions under that header is
 * the identical lie one field over. It is NOT dropped to "no project", which is
 * the shape that would let a typo'd id look like an ordinary global chat.
 *
 * `projects.id` IS a uuid — checked against the live table, not assumed, because
 * assuming it about `transcripts.id` cost this stack a whole ticket
 * (see `asTranscriptId`).
 */
export function parseTurnScope(body: unknown): TurnScope | null {
  const grounding = parseGrounding(body)
  if (!grounding) return null
  const documents = parseTurnDocuments(body)
  if (documents === null) return null
  // Spread rather than conditional keys, so an absent modifier carries NO key
  // instead of an `undefined` one — the shape every test in this module compares
  // against with `deepEqual`.
  const withDocs = documents ? { documents } : {}
  const raw = ((body ?? {}) as Record<string, unknown>).projectId
  if (raw == null) return { grounding, ...withDocs }
  const projectId = asUuid(raw)
  return projectId ? { grounding, projectId, ...withDocs } : null
}

/**
 * Read the REPORT PAGES AND SNIPS off an untrusted body (ticket 08c-3).
 *
 * Three return values, and the middle one is the whole design:
 *   `undefined` — nothing attached. The overwhelmingly common turn.
 *   `null`      — something was attached and it is MALFORMED. A 400.
 *   a value     — the pages and images, gated.
 *
 * REFUSED, NEVER SILENTLY DROPPED, and this is the one behaviour that
 * deliberately diverges from the route being retired. `parseAttachments`
 * (`lib/chat/attachments.ts`, still the workspace routes' gate) drops invalid or
 * excess entries and answers with what is left. On THIS surface that is the
 * ticket-07 defect in image form: the snip chips are on screen, in the sent
 * message's own bubble, and an answer written without one of them is
 * indistinguishable from an answer that read it. A 400 the panel renders as a
 * failure is visible; a quietly shorter image list is not.
 *
 * `company_documents.id` IS a uuid — measured against the live table
 * (2026-08-15), not inferred from the migration, because inferring it about
 * `transcripts.id` cost this stack a whole ticket (see `asTranscriptId`).
 */
export function parseTurnDocuments(body: unknown): TurnDocuments | null | undefined {
  const b = (body ?? {}) as Record<string, unknown>
  const rawRef = b.documentRef
  const rawSnips = b.attachments
  if (rawRef == null && rawSnips == null) return undefined

  // ── the marked pages ──────────────────────────────────────────────────────
  let refId: string | undefined
  let pages: number[] = []
  if (rawRef != null) {
    if (typeof rawRef !== 'object' || Array.isArray(rawRef)) return null
    const r = rawRef as Record<string, unknown>
    refId = asUuid(r.documentId)
    if (!refId) return null
    if (!Array.isArray(r.pages)) return null
    if (r.pages.length > DOCUMENT_PAGES_MAX) return null
    for (const p of r.pages) {
      if (typeof p !== 'number' || !Number.isInteger(p) || p < 1) return null
      if (!pages.includes(p)) pages.push(p)
    }
    pages = pages.sort((a, z) => a - z)
  }

  // ── the snipped images ────────────────────────────────────────────────────
  const snips: TurnSnip[] = []
  let snipId: string | undefined
  if (rawSnips != null) {
    if (!Array.isArray(rawSnips)) return null
    if (rawSnips.length > ATTACHMENT_MAX) return null
    for (const raw of rawSnips) {
      if (!raw || typeof raw !== 'object') return null
      const s = raw as Record<string, unknown>
      if (typeof s.dataUrl !== 'string' || !s.dataUrl.startsWith(PNG_DATA_URL_PREFIX)) return null
      if (s.dataUrl.length - PNG_DATA_URL_PREFIX.length > ATTACHMENT_MAX_B64) return null
      if (typeof s.page !== 'number' || !Number.isInteger(s.page) || s.page < 1) return null
      const id = asUuid(s.documentId)
      if (!id) return null
      // ONE DOCUMENT PER TURN. The scissors and the marker live in the same pane,
      // so two ids on one turn is not a user action — it is a client bug, and
      // composing it would mean captioning an image with another document's title.
      if (snipId && id !== snipId) return null
      snipId = id
      snips.push({ dataUrl: s.dataUrl, page: s.page })
    }
  }

  if (refId && snipId && refId !== snipId) return null
  const documentId = refId ?? snipId
  // Both halves present but empty — `{documentRef:{documentId, pages:[]}}` with no
  // snips. Nothing is attached, so nothing is claimed, and returning a document
  // with no content would put a "read the report" instruction in the system
  // prompt for a turn that carries no report.
  if (!documentId || (pages.length === 0 && snips.length === 0)) return undefined

  // THE SNIPPED PAGES JOIN THE MARKED ONES, carried over from the old route
  // deliberately: an image of a table answers "what is the number" and the page
  // prose around it answers "what is the number ABOUT". Sending the image without
  // its own page's text was measurably worse at the second question.
  //
  // AND THE MERGE IS NOT RE-BOUNDED, deliberately. Slicing here would drop a
  // snipped page's text while its image still rode the turn — the exact silent
  // half-grounding the ceiling above refuses rather than trims. Both inputs are
  // already bounded, so the union cannot exceed `DOCUMENT_PAGES_MAX +
  // ATTACHMENT_MAX`, and the per-page budget in `documentInjection.ts` is what
  // keeps twelve pages affordable.
  for (const s of snips) if (!pages.includes(s.page)) pages.push(s.page)
  pages.sort((a, z) => a - z)
  return { documentId, pages, snips }
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
    case 'live': {
      // A CONTENT GATE, and the difference from the three id gates above is worth
      // saying rather than leaving to be inferred from the code. There is no
      // charset to bound here — captions are arbitrary Hebrew and English prose,
      // with newlines, quotes and whatever the speaker said — so narrowing the
      // SHAPE is not available as a defence and pretending otherwise would be a
      // gate whose stated reason is wrong (`asTranscriptId`).
      //
      // What defends this text is that it is FENCED, exactly like every other
      // untrusted source (`liveInjection.ts`), and that it never reaches the
      // system prompt: `LIVE_SCOPE_SUMMARY` is a constant. What is left for this
      // gate is a SIZE bound — the one property fencing does not give — so a
      // request cannot spend a megabyte of defanging on its way to being cut down
      // to the budget anyway.
      if (typeof r.captions !== 'string') return null
      if (r.captions.length > LIVE_CAPTIONS_MAX_CHARS) return null
      // The label is optional; a malformed one is REFUSED rather than dropped,
      // for the same reason a malformed `projectId` is — a live panel showing
      // "אורמת — שיחת משקיעים" over an answer whose fence says "live investor
      // call" is a smaller lie than the others on this page but it is the same
      // kind, and the client has no reason to send a bad one.
      let label: string | undefined
      if (r.label != null) {
        if (typeof r.label !== 'string') return null
        if (r.label.length > LIVE_LABEL_MAX_CHARS) return null
        // No newlines: the label rides the fence's single ATTRIBUTE LINE, and a
        // line break in it would push caption text up into the position the model
        // reads as fence metadata. `fenceSource` defangs and escapes the label but
        // cannot re-join a line it was handed already broken.
        if (/[\r\n]/.test(r.label)) return null
        label = r.label
      }
      return label === undefined
        ? { kind: 'live', captions: r.captions }
        : { kind: 'live', captions: r.captions, label }
    }
    case 'shelf': {
      const workspaceId = asUuid(r.workspaceId)
      return workspaceId ? { kind: 'shelf', workspaceId } : null
    }
    default:
      return null
  }
}
