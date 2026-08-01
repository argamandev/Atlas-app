import 'server-only'
import type { ProjectRow, ProjectSourceRow } from '@/lib/projects/data'

// ─────────────────────────────────────────────────────────────────────────────
// The only module that talks to `projects` and `project_sources`.
//
// Every function takes the CALLER'S OWN supabase client (anon key + the
// request's cookies), never supabaseAdmin. That is deliberate and it is the
// point of the chapter: the service-role key bypasses RLS entirely, so a
// mistake in a filter below would leak another user's project. Going through
// the user's client means Postgres refuses it — RLS is load-bearing rather
// than decorative.
//
// Consequence worth knowing: a project belonging to someone else does not come
// back as "forbidden", it comes back as NOT THERE. That is the correct answer
// and the routes render it as a 404.
// ─────────────────────────────────────────────────────────────────────────────

// Structural type — accepts the @supabase/ssr server client without dragging
// its generics through every signature.
type Db = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

const PROJECT_COLS =
  'id, user_id, name, pinned, instructions, memory, memory_updated_at, created_at, updated_at'
const SOURCE_COLS = 'id, project_id, user_id, name, body, position, created_at, updated_at'

export async function listProjects(supabase: Db): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_COLS)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as ProjectRow[]
}

export async function getProjectWithSources(
  supabase: Db,
  id: string
): Promise<{ project: ProjectRow; sources: ProjectSourceRow[] } | null> {
  const { data: project, error } = await supabase
    .from('projects')
    .select(PROJECT_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!project) return null

  const { data: sources, error: sErr } = await supabase
    .from('project_sources')
    .select(SOURCE_COLS)
    .eq('project_id', id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (sErr) throw new Error(sErr.message)

  return { project: project as ProjectRow, sources: (sources ?? []) as ProjectSourceRow[] }
}

export async function createProject(supabase: Db, userId: string, name: string): Promise<ProjectRow> {
  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: userId, name })
    .select(PROJECT_COLS)
    .single()
  if (error) throw new Error(error.message)
  return data as ProjectRow
}

export type ProjectPatch = Partial<Pick<ProjectRow, 'name' | 'pinned' | 'instructions' | 'memory'>>

export async function patchProject(supabase: Db, id: string, patch: ProjectPatch): Promise<ProjectRow> {
  const now = new Date().toISOString()
  const row: Record<string, unknown> = { ...patch, updated_at: now }
  // memory_updated_at moves ONLY when memory itself changes, so "Last updated 2
  // days ago" refers to the memory rather than to any edit of the project.
  if (patch.memory !== undefined) row.memory_updated_at = now

  const { data, error } = await supabase
    .from('projects')
    .update(row)
    .eq('id', id)
    .select(PROJECT_COLS)
    .single()
  if (error) throw new Error(error.message)
  return data as ProjectRow
}

export async function addSource(
  supabase: Db,
  userId: string,
  projectId: string,
  name: string
): Promise<ProjectSourceRow> {
  // The composite key means an attempt to attach a note to someone else's
  // project fails in the DATABASE, not merely in a check we remembered to write.
  const { data, error } = await supabase
    .from('project_sources')
    .insert({ user_id: userId, project_id: projectId, name })
    .select(SOURCE_COLS)
    .single()
  if (error) throw new Error(error.message)
  return data as ProjectSourceRow
}

export async function patchSource(
  supabase: Db,
  id: string,
  patch: Partial<Pick<ProjectSourceRow, 'name' | 'body'>>
): Promise<ProjectSourceRow> {
  const { data, error } = await supabase
    .from('project_sources')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(SOURCE_COLS)
    .single()
  if (error) throw new Error(error.message)
  return data as ProjectSourceRow
}

/** A project's chats, owner-filtered as well as project-filtered — belt and braces. */
export async function listProjectChats(
  supabase: Db,
  projectId: string,
  userId: string
): Promise<{ id: string; title: string; updated_at: string }[]> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, title, updated_at')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as { id: string; title: string; updated_at: string }[]
}
