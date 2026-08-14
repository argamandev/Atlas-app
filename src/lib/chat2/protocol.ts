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
