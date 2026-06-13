import 'server-only'
import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import type { Quote, QuoteAnchor } from '@/lib/api/types'

// Quotes + followed-calls use the DB when their tables exist (migration 20260613_007),
// and fall back to an in-process store when they don't — so the UI and the live-transcript
// self-test work even before the migration is applied. (Dev fallback is per-process only.)
// Backed by globalThis so the SAME store is shared across Next's separate RSC and
// route-handler module layers in dev (otherwise a quote POSTed via a route handler is
// invisible to a server-component read). No-op once the real tables exist.
const g = globalThis as unknown as {
  __timlulQuoteMem?: Map<string, Quote[]>
  __timlulFollowMem?: Map<string, Set<string>>
  __timlulDbFlags?: { quotes: boolean; follows: boolean }
}
const quoteMem = (g.__timlulQuoteMem ??= new Map<string, Quote[]>())
const followMem = (g.__timlulFollowMem ??= new Map<string, Set<string>>())
const flags = (g.__timlulDbFlags ??= { quotes: false, follows: false })

function missingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  const code = err.code ?? ''
  const msg = err.message ?? ''
  // 42P01 = Postgres undefined_table; PGRST205 = PostgREST can't find table in schema cache.
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /does not exist/i.test(msg) ||
    /could not find the table/i.test(msg) ||
    /schema cache/i.test(msg)
  )
}

type Row = Record<string, unknown>
function mapQuote(r: Row): Quote {
  return {
    id: String(r.id),
    companyId: String(r.company_id ?? ''),
    transcriptId: (r.transcript_id as string) ?? null,
    text: String(r.text ?? ''),
    speaker: (r.speaker as string) ?? null,
    quarter: (r.quarter as string) ?? null,
    startSec: (r.start_sec as number) ?? null,
    anchor: (r.anchor as QuoteAnchor) ?? null,
    folderId: (r.folder_id as string) ?? null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }
}

// columns selected for a Quote row (kept in one place — every read uses the same shape)
const QUOTE_COLS = 'id, company_id, transcript_id, text, speaker, quarter, start_sec, anchor, folder_id, created_at'

export interface NewQuote {
  companyId: string
  transcriptId?: string | null
  text: string
  speaker?: string | null
  quarter?: string | null
  startSec?: number | null
  anchor?: QuoteAnchor | null
}

export async function listQuotes(userId: string, companyId?: string): Promise<Quote[]> {
  if (!flags.quotes) {
    let q = supabaseAdmin
      .from('quotes')
      .select(QUOTE_COLS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (companyId) q = q.eq('company_id', companyId)
    const { data, error } = await q
    if (!error) return (data ?? []).map(mapQuote)
    if (!missingTable(error)) throw new Error(error.message)
    flags.quotes = true
  }
  const all = quoteMem.get(userId) ?? []
  return companyId ? all.filter((x) => x.companyId === companyId) : all
}

export async function createQuote(userId: string, input: NewQuote): Promise<Quote> {
  if (!flags.quotes) {
    const { data, error } = await supabaseAdmin
      .from('quotes')
      .insert({
        user_id: userId,
        company_id: input.companyId,
        transcript_id: input.transcriptId ?? null,
        text: input.text,
        speaker: input.speaker ?? null,
        quarter: input.quarter ?? null,
        start_sec: input.startSec ?? null,
        anchor: input.anchor ?? null,
      })
      .select(QUOTE_COLS)
      .single()
    if (!error && data) return mapQuote(data)
    if (error && !missingTable(error)) throw new Error(error.message)
    flags.quotes = true
  }
  const quote: Quote = {
    id: randomUUID(),
    companyId: input.companyId,
    transcriptId: input.transcriptId ?? null,
    text: input.text,
    speaker: input.speaker ?? null,
    quarter: input.quarter ?? null,
    startSec: input.startSec ?? null,
    anchor: input.anchor ?? null,
    createdAt: new Date().toISOString(),
  }
  const arr = quoteMem.get(userId) ?? []
  arr.unshift(quote)
  quoteMem.set(userId, arr)
  return quote
}

export async function deleteQuote(userId: string, id: string): Promise<void> {
  if (!flags.quotes) {
    const { error } = await supabaseAdmin.from('quotes').delete().eq('id', id).eq('user_id', userId)
    if (!error) return
    if (!missingTable(error)) throw new Error(error.message)
    flags.quotes = true
  }
  const arr = quoteMem.get(userId) ?? []
  quoteMem.set(
    userId,
    arr.filter((q) => q.id !== id),
  )
}

export async function updateQuote(
  userId: string,
  id: string,
  fields: { text?: string; folderId?: string | null },
): Promise<Quote | null> {
  // build the column patch from only the keys actually provided (folderId:null = unfile)
  const patch: Record<string, unknown> = {}
  if (fields.text !== undefined) patch.text = fields.text
  if (fields.folderId !== undefined) patch.folder_id = fields.folderId
  if (Object.keys(patch).length === 0) return null

  if (!flags.quotes) {
    const { data, error } = await supabaseAdmin
      .from('quotes')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select(QUOTE_COLS)
      .maybeSingle()
    if (!error) return data ? mapQuote(data) : null
    if (!missingTable(error)) throw new Error(error.message)
    flags.quotes = true
  }
  const arr = quoteMem.get(userId) ?? []
  const q = arr.find((x) => x.id === id)
  if (q) {
    if (fields.text !== undefined) q.text = fields.text
    if (fields.folderId !== undefined) q.folderId = fields.folderId
  }
  return q ?? null
}

// Keep saved quotes in sync when a speaker is renamed in the transcript.
export async function renameSpeakerInQuotes(transcriptId: string, oldName: string, newName: string): Promise<void> {
  if (!flags.quotes) {
    const { error } = await supabaseAdmin
      .from('quotes')
      .update({ speaker: newName })
      .eq('transcript_id', transcriptId)
      .eq('speaker', oldName)
    if (!error) return
    if (!missingTable(error)) throw new Error(error.message)
    flags.quotes = true
  }
  for (const arr of Array.from(quoteMem.values())) {
    for (const q of arr) if (q.transcriptId === transcriptId && q.speaker === oldName) q.speaker = newName
  }
}

// ── followed calls ("My Calendar") ──
export async function listFollowedCallIds(userId: string): Promise<string[]> {
  if (!flags.follows) {
    const { data, error } = await supabaseAdmin.from('followed_calls').select('call_id').eq('user_id', userId)
    if (!error) return (data ?? []).map((r) => String((r as Row).call_id))
    if (!missingTable(error)) throw new Error(error.message)
    flags.follows = true
  }
  return Array.from(followMem.get(userId) ?? [])
}

export async function followCall(userId: string, callId: string, follow: boolean): Promise<void> {
  if (!flags.follows) {
    if (follow) {
      const { error } = await supabaseAdmin.from('followed_calls').upsert({ user_id: userId, call_id: callId })
      if (!error) return
      if (!missingTable(error)) throw new Error(error.message)
      flags.follows = true
    } else {
      const { error } = await supabaseAdmin.from('followed_calls').delete().eq('user_id', userId).eq('call_id', callId)
      if (!error) return
      if (!missingTable(error)) throw new Error(error.message)
      flags.follows = true
    }
  }
  const set = followMem.get(userId) ?? new Set<string>()
  if (follow) set.add(callId)
  else set.delete(callId)
  followMem.set(userId, set)
}
