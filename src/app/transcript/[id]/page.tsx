// ⚠️ LEGACY (Timlul) — slated for deletion ~2026-07. Do NOT use as a pattern for Atlas. See LEGACY.md
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import type { Transcript } from '@/lib/types'
import { AppNav } from '@/components/layout/AppNav'
import { TranscriptEditor } from '@/components/transcript/TranscriptEditor'

interface Props {
  params: { id: string }
}

export default async function TranscriptPage({ params }: Props) {
  const { data, error } = await supabaseAdmin
    .from('transcripts')
    .select('formatted_data, status, user_id, youtube_url')
    .eq('id', params.id)
    .single()

  if (error || !data || data.status !== 'completed' || !data.formatted_data) {
    notFound()
  }

  const transcript = data.formatted_data as Transcript
  const youtubeUrl = (data.youtube_url as string | null) ?? ''

  // Determine if the current user may edit (owner or admin)
  const { userId, userName, isAdmin } = await getCurrentUser()
  const canEdit = !!userId && (userId === data.user_id || isAdmin)

  return (
    <div className="min-h-screen bg-bg">
      <AppNav userName={userName} isAdmin={isAdmin} />

      {/* Back to home, under the navbar */}
      <div className="no-print max-w-6xl mx-auto px-6 pt-5" dir="rtl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-xs text-muted hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          חזרה לדף הבית
        </Link>
      </div>

      <TranscriptEditor transcript={transcript} id={params.id} canEdit={canEdit} isAdmin={isAdmin} youtubeUrl={youtubeUrl} />
    </div>
  )
}
