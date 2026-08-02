// Request-body validation for the project routes. Pure, so it is unit-testable
// without booting Next. Deliberately hand-rolled rather than zod: these are four
// fields with two rules each, and the existing transcripts route shows what
// happens when a schema outgrows the data it guards.

export const NAME_MAX = 200
export const TEXT_MAX = 20_000

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

export function parseCreate(body: unknown): Parsed<{ name: string }> {
  const name = str((body as { name?: unknown } | null)?.name)?.trim()
  if (!name) return { ok: false, error: 'name is required' }
  if (name.length > NAME_MAX) return { ok: false, error: `name exceeds ${NAME_MAX} characters` }
  return { ok: true, value: { name } }
}

export type PatchValue = Partial<{
  name: string
  pinned: boolean
  instructions: string
  memory: string
}>

/**
 * Only the four editable fields are accepted. `user_id` is not among them —
 * a client must never be able to reassign ownership, and an unrecognised body
 * is refused rather than silently applying nothing and reporting success.
 */
export function parsePatch(body: unknown): Parsed<PatchValue> {
  const b = (body ?? {}) as Record<string, unknown>
  const out: PatchValue = {}

  if (b.name !== undefined) {
    const name = str(b.name)?.trim()
    if (!name) return { ok: false, error: 'name cannot be empty' }
    if (name.length > NAME_MAX) return { ok: false, error: `name exceeds ${NAME_MAX} characters` }
    out.name = name
  }
  if (b.pinned !== undefined) {
    if (typeof b.pinned !== 'boolean') return { ok: false, error: 'pinned must be a boolean' }
    out.pinned = b.pinned
  }
  for (const field of ['instructions', 'memory'] as const) {
    if (b[field] !== undefined) {
      const v = str(b[field])
      if (v === null) return { ok: false, error: `${field} must be a string` }
      if (v.length > TEXT_MAX) return { ok: false, error: `${field} exceeds ${TEXT_MAX} characters` }
      out[field] = v
    }
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'no editable field supplied' }
  return { ok: true, value: out }
}

export function parseSourceCreate(body: unknown): Parsed<{ name: string }> {
  return parseCreate(body)
}

export function parseSourcePatch(body: unknown): Parsed<Partial<{ name: string; body: string }>> {
  const b = (body ?? {}) as Record<string, unknown>
  const out: Partial<{ name: string; body: string }> = {}

  if (b.name !== undefined) {
    const name = str(b.name)?.trim()
    if (!name) return { ok: false, error: 'name cannot be empty' }
    if (name.length > NAME_MAX) return { ok: false, error: `name exceeds ${NAME_MAX} characters` }
    out.name = name
  }
  if (b.body !== undefined) {
    const v = str(b.body)
    if (v === null) return { ok: false, error: 'body must be a string' }
    if (v.length > TEXT_MAX) return { ok: false, error: `body exceeds ${TEXT_MAX} characters` }
    // An empty body is legitimate — clearing a note is a real edit.
    out.body = v
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'no editable field supplied' }
  return { ok: true, value: out }
}
