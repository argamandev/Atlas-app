import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import type { Transcript } from '@/lib/types'
import { TranscriptHeader } from '@/components/transcript/TranscriptHeader'
import { TranscriptActions } from '@/components/transcript/TranscriptActions'
import { TranscriptBody } from '@/components/transcript/TranscriptBody'
import { SectionNav } from '@/components/transcript/SectionNav'

interface Props {
  params: { id: string }
}

export default async function TranscriptPage({ params }: Props) {
  const { data, error } = await supabaseAdmin
    .from('transcripts')
    .select('formatted_data, status')
    .eq('id', params.id)
    .single()

  if (error || !data || data.status !== 'completed' || !data.formatted_data) {
    notFound()
  }

  const transcript = data.formatted_data as Transcript

  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar */}
      <div className="sticky top-0 z-40 h-14 border-b border-border bg-bg/90 backdrop-blur-sm flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2 text-muted hover:text-text-secondary transition-colors">
            <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="text-xs">חזרה</span>
          </Link>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 bg-accent rounded-sm flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">T</span>
            </div>
            <span className="text-sm font-medium text-text-primary">תמלול שיחות משקיעים</span>
          </div>
        </div>

        <div className="hidden md:block">
          <TranscriptActions transcript={transcript} />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <TranscriptHeader transcript={transcript} />

        <div className="md:hidden mb-6">
          <TranscriptActions transcript={transcript} />
        </div>

        <div className="flex gap-8">
          <div className="flex-1 min-w-0">
            <div className="bg-card border border-border rounded p-6 md:p-8">
              <TranscriptBody transcript={transcript} />
            </div>
          </div>

          <div className="hidden lg:block w-44 flex-shrink-0">
            <SectionNav sections={transcript.sections} />
          </div>
        </div>

        <div className="mt-8 pt-5 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted">
            תמלול נוצר באמצעות תשתית תמלול מוסדית
          </p>
          <p className="text-xs text-muted font-mono-num" dir="ltr">
            {new Date(transcript.createdAt).toLocaleString('he-IL')}
          </p>
        </div>
      </div>
    </div>
  )
}
