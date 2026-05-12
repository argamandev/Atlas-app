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

const STEP_DEFINITIONS = [
  { label: 'מחלץ אודיו', sublabel: 'מוריד ומחלץ את האודיו מ-YouTube', duration: 1800 },
  { label: 'מכין מנוע תמלול', sublabel: 'טוען מודל שפה ומנוע זיהוי דוברים', duration: 2000 },
  { label: 'יוצר תמלול מקצועי', sublabel: 'מתמלל, מפריד דוברים ומסנן רעש', duration: 2500 },
  { label: 'מסיים עיבוד', sublabel: 'מסמן זמנים ומייצר פלט מוסדי', duration: 1200 },
]

interface UseProcessingTimerProps {
  id: string
}

export function useProcessingTimer({ id }: UseProcessingTimerProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [steps, setSteps] = useState<ProcessingStep[]>(
    STEP_DEFINITIONS.map((s, i) => ({
      label: s.label,
      sublabel: s.sublabel,
      status: i === 0 ? 'active' : 'pending',
      progress: 0,
    }))
  )
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let step = 0

    function runStep(stepIndex: number) {
      if (stepIndex >= STEP_DEFINITIONS.length) {
        // All done — redirect
        setTimeout(() => {
          router.push(`/transcript/${id}`)
        }, 400)
        return
      }

      const { duration } = STEP_DEFINITIONS[stepIndex]
      const startTime = Date.now()

      // Mark step as active
      setCurrentStep(stepIndex)
      setSteps(prev => prev.map((s, i) => ({
        ...s,
        status: i < stepIndex ? 'complete' : i === stepIndex ? 'active' : 'pending',
        progress: i < stepIndex ? 100 : 0,
      })))

      // Animate progress for current step
      progressRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        const pct = Math.min((elapsed / duration) * 100, 99)
        setSteps(prev => prev.map((s, i) =>
          i === stepIndex ? { ...s, progress: pct } : s
        ))
        setProgress(((stepIndex + pct / 100) / STEP_DEFINITIONS.length) * 100)
      }, 30)

      timerRef.current = setTimeout(() => {
        if (progressRef.current) clearInterval(progressRef.current)
        // Complete this step
        setSteps(prev => prev.map((s, i) =>
          i === stepIndex ? { ...s, status: 'complete', progress: 100 } : s
        ))
        step = stepIndex + 1
        runStep(step)
      }, duration)
    }

    runStep(0)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (progressRef.current) clearInterval(progressRef.current)
    }
  }, [id, router])

  const totalProgress = (steps.filter(s => s.status === 'complete').length / STEP_DEFINITIONS.length) * 100

  return { steps, currentStep, totalProgress }
}
