/**
 * TRANSPORT ONLY — the client for the OLD `/api/chat` route.
 *
 * This whole file dies with that route in ticket 08 (B2). What it must NOT take
 * with it is domain vocabulary, so the grounding types and the stored-message
 * honesty helpers now live in `lib/chat/grounding.ts` and
 * `lib/chat/messageState.ts` and are imported from there by everything else.
 * Only `ChatInput` (this route's wire format) and `streamChat` (this route's
 * reader) remain.
 */
import { ApiError } from './client'
import type { ChatSource, ChatSnip, DocumentRef } from '@/lib/chat/grounding'
import { sanitizeContextStatus, type ProjectContextStatus } from '@/lib/chat/messageState'

export interface ChatInput {
  message: string
  companyId?: string
  transcriptId?: string
  liveContext?: string // LIVE view: the on-screen captions, used directly as grounding context
  documentRef?: DocumentRef // multiview: marked-PDF passage grounding (document + page numbers)
  attachments?: ChatSnip[] // Pinge snips (≤4) — server validates + auth-gates like documentRef
  // Projects: the chat inherits this project's instructions, memory and notes.
  // Loaded server-side through the USER'S own client, so someone else's id
  // injects nothing.
  projectId?: string
  history?: { role: 'user' | 'assistant'; content: string }[]
}

// Streamed chat (Feature 5): POST to /api/chat, read the plain-text token stream and call
// onToken for each delta as it arrives. The citation source rides on the x-chat-source header.
export async function streamChat(
  input: ChatInput,
  onToken: (delta: string) => void
): Promise<{ source: ChatSource | null; projectContext: ProjectContextStatus | null }> {
  const res = await fetch('/api/chat', {
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
      /* non-JSON */
    }
    // ApiError, not Error: /api/chat requires a signed-in user since the API-auth
    // boundary landed, so a 401 here is now reachable in normal use (an expired
    // session) and the caller has to be able to tell it apart from a model
    // failure. Without the status it arrives as the word "unauthorized".
    throw new ApiError(message, res.status)
  }

  const srcHeader = res.headers.get('x-chat-source')
  const source: ChatSource | null = srcHeader
    ? (JSON.parse(decodeURIComponent(srcHeader)) as ChatSource)
    : null

  // Absent means the project's context reached the model whole. Anything the
  // server did not name is treated as whole rather than guessed at.
  const projectContext = sanitizeContextStatus(res.headers.get('x-project-context'))

  if (!res.body) {
    // no stream (shouldn't happen) — fall back to the whole body as one token
    onToken(await res.text())
    return { source, projectContext }
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const delta = decoder.decode(value, { stream: true })
    if (delta) onToken(delta)
  }
  return { source, projectContext }
}
