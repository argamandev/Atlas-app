'use client'

import { useParams } from 'next/navigation'
import { useProcessingTimer } from '@/hooks/useProcessingTimer'
import { ProcessingSteps } from '@/components/processing/ProcessingSteps'

export default function ProcessingPage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : ''
  const { steps, totalProgress } = useProcessingTimer({ id })

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Top bar */}
      <div className="h-14 border-b border-border flex items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 bg-accent rounded-sm flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">T</span>
          </div>
          <span className="text-sm font-medium text-text-primary">תמלול שיחות משקיעים</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          מעבד
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full border border-border bg-card mb-5">
              <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight mb-2">
              מעבד שיחת משקיעים
            </h1>
            <p className="text-sm text-muted">
              אנחנו מנתחים ומתמללים את השיחה. הפעולה אורכת 1–4 דקות.
            </p>
          </div>

          {/* Processing steps */}
          <div className="bg-card border border-border rounded p-6">
            <ProcessingSteps steps={steps} totalProgress={totalProgress} />
          </div>

          {/* Info note */}
          <div className="mt-5 flex items-start gap-2.5 px-4 py-3 rounded border border-border/50 bg-bg-secondary/50">
            <svg className="w-3.5 h-3.5 text-muted flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-xs text-muted leading-relaxed">
              אל תסגרו את הדף. התמלול יוצג אוטומטית עם סיום העיבוד.
            </p>
          </div>

          {/* Bottom decorative grid */}
          <div className="mt-8 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          <div className="mt-2 flex justify-center gap-1">
            {[...Array(24)].map((_, i) => (
              <div
                key={i}
                className="w-1 rounded-full bg-border transition-all duration-300"
                style={{
                  height: `${4 + Math.sin((i + totalProgress / 10) * 0.8) * 4}px`,
                  opacity: i / 24 < totalProgress / 100 ? 0.6 : 0.2,
                  backgroundColor: i / 24 < totalProgress / 100 ? '#FF6A00' : undefined,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
