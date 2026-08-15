// The one place `/api/chat/v2` reads a project for injection.
//
// THROUGH THE CALLER'S OWN SUPABASE CLIENT, never `supabaseAdmin` — projects are
// personal rows, and the service-role key bypasses RLS entirely (db.md ownership
// law). So a projectId belonging to someone else does not come back as
// "forbidden", it comes back as NOT THERE, which the loop renders as `failed`.
// Postgres decides, not a filter in this file that could be got wrong.
//
// NO `import 'server-only'` HERE, and that absence is load-bearing. `callSource.ts`
// had one and it made the module unloadable outside Next — caught at 08b's
// verification, after the tests had been green the whole time, because they inject
// their own loader and never touch this file. `@/lib/db/projects` is server-only
// itself and is reached through a DYNAMIC import below, so the cost stays where it
// belongs: on the code path that actually queries.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProjectForInjection } from './projectInjection'

/**
 * Load one project and its sources for injection.
 *
 * `null` means the project is not there FOR THIS CALLER — deleted, or someone
 * else's under RLS. The two are deliberately indistinguishable: telling a caller
 * which of the two it is would confirm the existence of another user's project.
 * Both end in the same visible `failed` notice.
 *
 * Throws whatever the query throws. The loop catches it and reports the same
 * `failed` state — a load that errored and a project that is gone are the same
 * fact to the user ("your project context is not in this answer"), and inventing
 * a distinction the surface has no copy for would be its own small lie.
 */
export async function loadProjectForInjection(
  projectId: string,
  userDb: SupabaseClient
): Promise<ProjectForInjection | null> {
  const { getProjectWithSources } = await import('@/lib/db/projects')
  const found = await getProjectWithSources(userDb, projectId)
  if (!found) return null
  return {
    name: found.project.name,
    instructions: found.project.instructions,
    memory: found.project.memory,
    sources: found.sources.map((s) => ({ name: s.name, body: s.body })),
  }
}
