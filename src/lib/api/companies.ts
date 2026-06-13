import { apiGet } from './client'
import type { Company, ScheduledCall } from './types'

export function fetchCompanies(q?: string): Promise<Company[]> {
  return apiGet<Company[]>(`/api/companies${q ? `?q=${encodeURIComponent(q)}` : ''}`)
}

export function fetchCompany(id: string): Promise<{ company: Company; calls: ScheduledCall[] }> {
  return apiGet<{ company: Company; calls: ScheduledCall[] }>(`/api/companies/${id}`)
}
