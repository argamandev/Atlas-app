import { DEMO_USER_ID } from '@/lib/api/types'

// Pure decision logic for the conversations layer. Split out of the route and
// the db module so it can be tested without a Supabase client or a request —
// the wiring commit that introduced both rules shipped with no test at all.

/**
 * Does this error mean the conversations TABLE is absent, so the module should
 * fall back to its in-memory store?
 *
 * The answer sets a module-global flag that downgrades EVERY conversation for
 * the rest of the process, silently — so a false positive costs the user their
 * whole history until restart, with an empty Recent Chats list and no error.
 *
 * It must therefore be narrow. A bare /does not exist/ also matches
 * "column chat_conversations.project_id does not exist" (42703), and any
 * /schema cache/ also matches PostgREST's missing-COLUMN error (PGRST204) —
 * either would turn one bad column into an app that quietly forgets everything.
 * That was live from the moment this module first referenced a column that can
 * be absent.
 *
 * @param table the table the caller was querying, so a message naming a
 *   DIFFERENT relation is not accepted as evidence about this one.
 */
export function isMissingTable(err: { code?: string; message?: string } | null, table: string): boolean {
  if (!err) return false
  const code = err.code ?? ''
  const msg = err.message ?? ''
  // The codes are unambiguous: 42P01 = undefined_table, PGRST205 = PostgREST
  // cannot find the table in its schema cache.
  if (code === '42P01' || code === 'PGRST205') return true
  // Message fallbacks must name the TABLE, never merely "does not exist".
  const t = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (
    new RegExp(`could not find the table [^]*${t}`, 'i').test(msg) ||
    new RegExp(`relation ("?public"?\\.)?"?${t}"? does not exist`, 'i').test(msg)
  )
}

export type ConversationScope =
  { ok: true; userId: string; projectId: string | null } | { ok: false; status: 401 }

/**
 * Who owns the conversation about to be created, and which project (if any) it
 * belongs to.
 *
 * A project chat needs a REAL user: projects are owner-scoped and the
 * DEMO_USER_ID fallback owns nothing, so attaching one would be refused by the
 * composite foreign key as a 500. Refusing it here makes it a 401, which is what
 * actually happened. An ordinary chat still falls back to the demo id, because
 * that path predates ownership and is not this chapter's to change.
 */
export function resolveConversationScope(realUserId: string | null, body: unknown): ConversationScope {
  const raw = (body as { projectId?: unknown } | null)?.projectId
  const projectId = typeof raw === 'string' && raw ? raw : null
  if (projectId && !realUserId) return { ok: false, status: 401 }
  return { ok: true, userId: realUserId ?? DEMO_USER_ID, projectId }
}
