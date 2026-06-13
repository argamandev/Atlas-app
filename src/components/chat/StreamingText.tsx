'use client'

import { useEffect, useRef, useState } from 'react'

// Reveals an already-received reply progressively, with a blinking caret — the "streaming"
// feel of a live model without changing the (single-shot) Gemini call. Reveal speed scales
// with length so any answer finishes in ~1.2–2.6s. Calls onTick so the view can stay pinned
// to the bottom, and onDone when fully shown so the parent can drop the caret.
export function StreamingText({
  text,
  onDone,
  onTick,
  className,
}: {
  text: string
  onDone?: () => void
  onTick?: () => void
  className?: string
}) {
  const [count, setCount] = useState(0)
  const doneRef = useRef(false)
  // chars revealed per ~16ms frame — ~120 frames total regardless of answer length
  const step = Math.max(1, Math.ceil(text.length / 120))

  useEffect(() => {
    if (count >= text.length) {
      if (!doneRef.current) {
        doneRef.current = true
        onDone?.()
      }
      return
    }
    const id = setTimeout(() => {
      setCount((c) => Math.min(text.length, c + step))
      onTick?.()
    }, 16)
    return () => clearTimeout(id)
  }, [count, text, step, onDone, onTick])

  const revealing = count < text.length
  return (
    <p dir="auto" className={className}>
      {text.slice(0, count)}
      {revealing && <span className="caret" />}
    </p>
  )
}
