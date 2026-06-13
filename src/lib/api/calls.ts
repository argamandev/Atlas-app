import { apiGet, apiPost } from './client'
import type { ScheduledCall } from './types'

export function fetchCalls(opts?: { scope?: 'all' | 'upcoming' | 'live'; companyId?: string }): Promise<ScheduledCall[]> {
  const sp = new URLSearchParams()
  if (opts?.scope) sp.set('scope', opts.scope)
  if (opts?.companyId) sp.set('companyId', opts.companyId)
  const qs = sp.toString()
  return apiGet<ScheduledCall[]>(`/api/calls${qs ? `?${qs}` : ''}`)
}

export function fetchFollowedCallIds(): Promise<string[]> {
  return apiGet<string[]>('/api/calls/follow')
}

export function setFollowCall(callId: string, follow: boolean): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>('/api/calls/follow', { callId, follow })
}
