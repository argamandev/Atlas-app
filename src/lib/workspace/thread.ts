import type { Parsed } from './validate'

// ─────────────────────────────────────────────────────────────────────────────
// The workspace conversation, as it is STORED.
//
// ONE THREAD PER WORKSPACE (v1). `workspace_threads` is shaped for many — it
// carries a title and the route orders by `updated_at` — but a thread SWITCHER
// is a surface nobody has designed yet, and shipping the table's full generality
// with no way to reach it would put a second conversation somewhere the user
// cannot get back to. So: the newest thread is the workspace's conversation, and
// the extra rows the schema permits are simply never created. That is a UI
// decision, reversible without a migration, which is the point.
//
// WHY A STORED MESSAGE IS NOT THE ON-SCREEN MESSAGE — the one thing to
// understand before editing this file. A Pinge clipping (`ChatSnip`) carries
// `dataUrl`, a base64 PNG of the region the analyst cut, up to ~2MB, up to four
// per turn. `messages` is inline jsonb on a row that the WARM READ fetches every
// single time the workspace opens. Storing the images would put tens of
// megabytes behind the first paint of a room, to redisplay a picture of a page
// that is still sitting on the shelf two panes away.
//
// So the images are not stored, and the UI SAYS SO rather than quietly showing a
// turn that looks like it had no clipping attached. `snipPages` is what survives:
// enough to render "2 clippings · pages 4, 7" against the message they belonged
// to, so the record of WHAT WAS ASKED ABOUT WHAT stays true across a reload.
// That is the property WorkspaceChat's header calls the one worth naming, and
// dropping the pages as well as the pixels would have quietly broken it.
// Degradation must be visible (.claude/rules/app.md) — this is the visible form.
// ─────────────────────────────────────────────────────────────────────────────

export type StoredMsg = {
  role: 'user' | 'assistant'
  content: string
  /** the passage this question was asked about, kept with the message */
  reference?: string
  referenceTitle?: string
  /** files the answer could see only part of, or not at all */
  caveat?: string[]
  /** pages the clippings were cut from. THE IMAGES THEMSELVES ARE NOT STORED. */
  snipPages?: number[]
}

/**
 * Caps. Deliberately far above any real v1 conversation, and REFUSED rather
 * than truncated when exceeded — this repo already settled that argument
 * ("oversized input is refused rather than silently truncated",
 * validate.test.ts). Silently dropping the oldest turns would make a
 * conversation that reads complete on screen and is not, which is worse than an
 * error the composer can render.
 */
export const THREAD_MAX_MESSAGES = 400
export const THREAD_MAX_CHARS = 400_000

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Total stored size, measured the way the cap is stated. */
export function threadChars(messages: StoredMsg[]): number {
  return messages.reduce(
    (n, m) =>
      n +
      m.content.length +
      (m.reference?.length ?? 0) +
      (m.referenceTitle?.length ?? 0) +
      (m.caveat ?? []).reduce((c, s) => c + s.length, 0),
    0
  )
}

/**
 * The stored title for the workspace's conversation: its opening question,
 * trimmed to a line. Derived rather than typed, because v1 has no place to type
 * one — and an empty title would make the Chats row unreadable.
 */
export const THREAD_TITLE_MAX = 80

export function deriveThreadTitle(messages: StoredMsg[]): string {
  const first = messages.find((m) => m.role === 'user')?.content.trim() ?? ''
  const line = first.replace(/\s+/g, ' ')
  if (line.length <= THREAD_TITLE_MAX) return line
  // Cut on a word boundary when there is one near the end, so a Hebrew or
  // English title does not end mid-word. `…` rather than '...' — one glyph, and
  // it does not read as an ellipsis the user typed.
  const cut = line.slice(0, THREAD_TITLE_MAX)
  const space = cut.lastIndexOf(' ')
  return `${space > THREAD_TITLE_MAX - 20 ? cut.slice(0, space) : cut}…`
}

/**
 * Validate a conversation arriving from the browser.
 *
 * EVERY FIELD IS REBUILT, never spread. A jsonb column accepts whatever shape it
 * is handed, so `{...body}` would let a client store arbitrary keys — including
 * a `dataUrl` this module exists to keep out of the row, and including anything
 * a future reader might mistake for a field this app wrote.
 */
export function parseThreadMessages(body: unknown): Parsed<StoredMsg[]> {
  const raw = (body as { messages?: unknown } | null)?.messages
  if (!Array.isArray(raw)) return { ok: false, error: 'messages must be an array' }
  if (raw.length > THREAD_MAX_MESSAGES) {
    return { ok: false, error: `a conversation cannot exceed ${THREAD_MAX_MESSAGES} messages` }
  }

  const out: StoredMsg[] = []
  // An index loop, not `.entries()`: the tsconfig target predates downlevel
  // iteration over array iterators, and the error surfaces only at typecheck.
  for (let i = 0; i < raw.length; i++) {
    const m = (raw[i] ?? {}) as Record<string, unknown>
    const role = str(m.role)
    if (role !== 'user' && role !== 'assistant') {
      return { ok: false, error: `message ${i} has an unknown role` }
    }
    const content = str(m.content)
    if (content === null) return { ok: false, error: `message ${i} has no content` }

    const msg: StoredMsg = { role, content }

    const reference = str(m.reference)
    if (reference) msg.reference = reference
    const referenceTitle = str(m.referenceTitle)
    if (referenceTitle) msg.referenceTitle = referenceTitle

    if (Array.isArray(m.caveat)) {
      const caveat = m.caveat.filter((c): c is string => typeof c === 'string')
      if (caveat.length) msg.caveat = caveat
    }

    if (Array.isArray(m.snipPages)) {
      const pages = m.snipPages.filter(
        (p): p is number => typeof p === 'number' && Number.isInteger(p) && p >= 0
      )
      if (pages.length) msg.snipPages = pages
    }

    out.push(msg)
  }

  const chars = threadChars(out)
  if (chars > THREAD_MAX_CHARS) {
    return { ok: false, error: `a conversation cannot exceed ${THREAD_MAX_CHARS} characters` }
  }
  return { ok: true, value: out }
}

/**
 * Read a `messages` column back. The column is jsonb with a `[]` default, and
 * rows written by an older shape must not crash the room they belong to — so an
 * unreadable entry is DROPPED rather than thrown on. This is the one place that
 * asymmetry is correct: a write is refused loudly, a read of already-stored data
 * salvages what it can, because the alternative is a workspace that will not
 * open at all.
 */
export function readThreadMessages(value: unknown): StoredMsg[] {
  const parsed = parseThreadMessages({ messages: Array.isArray(value) ? value : [] })
  if (parsed.ok) return parsed.value
  if (!Array.isArray(value)) return []
  const out: StoredMsg[] = []
  for (const item of value) {
    const one = parseThreadMessages({ messages: [item] })
    if (one.ok) out.push(...one.value)
  }
  return out.slice(-THREAD_MAX_MESSAGES)
}
