// Shared domain types for the V1 product (companies, calls, quotes). Used by the
// server data layer (lib/db), the route handlers, and the client fetchers (lib/api).

// Used when there is no auth session (public demo). supabaseAdmin bypasses RLS, and
// neither quotes nor followed_calls FK to auth.users, so this id is safe to persist.
export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000000'

export interface Company {
  id: string
  name: string // official Hebrew name
  displayName: string // short name (e.g. רג"א)
  nameEn: string | null
  ticker: string | null // TASE security id
  sector: string | null
  subSector: string | null
  logoUrl: string | null
  description: string | null
  website: string | null
}

export type CompanyLite = Pick<Company, 'id' | 'name' | 'displayName' | 'nameEn' | 'logoUrl' | 'ticker'>

export type CallStatus = 'scheduled' | 'live' | 'ended' | 'processed'
export type CallSource = 'mock' | 'maya'

export interface ScheduledCall {
  id: string
  companyId: string
  scheduledAt: string // ISO timestamp
  quarter: string
  zoomUrl: string | null
  status: CallStatus
  source: CallSource
  transcriptId: string | null
  company?: CompanyLite
}

export interface Quote {
  id: string
  companyId: string
  transcriptId: string | null
  text: string
  speaker: string | null
  quarter: string | null
  startSec: number | null
  createdAt: string
  company?: CompanyLite
}

// Localized display helpers — pick the right name for the active locale.
export function companyDisplayName(c: { displayName: string; nameEn: string | null }, locale: 'en' | 'he'): string {
  if (locale === 'en' && c.nameEn) return c.nameEn
  return c.displayName
}
