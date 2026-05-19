'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export type StepStatus = 'pending' | 'active' | 'complete'

export interface ProcessingStep {
  label: string
  sublabel: string
  status: StepStatus
  progress: number
}

const STEPS = [
  { label: 'מוריד את האודיו', sublabel: 'מוריד ומחלץ את האודיו מ-YouTube' },
  { label: 'מתמלל ומזהה דוברים', sublabel: 'מתמלל את השיחה ומזהה את הדוברים' },
  { label: 'עורך ומסיים', sublabel: 'מתקן שגיאות, מסמן דוברים ומייצר תמלול סופי' },
]

// Maps DB processing_step → UI step index
function dbStepToIndex(step: string): number {
  if (step === 'downloading') return 0
  if (step === 'transcribing') return 1
  if (step === 'formatting') return 2
  if (step === 'completed') return 3
  return 0
}

interface UseProcessingTimerProps {
  id: string
}

export function useProcessingTimer({ id }: UseProcessingTimerProps) {
  const router = useRouter()
  const [steps, setSteps] = useState<ProcessingStep[]>(
    STEPS.map((s, i) => ({
      ...s,
      status: i === 0 ? 'active' : 'pending',
      progress: 0,
    }))
  )
  const [totalProgress, setTotalProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const currentRealStep = useRef(-1)
  const progressAnim = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollStartTime = useRef(Date.now())

  function animateStep(stepIndex: number, targetPct: number) {
    if (progressAnim.current) clearInterval(progressAnim.current)

    progressAnim.current = setInterval(() => {
      setSteps(prev => {
        const current = prev[stepIndex]?.progress ?? 0
        if (current >= targetPct) {
          clearInterval(progressAnim.current!)
          return prev
        }
        const next = Math.min(current + 0.5, targetPct)
        const updated = prev.map((s, i) =>
          i === stepIndex ? { ...s, progress: next } : s
        )
        const completed = updated.filter(s => s.status === 'complete').length
        const activeProgress = next / 100
        setTotalProgress(((completed + activeProgress) / STEPS.length) * 100)
        return updated
      })
    }, 40)
  }

  function advanceTo(realStep: number) {
    if (realStep <= currentRealStep.current && realStep < STEPS.length) return
    currentRealStep.current = realStep

    if (realStep >= STEPS.length) return // will redirect

    setSteps(prev =>
      prev.map((s, i) => ({
        ...s,
        status: i < realStep ? 'complete' : i === realStep ? 'active' : 'pending',
        progress: i < realStep ? 100 : i === realStep ? 0 : 0,
      }))
    )
    animateStep(realStep, 90)
  }

  useEffect(() => {
    advanceTo(0)

    async function poll() {
      try {
        const res = await fetch(`/api/transcripts/${id}?_t=${Date.now()}`, { cache: 'no-store' })
        if (res.status === 404) {
          // Row not yet visible — keep retrying silently
          pollTimer.current = setTimeout(poll, 3000)
          return
        }
        if (!res.ok) {
          pollTimer.current = setTimeout(poll, 3000)
          return
        }
        const data = await res.json()

        if (data.status === 'failed') {
          setError(data.error_message ?? 'שגיאה בעיבוד')
          return
        }

        if (data.status === 'completed' || data.formatted_data != null) {
          if (progressAnim.current) clearInterval(progressAnim.current)
          setSteps(prev => prev.map(s => ({ ...s, status: 'complete', progress: 100 })))
          setTotalProgress(100)
          setTimeout(() => router.push(`/transcript/${id}`), 600)
          return
        }

        // Stuck for >10 min — the server process was likely killed by a redeploy
        if (Date.now() - pollStartTime.current > 10 * 60 * 1000) {
          setError('העיבוד ארך זמן רב. ייתכן שהשרת עדכן. נסה שוב.')
          return
        }

        const realStep = dbStepToIndex(data.processing_step ?? 'downloading')
        advanceTo(realStep)

        pollTimer.current = setTimeout(poll, 3000)
      } catch {
        pollTimer.current = setTimeout(poll, 3000)
      }
    }

    poll()

    return () => {
      if (progressAnim.current) clearInterval(progressAnim.current)
      if (pollTimer.current) clearTimeout(pollTimer.current)
      currentRealStep.current = -1
      pollStartTime.current = Date.now()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return { steps, totalProgress, error }
}
