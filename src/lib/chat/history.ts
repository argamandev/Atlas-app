// Chat-history hygiene (review WARNING 2026-07-23). A snip-only send stores an empty user
// turn in the panel's local messages; replayed to Gemini as a {text:''} part it rejects the
// whole request, silently downgrading every follow-up in that conversation to the GPT
// fallback. PURE on purpose: both the client (before send) and /api/chat (untrusted body)
// run history through this.

export interface CleanHistoryMsg {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Untrusted history → clean turns: drops empty/blank content, junk roles and non-objects.
 * When a turn carries `apiContent` (what the model was actually sent — e.g. the snip default
 * question or the reference-labeled message), it wins over the display `content`.
 */
export function sanitizeHistory(raw: unknown): CleanHistoryMsg[] {
  if (!Array.isArray(raw)) return []
  const out: CleanHistoryMsg[] = []
  for (const m of raw as Array<Record<string, unknown> | null>) {
    const role = m?.role
    if (role !== 'user' && role !== 'assistant') continue
    const api = m?.apiContent
    const content =
      typeof api === 'string' && api.trim() ? api : typeof m?.content === 'string' ? m.content : ''
    if (!content.trim()) continue
    out.push({ role, content })
  }
  return out
}
