// ─────────────────────────────────────────────────────────────────────────────
// THE CLIENT SIDE OF `/api/chat/v2` (ticket 07, B1b).
//
// The backend spent slice B1a making three things true — error text has no code
// path into a `delta`, exactly one terminal event ends a turn, and a partial
// answer cannot wear the same event as a complete one. All three are properties
// of the WIRE, and a careless reader gives every one of them back:
//
//   * `JSON.parse` per network chunk loses any frame split across a TCP boundary
//     — which is every frame, once an answer is long enough to matter.
//   * A stream that stops without a terminal event looks, to a reader that only
//     switches on the events it did receive, exactly like a clean finish. It is
//     not one; it is the truncation the old `/api/chat` used to persist as a
//     whole answer, arriving by a different door.
//
// So the decoder is a small state machine with its own tests rather than an
// inline loop in the component, and the missing terminal is synthesised HERE —
// at the one point every v2 stream passes through (M3.1) — instead of being left
// as a state each caller has to remember to handle.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError } from './client'
import type { ChatMode } from '@/lib/chat2/mode'
import type { IncompleteCode } from '@/lib/chat2/terminal'

/**
 * The incomplete codes a SURFACE has to render.
 *
 * The server's eight (`terminal.ts`) plus one the server cannot send by
 * definition: `stream_ended`, the connection dying mid-answer. It lives in the
 * same union deliberately — the surface's job is "say why this answer is not
 * whole", and a dropped connection is one of the reasons. Splitting it into a
 * separate `errorKind` was how the old ChatView ended up with two parallel
 * vocabularies for the same question.
 */
export type ClientIncompleteCode = IncompleteCode | 'stream_ended'

/** Kept in sync with `terminal.ts` — an unknown code from the wire lands on `stopped_unknown`. */
const SERVER_INCOMPLETE_CODES: readonly IncompleteCode[] = [
  'round_trip_cap',
  'all_sources_failed',
  'unverified_quote',
  'length_limit',
  'model_refused',
  'model_paused',
  'stopped_unknown',
  'no_answer_text',
]

export type ClientChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; status: 'start' | 'end'; isError?: boolean }
  | { type: 'mode'; mode: ChatMode; companyId: string | null }
  | { type: 'done' }
  | { type: 'incomplete'; code: ClientIncompleteCode; reason: string }
  | { type: 'error'; message: string }

const TERMINAL = new Set(['done', 'incomplete', 'error'])

/** Is this the last event of a turn? Exported because the surface persists on it. */
export function isTerminal(e: ClientChatEvent): boolean {
  return TERMINAL.has(e.type)
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
        code: SERVER_INCOMPLETE_CODES.includes(e.code as IncompleteCode)
          ? (e.code as IncompleteCode)
          : 'stopped_unknown',
        reason: typeof e.reason === 'string' ? e.reason : '',
      }
    case 'error':
      return { type: 'error', message: typeof e.message === 'string' ? e.message : 'chat failed' }
    default:
      return null
  }
}

/** The synthesised ending for a stream that stopped without one of its own. */
export const STREAM_ENDED: ClientChatEvent = {
  type: 'incomplete',
  code: 'stream_ended',
  reason: 'the connection ended before the answer finished',
}

/**
 * Line-framed NDJSON decoder that remembers a partial line between chunks, and
 * guarantees the caller sees a terminal event even when the wire did not carry one.
 */
export class NdjsonEvents {
  private buffer = ''
  private sawTerminal = false

  /** Feed one decoded chunk; get whatever complete frames it completed. */
  push(chunk: string): ClientChatEvent[] {
    this.buffer += chunk
    const out: ClientChatEvent[] = []
    for (;;) {
      const nl = this.buffer.indexOf('\n')
      if (nl === -1) break
      const line = this.buffer.slice(0, nl)
      this.buffer = this.buffer.slice(nl + 1)
      const event = this.take(line)
      if (event) out.push(event)
    }
    return out
  }

  /** The stream is over. Flushes a trailing unterminated line, then guarantees an ending. */
  end(): ClientChatEvent[] {
    const out: ClientChatEvent[] = []
    const tail = this.take(this.buffer)
    this.buffer = ''
    if (tail) out.push(tail)
    if (!this.sawTerminal) out.push(STREAM_ENDED)
    return out
  }

  private take(line: string): ClientChatEvent | null {
    if (!line.trim()) return null
    const event = parseChatEvent(line)
    if (event && isTerminal(event)) this.sawTerminal = true
    return event
  }
}

export interface ChatV2Input {
  message: string
  /** The @mentioned or page-scoped company. Uuid-gated server-side. */
  companyId?: string | null
  // NO `transcriptId`. The route no longer accepts one, because no tool reads one
  // — ticket 07's cold review found it gated onto the scope and dropped, while the
  // surface showed a chip promising that grounding. Ticket 08 adds it back with
  // whole-call injection, which is the code that will actually consume it.
  workspaceId?: string | null
  history?: { role: 'user' | 'assistant'; content: string }[]
}

/**
 * POST a turn and deliver every event as it arrives.
 *
 * Resolves once the stream is finished; the caller learns HOW it finished from
 * the terminal event, never from whether this promise resolved. That split is the
 * point: a resolved promise here means "the connection completed", which is a
 * different question from "the answer is whole".
 */
export async function streamChatV2(input: ChatV2Input, onEvent: (e: ClientChatEvent) => void): Promise<void> {
  const res = await fetch('/api/chat/v2', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    let message = `Chat failed (${res.status})`
    try {
      const j = await res.json()
      if (j?.error) message = j.error
    } catch {
      /* non-JSON body */
    }
    // ApiError carries the status so the surface can tell an expired session
    // (401 → send them to sign in) from a 503 "chat is not configured" — which
    // is the Railway ANTHROPIC_API_KEY case ticket 07 exists to surface, and
    // must not render as "the model failed".
    throw new ApiError(message, res.status)
  }

  const decoder = new NdjsonEvents()
  if (!res.body) {
    for (const e of decoder.end()) onEvent(e)
    return
  }
  const reader = res.body.getReader()
  const text = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      // `stream: true` so a multi-byte Hebrew character split across a chunk
      // boundary is held rather than decoded into a replacement character.
      for (const e of decoder.push(text.decode(value, { stream: true }))) onEvent(e)
    }
  } finally {
    // Even on a thrown read, the caller gets its terminal event.
    for (const e of decoder.end()) onEvent(e)
  }
}
