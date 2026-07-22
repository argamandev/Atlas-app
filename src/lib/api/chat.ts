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
  history?: { role: 'user' | 'assistant'; content: string }[]
}

// Streamed chat (Feature 5): POST to /api/chat, read the plain-text token stream and call
// onToken for each delta as it arrives. The citation source rides on the x-chat-source header.
export async function streamChat(
  input: ChatInput,
  onToken: (delta: string) => void
): Promise<{ source: ChatSource | null }> {
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
    throw new Error(message)
  }

  const srcHeader = res.headers.get('x-chat-source')
  const source: ChatSource | null = srcHeader
    ? (JSON.parse(decodeURIComponent(srcHeader)) as ChatSource)
    : null

  if (!res.body) {
    // no stream (shouldn't happen) — fall back to the whole body as one token
    onToken(await res.text())
    return { source }
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const delta = decoder.decode(value, { stream: true })
    if (delta) onToken(delta)
  }
  return { source }
}
