import { ApiError } from './client'

export interface ChatSource {
  company: string
  quarter: string
  transcriptId: string
}

export interface DocumentRef {
  documentId: string
  pages: number[]
}

/** Pinge: one snipped region of the report PDF, captured client-side as a PNG data URL. */
export interface ChatSnip {
  dataUrl: string
  page: number
  documentId: string
}

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

/**
 * How the project's context actually reached the model on THIS answer.
 * `null` means whole (or that there was no project). The other two are things
 * the user has to be told: `truncated` = the block was cut to fit the budget,
 * `failed` = it never loaded and the model answered without their instructions.
 */
export type ProjectContextStatus = 'truncated' | 'failed'

/**
 * Narrow an unknown value to a context status, or null.
 *
 * Used on BOTH ways in: the `x-project-context` response header below, and a
 * `projectContext` read back out of a stored message's jsonb. Anything not
 * explicitly named is treated as "the context was whole" rather than guessed at,
 * so a stale row or a hand-edited blob cannot paint a warning onto a good
 * answer — or, worse, a string of someone's choosing onto a rendered surface.
 */
export function sanitizeContextStatus(raw: unknown): ProjectContextStatus | null {
  return raw === 'truncated' || raw === 'failed' ? raw : null
}

/**
 * Was this stored message's answer cut off? Read side.
 *
 * Same reasoning as `sanitizeContextStatus`: the `messages` jsonb predates the
 * field, so most stored messages have none, and absent must mean "complete"
 * rather than "unknown, so warn". Only a literal `true` counts — `'true'`,
 * `1` and `{}` are all truthy in JS and none of them is this flag.
 */
export function sanitizeTruncated(raw: unknown): boolean {
  return raw === true
}

/**
 * Should this message be STORED as truncated? Write side.
 *
 * Two sources, and both are needed. `errorKind` is this session's live failure
 * and dies on reload; `truncated` is what a message reopened from storage
 * carries. A message that has already round-tripped has only the second, and a
 * message that just broke has only the first — taking either alone silently
 * drops one of the two cases on the next save.
 *
 * Extracted from an inline expression in ChatView because the defect it fixes
 * (a partial answer persisting as a complete one) was a BLOCKER found at review,
 * and its sibling `sanitizeContextStatus` had a dedicated test file while this
 * had none. A later refactor writing `!!m.truncated` would have failed nothing.
 */
export function truncatedForPersist(m: { truncated?: boolean | null; errorKind?: string }): boolean {
  return m.truncated === true || m.errorKind === 'truncated'
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
