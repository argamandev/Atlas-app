import 'server-only'
import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import type { ChatMsg, Conversation, ConversationSummary } from '@/lib/api/types'

// Persisted chat conversations. DB when the table exists (migration 009), in-memory fallback
// otherwise — mirrors the quotes.ts pattern, globalThis-backed so RSC + route-handler layers
// share one store in dev.
const g = globalThis as unknown as {
  __timlulConvMem?: Map<string, Conversation[]>
  __timlulConvFlag?: { on: boolean }
}
const convMem = (g.__timlulConvMem ??= new Map<string, Conversation[]>())
const flag = (g.__timlulConvFlag ??= { on: false })

function missingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  const code = err.code ?? ''
  const msg = err.message ?? ''
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /does not exist/i.test(msg) ||
    /could not find the table/i.test(msg) ||
    /schema cache/i.test(msg)
  )
}

type Row = Record<string, unknown>
function mapConv(r: Row): Conversation {
  return {
    id: String(r.id),
    title: String(r.title ?? 'New chat'),
    companyId: (r.company_id as string) ?? null,
    transcriptId: (r.transcript_id as string) ?? null,
    messages: Array.isArray(r.messages) ? (r.messages as ChatMsg[]) : [],
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  if (!flag.on) {
    const { data, error } = await supabaseAdmin
      .from('chat_conversations')
      .select('id, title, company_id, transcript_id, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (!error) {
      return (data ?? []).map((r) => {
        const { messages: _m, ...rest } = mapConv({ ...(r as Row), messages: [] })
        return rest
      })
    }
    if (!missingTable(error)) throw new Error(error.message)
    flag.on = true
  }
  return (convMem.get(userId) ?? []).map(({ messages: _m, ...rest }) => rest)
}

export async function getConversation(userId: string, id: string): Promise<Conversation | null> {
  if (!flag.on) {
    const { data, error } = await supabaseAdmin
      .from('chat_conversations')
      .select('id, title, company_id, transcript_id, messages, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()
    if (!error) return data ? mapConv(data) : null
    if (!missingTable(error)) throw new Error(error.message)
    flag.on = true
  }
  return (convMem.get(userId) ?? []).find((c) => c.id === id) ?? null
}

export async function createConversation(
  userId: string,
  input: { title?: string; companyId?: string | null; transcriptId?: string | null }
): Promise<Conversation> {
  const now = new Date().toISOString()
  if (!flag.on) {
    const { data, error } = await supabaseAdmin
      .from('chat_conversations')
      .insert({
        user_id: userId,
        title: input.title ?? 'New chat',
        company_id: input.companyId ?? null,
        transcript_id: input.transcriptId ?? null,
        messages: [],
      })
      .select('id, title, company_id, transcript_id, messages, created_at, updated_at')
      .single()
    if (!error && data) return mapConv(data)
    if (error && !missingTable(error)) throw new Error(error.message)
    flag.on = true
  }
  const conv: Conversation = {
    id: randomUUID(),
    title: input.title ?? 'New chat',
    companyId: input.companyId ?? null,
    transcriptId: input.transcriptId ?? null,
    messages: [],
    createdAt: now,
    updatedAt: now,
  }
  const arr = convMem.get(userId) ?? []
  arr.unshift(conv)
  convMem.set(userId, arr)
  return conv
}

export async function saveMessages(
  userId: string,
  id: string,
  messages: ChatMsg[],
  title?: string
): Promise<void> {
  const now = new Date().toISOString()
  if (!flag.on) {
    const patch: Row = { messages, updated_at: now }
    if (title) patch.title = title
    const { error } = await supabaseAdmin
      .from('chat_conversations')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
    if (!error) return
    if (!missingTable(error)) throw new Error(error.message)
    flag.on = true
  }
  const arr = convMem.get(userId) ?? []
  const c = arr.find((x) => x.id === id)
  if (c) {
    c.messages = messages
    c.updatedAt = now
    if (title) c.title = title
  }
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  if (!flag.on) {
    const { error } = await supabaseAdmin
      .from('chat_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (!error) return
    if (!missingTable(error)) throw new Error(error.message)
    flag.on = true
  }
  const arr = convMem.get(userId) ?? []
  convMem.set(
    userId,
    arr.filter((c) => c.id !== id)
  )
}

// First user message → conversation title (trimmed to 60 chars).
export function titleFromMessages(messages: ChatMsg[]): string {
  const first = messages.find((m) => m.role === 'user')?.content?.trim()
  return first ? first.slice(0, 60) : 'New chat'
}
