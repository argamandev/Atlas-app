'use client'
// ⚠️ LEGACY (Timlul) — slated for deletion ~2026-07. Do NOT use as a pattern for Atlas. See LEGACY.md

import { cn } from '@/lib/utils'
import type { ProcessingStep } from '@/hooks/useProcessingTimer'

interface ProcessingStepsProps {
  steps: ProcessingStep[]
  totalProgress: number
}

export function ProcessingSteps({ steps, totalProgress }: ProcessingStepsProps) {
  return (
    <div className="w-full max-w-md mx-auto">
      {/* Total progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted">עיבוד</span>
          <span className="text-xs text-muted font-mono-num" dir="ltr">{Math.round(totalProgress)}%</span>
        </div>
        <div className="h-px bg-border overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300 ease-out"
            style={{ width: `${totalProgress}%` }}
          />
        </div>
      </div>

      {/* Steps list */}
      <div className="space-y-0">
        {steps.map((step, i) => (
          <div key={i} className="relative">
            {/* Connector line */}
            {i < steps.length - 1 && (
              <div className="absolute right-[14px] top-[28px] w-px h-[calc(100%-12px)] bg-border" />
            )}

            <div className={cn(
              'flex items-start gap-4 py-3 px-1 rounded transition-colors',
              step.status === 'active' && 'text-text-primary',
              step.status === 'complete' && 'text-text-secondary',
              step.status === 'pending' && 'text-muted',
            )}>
              {/* Status indicator */}
              <div className="flex-shrink-0 mt-0.5 relative z-10">
                {step.status === 'complete' && (
                  <div className="w-7 h-7 rounded-full bg-success/10 border border-success/40 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-success" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                {step.status === 'active' && (
                  <div className="w-7 h-7 rounded-full bg-accent/10 border border-accent/50 flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  </div>
                )}
                {step.status === 'pending' && (
                  <div className="w-7 h-7 rounded-full border border-border flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-border" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className={cn(
                    'text-sm font-medium',
                    step.status === 'active' && 'text-text-primary',
                    step.status === 'complete' && 'text-text-secondary',
                    step.status === 'pending' && 'text-muted/60',
                  )}>
                    {step.label}
                    {step.status === 'active' && (
                      <span className="inline-block w-1 h-3.5 bg-accent mr-1 align-middle animate-blink" />
                    )}
                  </span>
                  {step.status === 'complete' && (
                    <span className="text-2xs text-success font-mono-num">הושלם</span>
                  )}
                </div>

                {/* Sub-label */}
                {step.status !== 'pending' && (
                  <p className="text-xs text-muted leading-relaxed mb-2">{step.sublabel}</p>
                )}

                {/* Progress bar for active step */}
                {step.status === 'active' && (
                  <div className="h-px bg-border/60 overflow-hidden">
                    <div
                      className="h-full bg-accent/50 transition-all duration-100"
                      style={{ width: `${step.progress}%` }}
                    />
                  </div>
                )}
                {step.status === 'complete' && (
                  <div className="h-px bg-success/20">
                    <div className="h-full bg-success/40 w-full" />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
