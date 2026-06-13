import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { resolveCompanyLogo } from '@/lib/db/companies'
import type { CompanyLite, ScheduledCall } from '@/lib/api/types'

const CALL_COLS = 'id, company_id, scheduled_at, quarter, zoom_url, status, source, transcript_id'
const LITE_COLS = 'id, name, display_name, name_en, logo_url, tase_security_id'

type Row = Record<string, unknown>

function mapLite(c: Row | null | undefined): CompanyLite | undefined {
  if (!c) return undefined
  return {
    id: String(c.id),
    name: String(c.name ?? ''),
    displayName: String(c.display_name ?? c.name ?? ''),
    nameEn: (c.name_en as string) ?? null,
    logoUrl: resolveCompanyLogo(c),
    ticker: (c.tase_security_id as string) ?? null,
  }
}

function mapCall(r: Row): ScheduledCall {
  return {
    id: String(r.id),
    companyId: String(r.company_id),
    scheduledAt: String(r.scheduled_at),
    quarter: String(r.quarter ?? ''),
    zoomUrl: (r.zoom_url as string) ?? null,
    status: (r.status as ScheduledCall['status']) ?? 'scheduled',
    source: (r.source as ScheduledCall['source']) ?? 'mock',
    transcriptId: (r.transcript_id as string) ?? null,
    company: mapLite(r.companies as Row),
  }
}

export interface ListCallsOptions {
  scope?: 'all' | 'upcoming' | 'live'
  companyId?: string
}

export async function listCalls({ scope = 'all', companyId }: ListCallsOptions = {}): Promise<ScheduledCall[]> {
  let query = supabaseAdmin
    .from('scheduled_calls')
    .select(`${CALL_COLS}, companies(${LITE_COLS})`)
    .order('scheduled_at', { ascending: true })

  if (companyId) query = query.eq('company_id', companyId)
  if (scope === 'live') query = query.eq('status', 'live')
  if (scope === 'upcoming') {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    query = query.gte('scheduled_at', startOfToday.toISOString()).neq('status', 'ended')
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  // Company calls are most useful newest-first; everything else nearest-upcoming-first.
  const calls = (data ?? []).map(mapCall)
  if (companyId) calls.sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
  return calls
}

export async function listCompanyCalls(companyId: string): Promise<ScheduledCall[]> {
  return listCalls({ companyId })
}
