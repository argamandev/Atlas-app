import { supabaseAdmin } from '@/lib/supabase'
import type { RecentTranscript, TranscriptStatus } from '@/lib/types'
import { israelDayKey } from '@/lib/i18n/format'

// Transcripts are SHARED CORPUS — one archive, the same for every user (docs/DATA-MODEL.md).
// There is deliberately no per-user reader here.
//
// There used to be one: `getUserTranscripts(userId, isAdmin)`, which showed admins everything
// and everyone else only their own rows. That was the OLD repo's model (Timlul, a personal
// transcription tool), it had no callers left in Atlas, and it was deleted 2026-08-01 with
// migration 014 so the wrong model is not sitting here to be copied. An archive partitioned
// per user cannot answer "which company talked about M&A last quarter?", which is the product.
//
// If a whole-archive listing is ever needed, write it unfiltered — the row-level policy
// (`transcripts_shared_read`) already grants every signed-in user read access to all of it.

// Finished (completed) transcripts linked to a company — shown on the company page and
// opened in the Live Transcript page. Platform-wide (no per-user filter).
export async function listCompanyTranscripts(companyId: string): Promise<RecentTranscript[]> {
  const { data } = await supabaseAdmin
    .from('transcripts')
    .select('id, youtube_title, status, duration, created_at, formatted_data')
    .eq('company_id', companyId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })

  return (data ?? []).map((row) => {
    const fd = row.formatted_data as Record<string, string> | null
    return {
      id: row.id as string,
      company: fd?.company ?? (row.youtube_title as string) ?? 'שיחת משקיעים',
      ticker: fd?.ticker ?? '',
      quarter: fd?.quarter ?? '',
      // THE ISRAEL DAY, NOT THE UTC DAY. Splitting the ISO string takes the UTC
      // date, so a transcript created between midnight and 03:00 Israel time
      // rendered as the PREVIOUS day — on the very rows the documents tab shows.
      // Filed at the fix/israel-time-residue merge; rules/app.md is the law.
      date: fd?.date ?? israelDayKey(row.created_at as string),
      duration: (row.duration as string) ?? '',
      status: row.status as TranscriptStatus,
      createdAt: row.created_at as string,
    }
  })
}
