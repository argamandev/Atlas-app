import 'server-only'
import type {
  WorkspaceRow,
  WorkspaceItemRow,
  WorkspaceThreadRow,
  WorkspaceBlockRow,
} from '@/lib/workspace/data'
import type { ItemCreate, BlockCreate } from '@/lib/workspace/validate'

// ─────────────────────────────────────────────────────────────────────────────
// The only module that talks to the four workspace tables (migration 016).
//
// Every function takes the CALLER'S OWN supabase client (anon key + the
// request's cookies), never supabaseAdmin. That is deliberate and it is the
// point of the chapter: the service-role key bypasses RLS entirely, so a
// mistake in a filter below would leak another user's workspace. Going through
// the user's client means Postgres refuses it — RLS is load-bearing rather
// than decorative.
//
// Consequence worth knowing: someone else's workspace does not come back as
// "forbidden", it comes back as NOT THERE. That is the correct answer and the
// routes render it as a 404.
//
// The older lib/db modules (conversations, quotes, transcripts, …) still use
// supabaseAdmin and filter in application code. They are not the pattern here.
// ─────────────────────────────────────────────────────────────────────────────

// Structural type — accepts the @supabase/ssr server client without dragging
// its generics through every signature.
type Db = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

const WS_COLS = 'id, user_id, name, doc_title, created_at, updated_at'
const ITEM_COLS =
  'id, workspace_id, user_id, transcript_id, document_id, storage_path, name, kind, is_open, position, created_at'
const THREAD_COLS = 'id, workspace_id, user_id, title, messages, created_at, updated_at'
const BLOCK_COLS =
  'id, workspace_id, user_id, kind, body, position, source_item_id, source_label, source_page, source_line_id, source_quote, created_at, updated_at'

/**
 * `workspaces.updated_at` tracks CONTENT, so every content mutation calls this
 * and no layout mutation does. Opening or closing a pane is frequent and
 * debounced; if it bumped the timestamp, the derived "edited 2h ago" would
 * quietly come to mean "looked at 2h ago". See the column comment in 016.
 */
async function touch(supabase: Db, workspaceId: string): Promise<void> {
  const { error } = await supabase
    .from('workspaces')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', workspaceId)
  if (error) throw new Error(error.message)
}

// ── Workspaces ───────────────────────────────────────────────────────────────

export async function listWorkspaces(supabase: Db): Promise<WorkspaceRow[]> {
  const { data, error } = await supabase
    .from('workspaces')
    .select(WS_COLS)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as WorkspaceRow[]
}

/** Every item the caller owns, across all their workspaces. RLS scopes it. */
export async function listAllItems(supabase: Db): Promise<WorkspaceItemRow[]> {
  const { data, error } = await supabase
    .from('workspace_items')
    .select(ITEM_COLS)
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as WorkspaceItemRow[]
}

/**
 * THE WARM READ. One call returns everything needed to render the workspace
 * exactly as it was left: the row, its items WITH is_open/position, and the
 * working document's blocks in order.
 *
 * One round trip on purpose — the server's first paint is then the real thing,
 * with no second fetch and no flash of an empty workbench.
 */
export async function getWorkspaceFull(
  supabase: Db,
  id: string
): Promise<{
  workspace: WorkspaceRow
  items: WorkspaceItemRow[]
  blocks: WorkspaceBlockRow[]
} | null> {
  const { data: workspace, error } = await supabase
    .from('workspaces')
    .select(WS_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!workspace) return null

  const { data: items, error: iErr } = await supabase
    .from('workspace_items')
    .select(ITEM_COLS)
    .eq('workspace_id', id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (iErr) throw new Error(iErr.message)

  const { data: blocks, error: bErr } = await supabase
    .from('workspace_doc_blocks')
    .select(BLOCK_COLS)
    .eq('workspace_id', id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (bErr) throw new Error(bErr.message)

  return {
    workspace: workspace as WorkspaceRow,
    items: (items ?? []) as WorkspaceItemRow[],
    blocks: (blocks ?? []) as WorkspaceBlockRow[],
  }
}

export async function createWorkspace(supabase: Db, userId: string, name: string): Promise<WorkspaceRow> {
  const { data, error } = await supabase
    .from('workspaces')
    .insert({ user_id: userId, name })
    .select(WS_COLS)
    .single()
  if (error) throw new Error(error.message)
  return data as WorkspaceRow
}

export type WorkspacePatchInput = Partial<Pick<WorkspaceRow, 'name' | 'doc_title'>>

export async function patchWorkspace(
  supabase: Db,
  id: string,
  patch: WorkspacePatchInput
): Promise<WorkspaceRow> {
  const { data, error } = await supabase
    .from('workspaces')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(WS_COLS)
    .single()
  if (error) throw new Error(error.message)
  return data as WorkspaceRow
}

export async function deleteWorkspace(supabase: Db, id: string): Promise<void> {
  const { error } = await supabase.from('workspaces').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Shelf items ──────────────────────────────────────────────────────────────

export async function addItem(
  supabase: Db,
  userId: string,
  workspaceId: string,
  input: ItemCreate
): Promise<WorkspaceItemRow> {
  // The composite key means an attempt to attach a source to someone else's
  // workspace fails in the DATABASE, not merely in a check we remembered to
  // write — referential-integrity checks bypass RLS, so a single-column key
  // would have validated against a stranger's row.
  const { data, error } = await supabase
    .from('workspace_items')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      kind: input.kind,
      name: input.name,
      transcript_id: input.transcript_id ?? null,
      document_id: input.document_id ?? null,
      storage_path: input.storage_path ?? null,
    })
    .select(ITEM_COLS)
    .single()
  if (error) throw new Error(error.message)
  await touch(supabase, workspaceId)
  return data as WorkspaceItemRow
}

/** LAYOUT ONLY — deliberately does not touch the workspace's updated_at. */
export async function patchItem(
  supabase: Db,
  id: string,
  patch: Partial<Pick<WorkspaceItemRow, 'is_open' | 'position'>>
): Promise<WorkspaceItemRow> {
  const { data, error } = await supabase
    .from('workspace_items')
    .update(patch)
    .eq('id', id)
    .select(ITEM_COLS)
    .single()
  if (error) throw new Error(error.message)
  return data as WorkspaceItemRow
}

export async function deleteItem(supabase: Db, workspaceId: string, id: string): Promise<void> {
  // Blocks citing this item are NOT deleted — the key releases the source
  // instead, leaving the user's sentence in place with a visibly broken
  // citation. That is the designed behaviour, not a leak.
  const { error } = await supabase.from('workspace_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
  await touch(supabase, workspaceId)
}

// ── The working document ─────────────────────────────────────────────────────

export async function addBlock(
  supabase: Db,
  userId: string,
  workspaceId: string,
  input: BlockCreate
): Promise<WorkspaceBlockRow> {
  const { data, error } = await supabase
    .from('workspace_doc_blocks')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      kind: input.kind,
      body: input.body,
      position: input.position,
      source_item_id: input.source_item_id ?? null,
      source_label: input.source_label ?? null,
      source_page: input.source_page ?? null,
      source_line_id: input.source_line_id ?? null,
      source_quote: input.source_quote ?? null,
    })
    .select(BLOCK_COLS)
    .single()
  if (error) throw new Error(error.message)
  await touch(supabase, workspaceId)
  return data as WorkspaceBlockRow
}

export async function patchBlock(
  supabase: Db,
  workspaceId: string,
  id: string,
  patch: Partial<Pick<WorkspaceBlockRow, 'body' | 'position'>>
): Promise<WorkspaceBlockRow> {
  const { data, error } = await supabase
    .from('workspace_doc_blocks')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(BLOCK_COLS)
    .single()
  if (error) throw new Error(error.message)
  await touch(supabase, workspaceId)
  return data as WorkspaceBlockRow
}

export async function deleteBlock(supabase: Db, workspaceId: string, id: string): Promise<void> {
  const { error } = await supabase.from('workspace_doc_blocks').delete().eq('id', id)
  if (error) throw new Error(error.message)
  await touch(supabase, workspaceId)
}

// ── Threads ──────────────────────────────────────────────────────────────────

export async function listThreads(supabase: Db, workspaceId: string): Promise<WorkspaceThreadRow[]> {
  const { data, error } = await supabase
    .from('workspace_threads')
    .select(THREAD_COLS)
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as WorkspaceThreadRow[]
}

export async function addThread(
  supabase: Db,
  userId: string,
  workspaceId: string,
  title: string
): Promise<WorkspaceThreadRow> {
  const { data, error } = await supabase
    .from('workspace_threads')
    .insert({ user_id: userId, workspace_id: workspaceId, title, messages: [] })
    .select(THREAD_COLS)
    .single()
  if (error) throw new Error(error.message)
  await touch(supabase, workspaceId)
  return data as WorkspaceThreadRow
}

export async function patchThread(
  supabase: Db,
  workspaceId: string,
  id: string,
  patch: Partial<Pick<WorkspaceThreadRow, 'title' | 'messages'>>
): Promise<WorkspaceThreadRow> {
  const { data, error } = await supabase
    .from('workspace_threads')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(THREAD_COLS)
    .single()
  if (error) throw new Error(error.message)
  await touch(supabase, workspaceId)
  return data as WorkspaceThreadRow
}

// ── Company names, for the DERIVED company label ─────────────────────────────

/**
 * itemId -> company name, for the items that point at shared corpus.
 *
 * A workspace's company is derived from its sources rather than stored, because
 * one workspace is about a single issuer and another is about three at once —
 * a column could not represent the second without picking one and lying.
 *
 * Reads `transcripts`, `company_documents` and `companies` through the USER'S
 * client, which works because all three carry a shared-corpus read policy
 * (`for select to authenticated`). Private uploads have no company and are
 * simply absent from the map.
 */
export async function companyNamesByItem(
  supabase: Db,
  items: WorkspaceItemRow[]
): Promise<Record<string, string>> {
  const transcriptIds = items.map((i) => i.transcript_id).filter((v): v is string => !!v)
  const documentIds = items.map((i) => i.document_id).filter((v): v is string => !!v)
  if (transcriptIds.length === 0 && documentIds.length === 0) return {}

  const sourceCompany: Record<string, string> = {} // transcript/document id -> company_id

  if (transcriptIds.length > 0) {
    const { data, error } = await supabase
      .from('transcripts')
      .select('id, company_id')
      .in('id', transcriptIds)
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as { id: string; company_id: string | null }[]) {
      if (r.company_id) sourceCompany[r.id] = r.company_id
    }
  }
  if (documentIds.length > 0) {
    const { data, error } = await supabase
      .from('company_documents')
      .select('id, company_id')
      .in('id', documentIds)
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as { id: string; company_id: string | null }[]) {
      if (r.company_id) sourceCompany[r.id] = r.company_id
    }
  }

  const companyIds = Object.keys(sourceCompany)
    .map((k) => sourceCompany[k])
    .filter((v, i, a) => a.indexOf(v) === i)
  if (companyIds.length === 0) return {}

  const { data: companies, error: cErr } = await supabase
    .from('companies')
    .select('id, name')
    .in('id', companyIds)
  if (cErr) throw new Error(cErr.message)

  const nameById: Record<string, string> = {}
  for (const c of (companies ?? []) as { id: string; name: string }[]) nameById[c.id] = c.name

  const out: Record<string, string> = {}
  for (const item of items) {
    const sourceId = item.transcript_id ?? item.document_id
    if (!sourceId) continue
    const companyId = sourceCompany[sourceId]
    if (companyId && nameById[companyId]) out[item.id] = nameById[companyId]
  }
  return out
}

// ── The count-before-destroy obligation ──────────────────────────────────────

/**
 * How much deleting this workspace would DESTROY.
 *
 * Not a convenience. Lane rule 3: the first delete UI anywhere, including
 * Workspace's, must show the count of what it is about to destroy BEFORE
 * destroying it. Threads store `messages` as inline jsonb, so the cascade takes
 * the whole history with the row rather than unlinking it, and the blocks are
 * the entire working document.
 *
 * Note DELETE is already reachable without any UI — the `for all` owner policy
 * covers it, so a workspace's owner can delete straight through PostgREST with
 * the browser's anon key. This exists so the obligation is one call away rather
 * than one thing to remember.
 */
export async function countWorkspaceContents(
  supabase: Db,
  workspaceId: string
): Promise<{ items: number; threads: number; blocks: number }> {
  const countIn = async (table: string): Promise<number> => {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
    if (error) throw new Error(error.message)
    return count ?? 0
  }
  return {
    items: await countIn('workspace_items'),
    threads: await countIn('workspace_threads'),
    blocks: await countIn('workspace_doc_blocks'),
  }
}
