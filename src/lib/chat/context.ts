import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import type { Transcript } from '@/lib/types'

// Builds transcript-grounded context for the chat assistant (context-stuffing, no vector
// DB — per CLAUDE.md). Prefers a transcript for the mentioned company; falls back to the
// most recent completed transcript so the chat is demoable even before seeded companies
// have their own calls.
export interface ChatContext {
  text: string
  source: { company: string; quarter: string; transcriptId: string } | null
}

const MAX_CONTEXT_CHARS = 40_000

function buildText(fd: Transcript): string {
  const nameOf = (sid: string) => fd.speakers?.find((s) => s.id === sid)?.name ?? 'Speaker'
  const header = `${fd.company ?? ''} — ${fd.quarter ?? ''}${fd.date ? ` (${fd.date})` : ''}`.trim()
  const body = (fd.sections ?? [])
    .flatMap((sec) => sec.lines.map((l) => `${nameOf(l.speakerId)}: ${l.text}`))
    .join('\n')
  return `${header}\n\n${body}`.slice(0, MAX_CONTEXT_CHARS)
}

async function latestCompleted(companyId?: string): Promise<{ id: string; formatted_data: Transcript } | null> {
  let q = supabaseAdmin
    .from('transcripts')
    .select('id, formatted_data')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
  if (companyId) q = q.eq('company_id', companyId)
  const { data } = await q
  const row = data?.[0]
  if (row?.formatted_data) return { id: row.id as string, formatted_data: row.formatted_data as Transcript }
  return null
}

export async function getChatContext(companyId?: string): Promise<ChatContext> {
  // Prefer the company's own transcript; fall back to any completed transcript.
  const hit = (companyId ? await latestCompleted(companyId) : null) ?? (await latestCompleted())
  if (!hit) return { text: '', source: null }
  const fd = hit.formatted_data
  return {
    text: buildText(fd),
    source: { company: fd.company ?? '', quarter: fd.quarter ?? '', transcriptId: hit.id },
  }
}
