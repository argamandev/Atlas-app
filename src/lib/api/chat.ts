import { apiPost } from './client'

export interface ChatSource {
  company: string
  quarter: string
  transcriptId: string
}

export interface ChatReply {
  reply: string
  source: ChatSource | null
}

export function sendChat(input: {
  message: string
  companyId?: string
  history?: { role: 'user' | 'assistant'; content: string }[]
}): Promise<ChatReply> {
  return apiPost<ChatReply>('/api/chat', input)
}
