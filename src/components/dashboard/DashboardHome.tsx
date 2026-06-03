import Link from 'next/link'
import type { RecentTranscript } from '@/lib/types'
import { UrlInputBar } from '@/components/dashboard/UrlInputBar'
import { TranscriptsTable } from '@/components/dashboard/TranscriptsTable'

interface DashboardHomeProps {
  transcripts: RecentTranscript[]
  userName: string
}

export function DashboardHome({ transcripts, userName }: DashboardHomeProps) {
  const recent = transcripts.slice(0, 6)

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 max-w-5xl mx-auto w-full" dir="rtl">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          <span className="text-accent">// תמלול חדש.</span>
        </h1>
        <p className="text-base text-text-secondary mt-2">
          הדביקו קישור YouTube או Vimeo לשיחת משקיעים לקבלת תמלול מקצועי
        </p>
      </div>

      {/* New transcription input */}
      <div className="bg-card border border-border rounded p-5 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-accent">// תמלול חדש.</span>
        </div>
        <p className="text-sm text-muted mb-3">תמלול מקצועי אורך כ5 דקות בממוצע.</p>
        <UrlInputBar size="hero" />
      </div>

      {/* Recent transcripts */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary tracking-tight">תמלולים אחרונים</h2>
        <Link
          href="/companies"
          className="font-mono-num text-xs text-muted hover:text-accent transition-colors tracking-wide flex items-center gap-1"
        >
          כל החברות
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
      </div>

      <TranscriptsTable transcripts={recent} />
    </div>
  )
}
