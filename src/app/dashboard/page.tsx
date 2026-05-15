import { cookies } from 'next/headers'
import { supabaseAdmin, createServerSupabase } from '@/lib/supabase'
import type { RecentTranscript, TranscriptStatus } from '@/lib/types'
import { PlatformShell } from '@/components/platform/PlatformShell'

export const revalidate = 0

export default async function DashboardPage() {
  // Get current user session
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const { data: { session } } = await supabase.auth.getSession()

  // Fetch user profile
  let isAdmin = false
  let userName = 'משתמש'
  if (session?.user) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name, role')
      .eq('id', session.user.id)
      .single()

    if (profile) {
      isAdmin = profile.role === 'admin'
      userName = profile.first_name || session.user.email?.split('@')[0] || 'משתמש'
    }
  }

  // Fetch transcripts
  const { data: rows } = await supabaseAdmin
    .from('transcripts')
    .select('id, youtube_title, status, duration, created_at, formatted_data')
    .order('created_at', { ascending: false })
    .limit(50)

  const transcripts: RecentTranscript[] = (rows ?? []).map((row) => {
    const fd = row.formatted_data as Record<string, string> | null
    return {
      id: row.id,
      company: fd?.company ?? row.youtube_title ?? 'שיחת משקיעים',
      ticker: fd?.ticker ?? '',
      quarter: fd?.quarter ?? '',
      date: fd?.date ?? (row.created_at as string).split('T')[0],
      duration: row.duration ?? '',
      status: row.status as TranscriptStatus,
      createdAt: row.created_at as string,
    }
  })

  return <PlatformShell transcripts={transcripts} isAdmin={isAdmin} userName={userName} />
}
