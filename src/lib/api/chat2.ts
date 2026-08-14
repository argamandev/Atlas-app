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
import { parseChatEvent, isTerminal, STREAM_ENDED } from '@/lib/chat2/protocol'
import type { ClientChatEvent } from '@/lib/chat2/protocol'

// The wire vocabulary — the event unions, the incomplete codes, the terminal set
// and the line parser — moved to `chat2/protocol.ts` (08a.2), which both this
// client and the server import. What stays here is TRANSPORT: framing bytes into
// lines, and the fetch. Re-exported so surfaces keep one import for chat.
export { parseChatEvent, isTerminal, STREAM_ENDED } from '@/lib/chat2/protocol'
export type { ClientChatEvent, ClientIncompleteCode } from '@/lib/chat2/protocol'

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
