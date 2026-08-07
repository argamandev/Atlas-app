import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { countWorkspaceContents } from '@/lib/db/workspaces'

export const dynamic = 'force-dynamic'

/**
 * What deleting this workspace would destroy — READ BEFORE THE DELETE.
 *
 * The DELETE route already counts and returns the same numbers, but it counts
 * them on its way past: useful for reporting what happened, useless for asking
 * whether it should. `.claude/rules/db.md` and the counting function's own
 * header both bind the UI to showing this BEFORE it destroys anything, and a
 * confirmation dialog cannot show a number it can only obtain by deleting.
 *
 * `countWorkspaceContents` filters by workspace_id through the USER'S client, so
 * RLS is what stops these numbers describing somebody else's room.
 *
 * A WORKSPACE THAT IS NOT THERE COUNTS AS THREE ZEROES, and this route does not
 * try to tell that apart from an empty one. It could — but only by paying for a
 * fourth query to answer a question the caller does not have: the confirmation
 * is opened from a row in a list the server just rendered. If that list is stale
 * because another tab deleted the workspace, the DELETE that follows returns its
 * own 404 and the dialog renders it. Guessing earlier would not make the second
 * request more correct.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  try {
    const counts = await countWorkspaceContents(supabase, params.id)
    return NextResponse.json({ counts }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
