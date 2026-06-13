import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import type { QuoteFolder } from '@/lib/api/types'

// "My Quotes" folders (migration 20260614_010). Owned by a user, scoped to a company.
// Server layer talks to the table via supabaseAdmin (RLS-bypassing); the API routes
// gate every call by the caller's user_id. Quote→folder assignment lives on quotes.folder_id
// (see updateQuote in db/quotes.ts) so it isn't duplicated here.

type Row = Record<string, unknown>
function mapFolder(r: Row): QuoteFolder {
  return {
    id: String(r.id),
    companyId: (r.company_id as string) ?? null,
    name: String(r.name ?? ''),
  }
}

function missingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  const code = err.code ?? ''
  const msg = err.message ?? ''
  return code === '42P01' || code === 'PGRST205' || /does not exist/i.test(msg) || /could not find the table/i.test(msg) || /schema cache/i.test(msg)
}

export async function listFolders(userId: string, companyId?: string): Promise<QuoteFolder[]> {
  let q = supabaseAdmin
    .from('quote_folders')
    .select('id, company_id, name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (companyId) q = q.eq('company_id', companyId)
  const { data, error } = await q
  if (error) {
    if (missingTable(error)) return [] // table not migrated yet → degrade to "no folders"
    throw new Error(error.message)
  }
  return (data ?? []).map(mapFolder)
}

export async function createFolder(userId: string, companyId: string | null, name: string): Promise<QuoteFolder> {
  const { data, error } = await supabaseAdmin
    .from('quote_folders')
    .insert({ user_id: userId, company_id: companyId, name })
    .select('id, company_id, name, created_at')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not create folder')
  return mapFolder(data)
}

export async function renameFolder(userId: string, id: string, name: string): Promise<QuoteFolder | null> {
  const { data, error } = await supabaseAdmin
    .from('quote_folders')
    .update({ name })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, company_id, name, created_at')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapFolder(data) : null
}

// Deleting a folder leaves its quotes intact — quotes.folder_id FK is ON DELETE SET NULL.
export async function deleteFolder(userId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('quote_folders').delete().eq('id', id).eq('user_id', userId)
  if (error) throw new Error(error.message)
}
