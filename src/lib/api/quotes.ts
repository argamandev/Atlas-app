import { apiGet, apiPost, apiPatch, apiDelete } from './client'
import type { Quote } from './types'

export interface NewQuoteInput {
  companyId: string
  transcriptId?: string | null
  text: string
  speaker?: string | null
  quarter?: string | null
  startSec?: number | null
}

export function fetchQuotes(companyId?: string): Promise<Quote[]> {
  return apiGet<Quote[]>(`/api/quotes${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`)
}

export function createQuote(input: NewQuoteInput): Promise<Quote> {
  return apiPost<Quote>('/api/quotes', input)
}

export function updateQuote(id: string, fields: { text: string }): Promise<Quote> {
  return apiPatch<Quote>(`/api/quotes/${id}`, fields)
}

export function deleteQuote(id: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/api/quotes/${id}`)
}
