import { apiGet, apiPost } from './client'
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
