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

/**
 * THE ROW WAS NOT THERE — WHICH IS NOT AN ERROR, AND IS NOT A SUCCESS EITHER.
 *
 * Every write below runs through the user's own client, so RLS answers "not
 * yours" by simply not matching the row. PostgREST reports that as zero rows
 * affected and no error, and the two habits this module had for it were both
 * wrong in the same direction:
 *
 *   · a delete with no `.select()` could not tell "removed it" from "matched
 *     nothing", and the route answered `{deleted:true}` either way — Atlas
 *     reporting a workspace destroyed that it never touched;
 *   · an update ending in `.single()` turned zero rows into PGRST116, which the
 *     routes' catch-all rendered as a 500 carrying the raw string "JSON object
 *     requested, multiple (or no) rows returned" — shown to the analyst, in
 *     English, inside a right-to-left Hebrew banner.
 *
 * So it gets its own type, and the routes turn it into a 404. Same reasoning as
 * `ItemNotFound` in lib/workspace/content: 404 is the whole answer to both
 * "never existed" and "belongs to someone else".
 */
export class RowNotFound extends Error {
  constructor(what: string) {
    super(`${what} not found`)
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
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new RowNotFound('workspace')
  return data as WorkspaceRow
}

export async function deleteWorkspace(supabase: Db, id: string): Promise<void> {
  // `.select()` is what makes the answer true: without it a delete that matched
  // nothing is indistinguishable from one that removed the row.
  const { data, error } = await supabase.from('workspaces').delete().eq('id', id).select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new RowNotFound('workspace')
}

// ── Shelf items ──────────────────────────────────────────────────────────────

/**
 * The row already holding this source on this shelf, or null.
 *
 * Only a CORPUS reference counts as an identity: `transcript_id` and
 * `document_id` name a row every workspace shares, so two shelf entries for one
 * of them are the same file twice. An upload (`storage_path` alone) is not
 * deduplicated — it is its own artifact, and a person who uploads a file twice
 * may well mean it.
 */
async function findAttached(
  supabase: Db,
  workspaceId: string,
  input: ItemCreate
): Promise<WorkspaceItemRow | null> {
  const column = input.transcript_id ? 'transcript_id' : input.document_id ? 'document_id' : null
  const value = input.transcript_id ?? input.document_id
  if (!column || !value) return null

  const { data, error } = await supabase
    .from('workspace_items')
    .select(ITEM_COLS)
    .eq('workspace_id', workspaceId)
    .eq(column, value)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as WorkspaceItemRow) ?? null
}

/**
 * `created: false` means the shelf already held this source and nothing was
 * written — the route answers 200 rather than 201, because "Created" for a row
 * that already existed is a false statement in the one place a caller is
 * entitled to trust literally.
 */
export type AddItemResult = { item: WorkspaceItemRow; created: boolean }

export async function addItem(
  supabase: Db,
  userId: string,
  workspaceId: string,
  input: ItemCreate
): Promise<AddItemResult> {
  // APPEND TO THE END OF THE SHELF. Until 2026-08-04 this was omitted, so every
  // row took the column default of 0 and the shelf had no order at all — six
  // sources attached from the intake all landed at position 0, and the tab order
  // then came from whatever the read happened to return. Caught in the browser
  // by querying the rows after a real build, not by reading the code: the
  // intake's own comment claimed sequential inserts preserved the user's order,
  // which was a guarantee this function never made.
  //
  // A concurrent pair can tie. `position` carries no unique constraint, ties
  // fall back to the read's secondary sort, and that is strictly better than
  // every row sharing one value.
  //
  // ATTACHING A SOURCE THE SHELF ALREADY HOLDS IS A NO-OP, NOT AN ERROR.
  //
  // The database has enforced this since migration 017 —
  // `workspace_items_transcript_uniq` and `..._document_uniq`, partial unique
  // indexes on (workspace_id, source id). That is the right place for it and it
  // is not in doubt. What was missing is what happens when it fires: this
  // function inserted unconditionally, so Postgres raised 23505 and the route's
  // catch returned it as a 500 carrying raw "duplicate key value violates unique
  // constraint" text. Asking for a file you already have is an ordinary thing to
  // do, and it is not a server error.
  //
  // The already-attached row is returned instead: "put this on my shelf" is
  // satisfied by it already being there. The caller sees a normal item, the
  // shelf does not grow, and the route answers 200 rather than 201.
  //
  // NOT A REPLACEMENT FOR THE INDEX, and deliberately not written as one — this
  // is read-then-write, so two simultaneous attaches still race. The index is
  // what actually holds; this only decides how the collision reads.
  const existing = await findAttached(supabase, workspaceId, input)
  if (existing) {
    // Asking for a file you already have, but CLOSED, must still show it —
    // otherwise "yes, pull that one" appears to do nothing at all, which is the
    // same invisible-outcome bug as the one-of-three-tabs case below.
    const row = existing.is_open
      ? existing
      : await patchItem(supabase, workspaceId, existing.id, { is_open: true })
    return { item: row, created: false }
  }

  const { data: last, error: maxErr } = await supabase
    .from('workspace_items')
    .select('position')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxErr) throw new Error(maxErr.message)
  const position = last ? (last as { position: number }).position + 1 : 0

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
      position,
      // A FILE YOU JUST ADDED IS ONE YOU WANT TO SEE.
      //
      // The column defaults to false, which meant a pull of three agreed files
      // produced three shelf rows and ONE open tab — the workspace's own
      // "reopen exactly as you left it" logic found nothing open and fell back
      // to showing the first source. Founder, 2026-08-04: *"he only pulled 1
      // file while i asked for two files and we agreed on them."* Two rows were
      // written; one was ever presented, and from the outside those are
      // indistinguishable.
      //
      // Set here rather than as a column default: the default is what an
      // UNSPECIFIED row means, and a row restored or written by anything else
      // should still start closed. This is a statement about attaching.
      is_open: true,
      transcript_id: input.transcript_id ?? null,
      document_id: input.document_id ?? null,
      storage_path: input.storage_path ?? null,
    })
    .select(ITEM_COLS)
    .single()
  if (error) throw new Error(error.message)
  await touch(supabase, workspaceId)
  return { item: data as WorkspaceItemRow, created: true }
}

/**
 * LAYOUT ONLY — deliberately does not touch the workspace's updated_at.
 *
 * BOUND TO THE WORKSPACE IN THE URL, not only to the row id. RLS keeps this
 * inside one account, so the id alone is not a security hole — but it let
 * `/workspaces/A/items/<an item that lives in B>` edit B's row while `touch()`
 * stamped A, and "edited 2h ago" then named a room nothing had happened in.
 * `lib/workspace/content.ts` binds both ids and is the pattern being copied.
 */
export async function patchItem(
  supabase: Db,
  workspaceId: string,
  id: string,
  patch: Partial<Pick<WorkspaceItemRow, 'is_open' | 'position'>>
): Promise<WorkspaceItemRow> {
  const { data, error } = await supabase
    .from('workspace_items')
    .update(patch)
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select(ITEM_COLS)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new RowNotFound('item')
  return data as WorkspaceItemRow
}

export async function deleteItem(supabase: Db, workspaceId: string, id: string): Promise<void> {
  // Blocks citing this item are NOT deleted — the key releases the source
  // instead, leaving the user's sentence in place with a visibly broken
  // citation. That is the designed behaviour, not a leak.
  const { data, error } = await supabase
    .from('workspace_items')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new RowNotFound('item')
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
    .eq('workspace_id', workspaceId)
    .select(BLOCK_COLS)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new RowNotFound('block')
  await touch(supabase, workspaceId)
  return data as WorkspaceBlockRow
}

export async function deleteBlock(supabase: Db, workspaceId: string, id: string): Promise<void> {
  const { data, error } = await supabase
    .from('workspace_doc_blocks')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new RowNotFound('block')
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
    .eq('workspace_id', workspaceId)
    .select(THREAD_COLS)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new RowNotFound('thread')
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
