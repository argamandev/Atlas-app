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

/**
 * Which project (if any) the conversation about to be created belongs to.
 *
 * THIS FUNCTION DELIBERATELY CARRIES NO IDENTITY, and that is the whole point of
 * its shape. It used to be `resolveConversationScope(realUserId, body)` and
 * returned `userId: realUserId ?? DEMO_USER_ID` — it refused a PROJECT chat
 * without a real user, and let an ordinary one fall through to the shared demo
 * identity, on the reasoning that "that path predates ownership".
 *
 * Two things were wrong with that, both found at the merge gate:
 *
 * 1. It MOVED a hole rather than closing one. The fallback started in
 *    `src/app/api/conversations/route.ts`, which `apiAuthBoundary.test.ts`
 *    scans for exactly this pattern; lifting it into `src/lib/db` put it where
 *    that test does not look. The guard would have gone green over a live
 *    shared-identity write.
 * 2. "Not this chapter's to change" was the wrong call. An unidentified caller
 *    writing rows owned by one shared uuid is the defect `DEMO_USER_ID` was
 *    deleted from the repo to make unrepresentable.
 *
 * So the route resolves the user itself, refuses without one, and calls this
 * with a body alone. There is no null-user case left to decide here — which is
 * why the return type is a plain `string | null` and not a result object.
 *
 * What remains genuinely worth a pure test: an untrusted body must not be able
 * to turn a non-string (or empty) `projectId` into a project chat.
 */
export function resolveProjectId(body: unknown): string | null {
  const raw = (body as { projectId?: unknown } | null)?.projectId
  return typeof raw === 'string' && raw ? raw : null
}
