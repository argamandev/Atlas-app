import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { resolveCompanyLogo } from '@/lib/db/companies'
import type { CompanyLite, ScheduledCall } from '@/lib/api/types'

const CALL_COLS =
  'id, company_id, scheduled_at, quarter, zoom_url, status, source, transcript_id, kind, time_known'
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
    // Defaults match migration 021's column defaults, so a row written before it
    // (the four `source='mock'` seeds) reads as a timed investor call, which is
    // what those rows are.
    kind: (r.kind as ScheduledCall['kind']) ?? 'call',
    timeKnown: r.time_known === undefined || r.time_known === null ? true : Boolean(r.time_known),
  }
}

export interface ListCallsOptions {
  scope?: 'all' | 'upcoming' | 'live'
  companyId?: string
  /**
   * Include the four `source='mock'` seed rows. Defaults to FALSE.
   *
   * Founder decision 2026-08-08 was to remove the mock data, and these are
   * fabricated June-2026 investor calls for real TASE issuers. They cannot be
   * DELETED — `delete` is hook-blocked and this database is shared with
   * production Timlul — so filtering them at the only read path is the
   * equivalent that is available, and it is reversible.
   */
  includeMock?: boolean
}

export async function listCalls({
  scope = 'all',
  companyId,
  includeMock = false,
}: ListCallsOptions = {}): Promise<ScheduledCall[]> {
  // PAGINATED, AND THAT IS NOT PREMATURE. PostgREST applies a server-side
  // max-rows cap (1000 on Supabase by default) and returns a SHORT LIST rather
  // than an error — so the calendar would silently show part of the year and
  // look exactly like a calendar showing all of it. This table went from 4 rows
  // to ~883 with the first MAYA sync and grows by roughly 900 a year, so the
  // cap is months away, not hypothetical. Asking in pages removes the class
  // instead of raising the ceiling.
  const PAGE = 500
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    let query = supabaseAdmin
      .from('scheduled_calls')
      .select(`${CALL_COLS}, companies(${LITE_COLS})`)
      .order('scheduled_at', { ascending: true })
      // A stable tiebreak, or a row can appear on two pages and another on none:
      // `scheduled_at` is not unique (63 rows share a timestamp in the synced data).
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (!includeMock) query = query.neq('source', 'mock')
    if (companyId) query = query.eq('company_id', companyId)
    if (scope === 'live') query = query.eq('status', 'live')
    if (scope === 'upcoming') {
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      query = query.gte('scheduled_at', startOfToday.toISOString()).neq('status', 'ended')
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)
    const page = data ?? []
    rows.push(...(page as Row[]))
    // A short page means the end. A full one may still be the server's cap
    // rather than ours, which is exactly why the loop asks again.
    if (page.length < PAGE) break
  }

  // Company calls are most useful newest-first; everything else nearest-upcoming-first.
  const calls = rows.map(mapCall)
  if (companyId) calls.sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
  return calls
}

export async function listCompanyCalls(companyId: string): Promise<ScheduledCall[]> {
  return listCalls({ companyId })
}
