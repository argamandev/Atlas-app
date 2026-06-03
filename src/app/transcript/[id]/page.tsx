import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { supabaseAdmin, createServerSupabase } from '@/lib/supabase'
import type { Transcript } from '@/lib/types'
import { TranscriptEditor } from '@/components/transcript/TranscriptEditor'

interface Props {
  params: { id: string }
}

export default async function TranscriptPage({ params }: Props) {
  const { data, error } = await supabaseAdmin
    .from('transcripts')
    .select('formatted_data, status, user_id')
    .eq('id', params.id)
    .single()

  if (error || !data || data.status !== 'completed' || !data.formatted_data) {
    notFound()
  }

  const transcript = data.formatted_data as Transcript

  // Determine if the current user may edit (owner or admin)
  let canEdit = false
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    if (session.user.id === data.user_id) {
      canEdit = true
    } else {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
      canEdit = profile?.role === 'admin'
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar — dir=rtl: logo right, back/actions left */}
      <div className="no-print sticky top-0 z-40 h-14 border-b border-border bg-bg/90 backdrop-blur-sm flex items-center justify-between px-6" dir="rtl">
        <Link href="/dashboard" className="font-mono-num font-bold text-white text-base tracking-tight" dir="rtl">
          תמלול<span className="text-accent">.</span>
        </Link>
        <Link href="/dashboard" className="flex items-center gap-2 text-muted hover:text-text-secondary transition-colors">
          <span className="text-xs">חזרה</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
      </div>

      <TranscriptEditor transcript={transcript} id={params.id} canEdit={canEdit} />
    </div>
  )
}
