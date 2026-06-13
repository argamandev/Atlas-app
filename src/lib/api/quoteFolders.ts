import { apiGet, apiPost, apiPatch, apiDelete } from './client'
import type { QuoteFolder } from './types'

export function fetchFolders(companyId?: string): Promise<QuoteFolder[]> {
  return apiGet<QuoteFolder[]>(`/api/quote-folders${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`)
}

export function createFolder(companyId: string, name: string): Promise<QuoteFolder> {
  return apiPost<QuoteFolder>('/api/quote-folders', { companyId, name })
}

export function renameFolder(id: string, name: string): Promise<QuoteFolder> {
  return apiPatch<QuoteFolder>(`/api/quote-folders/${id}`, { name })
}

export function deleteFolder(id: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/api/quote-folders/${id}`)
}

// File a quote into a folder (folderId) or unfile it (null) — rides on the quote PATCH.
export function assignQuoteFolder(quoteId: string, folderId: string | null): Promise<unknown> {
  return apiPatch(`/api/quotes/${quoteId}`, { folderId })
}
