// ─────────────────────────────────────────────────────────────────────────────
// THE `/api/chat/v2` WIRE VOCABULARY — declared ONCE, for both sides.
//
// Server and client cross this seam, so the events are the interface between
// them. Before this module the vocabulary was declared twice and the code list
// three times:
//
//   * `chat2/loop.ts`   — `ChatEvent`, `TERMINAL_EVENTS`
//   * `chat2/terminal.ts` — `IncompleteCode` (the type)
//   * `api/chat2.ts`    — `ClientChatEvent` re-declared, `TERMINAL` re-declared,
//                         and `SERVER_INCOMPLETE_CODES`, a hand-maintained
//                         RUNTIME array carrying the comment "Kept in sync with
//                         terminal.ts"
//
// THE DEFECT THAT SHAPE ALLOWS, and it is silent in the worst way. The type and
// the runtime array were separate declarations, and only the array is consulted
// at parse time. Add a ninth code to the union, ship copy for it, emit it from
// the server — and `parseChatEvent` does not recognise it, so it normalises the
// new, valid, deliberately-distinct code to `stopped_unknown`. Every typecheck
// passes. Every test passes. The surface renders the generic sentence, which is
// exactly what `terminal.ts` round 4 refused to let happen when it kept the four
// non-clean stops as separate codes.
//
// So the codes are declared ONCE as a `const` array and the type is DERIVED from
// it (`typeof CODES[number]`). The two cannot disagree, because there is no
// second declaration to disagree with — the "impossible" tier, not the prose one.
//
// This file is imported by the client. It must stay free of anything server-only
// — no `@/lib/supabase`, no handlers, no model client. Its only import is the
// pure `mode.ts`, for the same reason `toolDefs.ts` is split from `tools.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import type { ChatMode } from './mode'
// Domain vocabulary, not transport — `lib/chat/grounding.ts` is pure and carries
// no `lib/api` import, so this stays a client-safe module (see the header).
import type { ChatSource } from '@/lib/chat/grounding'

/**
 * WHY an `incomplete` ended the turn, as a CODE and not only English prose.
 *
 * THE ONE DECLARATION. The type below is derived from this array, so a code
 * added here is immediately known to the parser, the copy map and both unions;
 * there is no second list to forget.
 *
 * The degradation law requires the failure to be visible on screen **in both
 * locales**, and the chat surface is Hebrew-first. A free-text English `reason`
 * would force that surface to string-match English to decide what to render —
 * a classifier over prose, the thing `app.md` says to buy visible failure
 * instead of. The code is the contract; `reason` stays developer-facing.
 *
 * The four non-clean stops are SEPARATE codes, not one `stopped_early`
 * (terminal.ts, round 4): collapsing them makes a Hebrew surface show one
 * message for four materially different situations — "too long", "the model
 * declined", "it paused", "unknown". Splitting a code after the surface ships
 * against it is a breaking change, so they were split up front.
 */
export const SERVER_INCOMPLETE_CODES = [
  'round_trip_cap',
  'all_sources_failed',
  'unverified_quote',
  'length_limit',
  'model_refused',
  'model_paused',
  'stopped_unknown',
  'no_answer_text',
] as const

export type IncompleteCode = (typeof SERVER_INCOMPLETE_CODES)[number]

/**
 * The incomplete codes a SURFACE has to render.
 *
 * The server's eight plus one the server cannot send by definition:
 * `stream_ended`, the connection dying mid-answer. It lives in the same union
 * deliberately — the surface's job is "say why this answer is not whole", and a
 * dropped connection is one of the reasons. Splitting it into a separate
 * `errorKind` was how the old ChatView ended up with two parallel vocabularies
 * for the same question.
 */
export type ClientIncompleteCode = IncompleteCode | 'stream_ended'

/** Is this string one of the server's codes? The parser's only membership test. */
export function isIncompleteCode(v: unknown): v is IncompleteCode {
  return typeof v === 'string' && (SERVER_INCOMPLETE_CODES as readonly string[]).includes(v)
}

/**
 * How a PROJECT's written context reached the model on one turn (ticket 08c).
 *
 * ONE DECLARATION, derived from the array, for the same reason the incomplete
 * codes are: this triple otherwise wants to exist three times — the builder's
 * return type, the event's inline literal, and the parser's membership test —
 * and the parser is the only one consulted at runtime. A fourth state added to
 * a type the parser does not share is a state the parser silently drops.
 *
 * It lives HERE rather than in `projectInjection.ts` because it is wire
 * vocabulary: both the server that emits it and the surface that renders it
 * need it, and `protocol.ts` is the module both sides already import.
 */
export const PROJECT_CONTEXT_STATES = ['ok', 'truncated', 'failed'] as const

export type ProjectContextState = (typeof PROJECT_CONTEXT_STATES)[number]

/** Is this string one of the project-context states? The parser's only membership test. */
export function isProjectContextState(v: unknown): v is ProjectContextState {
  return typeof v === 'string' && (PROJECT_CONTEXT_STATES as readonly string[]).includes(v)
}

/**
 * How an ATTACHED REPORT's pages reached the model on one turn (ticket 08c-3).
 *
 * ITS OWN ARRAY, not `PROJECT_CONTEXT_STATES` reused because the three words
 * happen to match today. The two answer different questions — "did your standing
 * instructions load" versus "did the marked pages fit" — and sharing the list
 * would mean a state added for one silently appearing in the other's parser and
 * union, with copy for it existing on neither surface. This repo already keeps
 * `LIVE_BUDGET_CHARS` and `CALL_BUDGET_CHARS` apart on exactly that reasoning:
 * equal today by coincidence is not the same as derived from one another.
 *
 * `failed` here means the READ failed or the report is gone. It does NOT mean
 * "no text could be extracted" — that is a real, non-degraded state of a scanned
 * PDF and the model is told about it inside the block (`NO_PAGE_TEXT`), so
 * calling it a failure on screen would put a warning under an answer that is as
 * good as the document allows.
 */
export const DOCUMENT_CONTEXT_STATES = ['ok', 'truncated', 'failed'] as const

export type DocumentContextState = (typeof DOCUMENT_CONTEXT_STATES)[number]

/** Is this string one of the document-context states? The parser's only membership test. */
export function isDocumentContextState(v: unknown): v is DocumentContextState {
  return typeof v === 'string' && (DOCUMENT_CONTEXT_STATES as readonly string[]).includes(v)
}

/**
 * The TERMINAL event types. Exactly one ends every turn, and it is always last.
 *
 * Exported so a caller can exhaustively switch and so the battery can assert the
 * set has not quietly grown a fourth.
 */
export const TERMINAL_EVENTS = ['done', 'incomplete', 'error'] as const

export type TerminalEventType = (typeof TERMINAL_EVENTS)[number]

/**
 * What the SERVER emits.
 *
 * `done` and `incomplete` are distinct TYPES, not one event with a flag — the
 * degradation law at the "impossible" tier: no caller can conflate "finished"
 * with "stopped early", because there is no shared shape to conflate.
 */
export type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; status: 'start' | 'end'; isError?: boolean }
  /**
   * NON-TERMINAL. Which grounding mode this turn is in, and the company it is
   * pinned to when there is one. Emitted for the OPENING mode and again on every
   * change — never only on change, or a surface would render its own default
   * (a guess) until the first `resolve_company` landed.
   *
   * This is what makes search mode VISIBLE (spec §2.3). It is a fact about the
   * scope, not an inference from the question — see `mode.ts`.
   */
  | { type: 'mode'; mode: ChatMode; companyId: string | null }
  /**
   * NON-TERMINAL. What this turn was GROUNDED IN, once the grounding has actually
   * been loaded (ticket 08b, whole-call injection).
   *
   * Two facts, and both are owed to the surface for the same reason. `source` is
   * the call the answer is built on — the citation chip, which the old
   * `/api/chat` carried on an `x-chat-source` header and which v2 had no way to
   * express, so migrating a surface used to cost it that chip. `state` says
   * whether the call reached the model WHOLE: a two-hour call does not fit one
   * turn, and an answer built on the first two thirds of a call must not look
   * identical to one built on all of it.
   *
   * Emitted only after the load SUCCEEDED. A grounding that could not be loaded
   * does not send this event with a hedged state — it ends the turn in `error`,
   * because the surface is already showing a chip promising that call.
   */
  | { type: 'grounding'; state: 'whole' | 'truncated'; source: ChatSource | null }
  /**
   * NON-TERMINAL. How the PROJECT's written context reached the model, when this
   * chat lives inside a project (ticket 08c).
   *
   * ITS OWN EVENT, not a widened `grounding` state, and the separation is the
   * point. `grounding` answers "where did this answer come from" and carries the
   * citation chip; a project answers "under whose standing instructions was it
   * written". A project chat can be BOTH — grounded in a company via `@mention`
   * while running under the project's instructions — so one event carrying both
   * facts could not describe the ordinary case.
   *
   * Emitted only when the turn actually has a project. `ok` is a real value and
   * is emitted: the surface's alternative to hearing "ok" is hearing nothing,
   * which is also what it hears when a build is too old to send this event at
   * all, and those two must not look alike.
   */
  | { type: 'projectContext'; state: ProjectContextState }
  /**
   * NON-TERMINAL. How the ATTACHED REPORT PAGES reached the model, when the user
   * put a marked passage or a snipped image on this turn (ticket 08c-3).
   *
   * A THIRD event rather than a widened `grounding`, and the reason is the same
   * one that kept `projectContext` separate: a multiview turn is grounded in a
   * call AND carries a report page, so one event carrying both facts could not
   * describe the ordinary case. `grounding` also carries the citation chip, which
   * names a CALL; a report page is not one.
   *
   * IT CARRIES NO SNIP COUNT, and the first draft of this event did. The
   * reasoning for it was "a surface showing four chips over an answer the model
   * saw three of has no way to know" — which describes a state this gate cannot
   * reach: `parseTurnDocuments` REFUSES a malformed or excess snip with a 400
   * rather than trimming the list, so the count the server sees is always the
   * count the client sent. A field that can never disagree is a stub filling a
   * designed slot (app.md), and it would have read as evidence of a check nobody
   * is performing.
   */
  | { type: 'documentContext'; state: DocumentContextState }
  /** TERMINAL. The model finished cleanly. The ONLY event that means complete. */
  | { type: 'done' }
  /**
   * TERMINAL. Ended early — the deltas so far are real but the turn is not
   * finished. RENDER FROM `code`, never from `reason`: `reason` is English
   * developer prose, and the degradation law wants this on screen in both
   * locales.
   */
  | { type: 'incomplete'; code: IncompleteCode; reason: string }
  /** TERMINAL. Nothing usable came back. */
  | { type: 'error'; message: string }

/**
 * What a SURFACE renders — the server's events, widened only where the client
 * knows something the server cannot: a stream that died without an ending.
 */
export type ClientChatEvent =
  | Exclude<ChatEvent, { type: 'incomplete' }>
  | { type: 'incomplete'; code: ClientIncompleteCode; reason: string }

const TERMINAL: ReadonlySet<string> = new Set(TERMINAL_EVENTS)

/** Is this the last event of a turn? Exported because the surface persists on it. */
export function isTerminal(e: { type: string }): boolean {
  return TERMINAL.has(e.type)
}

/** The synthesised ending for a stream that stopped without one of its own. */
export const STREAM_ENDED: ClientChatEvent = {
  type: 'incomplete',
  code: 'stream_ended',
  reason: 'the connection ended before the answer finished',
}

/**
 * One NDJSON line → an event, or `null` for anything this build cannot render.
 *
 * DROPPING IS THE SAFE DIRECTION, and only because the terminal set is closed: a
 * frame we do not understand is never the thing that ends a turn, so a dropped
 * unknown still leaves the missing-terminal guard to fire. The alternative —
 * passing an unrecognised object through — hands the surface something to render
 * the wrong way, which is worse than not rendering it at all.
 */
export function parseChatEvent(line: string): ClientChatEvent | null {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const e = raw as Record<string, unknown>

  switch (e.type) {
    case 'delta':
      // A non-string `text` would be appended to a message body as-is.
      return typeof e.text === 'string' ? { type: 'delta', text: e.text } : null
    case 'tool':
      if (typeof e.name !== 'string') return null
      if (e.status !== 'start' && e.status !== 'end') return null
      return { type: 'tool', name: e.name, status: e.status, isError: e.isError === true }
    case 'mode':
      if (e.mode !== 'pinpoint' && e.mode !== 'search') return null
      return {
        type: 'mode',
        mode: e.mode,
        companyId: typeof e.companyId === 'string' ? e.companyId : null,
      }
    case 'grounding': {
      // `state` is NOT defaulted to 'whole'. A frame whose state this build does
      // not recognise would then assert the flattering half of the only question
      // this event exists to answer — the surface would say the call reached the
      // model whole because the wire said something unparseable. Dropped instead,
      // which leaves the surface with no claim rather than a false one.
      if (e.state !== 'whole' && e.state !== 'truncated') return null
      const s = e.source as Record<string, unknown> | null | undefined
      const source =
        s && typeof s === 'object' && typeof s.transcriptId === 'string'
          ? {
              company: typeof s.company === 'string' ? s.company : '',
              quarter: typeof s.quarter === 'string' ? s.quarter : '',
              transcriptId: s.transcriptId,
            }
          : null
      return { type: 'grounding', state: e.state, source }
    }
    case 'projectContext':
      // Same reasoning as `grounding` above, one field over: an unrecognised
      // state is DROPPED rather than defaulted to 'ok'. Defaulting would make an
      // unparseable frame assert the flattering half of the only question this
      // event exists to answer — the surface would show a clean answer where the
      // server may have been saying the user's instructions never loaded.
      // Through the shared membership test, never a hand-written cascade: the
      // cascade was a second place the state list could drift from the union.
      if (!isProjectContextState(e.state)) return null
      return { type: 'projectContext', state: e.state }
    case 'documentContext':
      // Same reasoning again, one event over: an unrecognised state is DROPPED
      // rather than defaulted to 'ok'.
      if (!isDocumentContextState(e.state)) return null
      return { type: 'documentContext', state: e.state }
    case 'done':
      return { type: 'done' }
    case 'incomplete':
      return {
        type: 'incomplete',
        // An unknown code must land on the generic branch, never fall through
        // every `if` and render nothing — an `incomplete` that displays as a
        // clean answer is exactly the lie this stream exists to prevent.
        code: isIncompleteCode(e.code) ? e.code : 'stopped_unknown',
        reason: typeof e.reason === 'string' ? e.reason : '',
      }
    case 'error':
      return { type: 'error', message: typeof e.message === 'string' ? e.message : 'chat failed' }
    default:
      return null
  }
}
