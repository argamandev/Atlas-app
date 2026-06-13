import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import type { Company, CompanyLite } from '@/lib/api/types'

const COLS =
  'id, name, display_name, name_en, tase_security_id, tase_issuer_id, sector, sub_sector, logo_url, description, website'

type Row = Record<string, unknown>

// Fallback logo mapping for seeds whose logo_url isn't set in the DB yet
// (the תמיס/Themis logo was added late — see CLAUDE.md). Exported so call lists reuse it.
export function resolveCompanyLogo(r: Row): string | null {
  if (typeof r.logo_url === 'string' && r.logo_url) return r.logo_url
  const byId: Record<string, string> = {
    '1105022': '/logos/tigbur.jpg',
    '1083955': '/logos/qualitau.png',
    '1097229': '/logos/tamis.png',
  }
  const tid = typeof r.tase_security_id === 'string' ? r.tase_security_id : ''
  if (tid && byId[tid]) return byId[tid]
  const name = `${r.display_name ?? ''} ${r.name ?? ''}`
  if (name.includes('רג')) return '/logos/rga.png'
  if (name.includes('תמיס') || name.toLowerCase().includes('themis')) return '/logos/tamis.png'
  return null
}

function mapCompany(r: Row): Company {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    displayName: String(r.display_name ?? r.name ?? ''),
    nameEn: (r.name_en as string) ?? null,
    ticker: (r.tase_security_id as string) ?? null,
    sector: (r.sector as string) ?? null,
    subSector: (r.sub_sector as string) ?? null,
    logoUrl: resolveCompanyLogo(r),
    description: (r.description as string) ?? null,
    website: (r.website as string) ?? null,
  }
}

export function toCompanyLite(c: Company): CompanyLite {
  return { id: c.id, name: c.name, displayName: c.displayName, nameEn: c.nameEn, logoUrl: c.logoUrl, ticker: c.ticker }
}

export async function listCompanies(): Promise<Company[]> {
  const { data, error } = await supabaseAdmin.from('companies').select(COLS).order('display_name')
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapCompany)
}

export async function getCompany(id: string): Promise<Company | null> {
  const { data, error } = await supabaseAdmin.from('companies').select(COLS).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapCompany(data as Row) : null
}

export async function getCompanyByTicker(ticker: string): Promise<Company | null> {
  const { data, error } = await supabaseAdmin.from('companies').select(COLS).eq('tase_security_id', ticker).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapCompany(data as Row) : null
}

export async function searchCompanies(q: string): Promise<Company[]> {
  // Strip characters that are syntactically meaningful inside a PostgREST `.or()` filter
  // (comma = clause separator, parens = grouping, `*`/`%` = wildcards) so user input can't
  // break or alter the query.
  const term = q.trim().replace(/[,()*%]/g, ' ').trim()
  if (!term) return listCompanies()
  const like = `%${term}%`
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select(COLS)
    .or(`name.ilike.${like},display_name.ilike.${like},name_en.ilike.${like},tase_security_id.ilike.${like}`)
    .limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapCompany)
}
