import { supabaseAdmin } from '@/lib/supabase'
import type { RecentTranscript, TranscriptStatus } from '@/lib/types'

// Fetches the transcripts a user may see (admins see all, others their own)
// and maps DB rows → RecentTranscript. Shared by dashboard + companies pages.
export async function getUserTranscripts(
  userId: string | null,
  isAdmin: boolean,
  limit = 200,
): Promise<RecentTranscript[]> {
  // Defensive: a non-admin without a user id must never see other users' data.
  if (!isAdmin && !userId) return []

  let query = supabaseAdmin
    .from('transcripts')
    .select('id, youtube_title, status, duration, created_at, formatted_data')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!isAdmin && userId) {
    query = query.eq('user_id', userId)
  }

  const { data: rows } = await query

  return (rows ?? []).map((row) => {
    const fd = row.formatted_data as Record<string, string> | null
    return {
      id: row.id as string,
      company: fd?.company ?? (row.youtube_title as string) ?? 'שיחת משקיעים',
      ticker: fd?.ticker ?? '',
      quarter: fd?.quarter ?? '',
      date: fd?.date ?? (row.created_at as string).split('T')[0],
      duration: (row.duration as string) ?? '',
      status: row.status as TranscriptStatus,
      createdAt: row.created_at as string,
    }
  })
}
