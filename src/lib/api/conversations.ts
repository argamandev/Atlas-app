import { apiGet, apiPost, apiPatch, apiDelete } from './client'
import type { Conversation, ConversationSummary, ChatMsg } from './types'

export function fetchConversations(): Promise<ConversationSummary[]> {
  return apiGet<ConversationSummary[]>('/api/conversations')
}
export function fetchConversation(id: string): Promise<Conversation> {
  return apiGet<Conversation>(`/api/conversations/${id}`)
}
export function createConversation(input: {
  title?: string
  companyId?: string | null
  transcriptId?: string | null
}): Promise<Conversation> {
  return apiPost<Conversation>('/api/conversations', input)
}
export function saveConversation(id: string, messages: ChatMsg[], title?: string): Promise<{ ok: boolean }> {
  return apiPatch<{ ok: boolean }>(`/api/conversations/${id}`, { messages, title })
}
export function deleteConversation(id: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/api/conversations/${id}`)
}
