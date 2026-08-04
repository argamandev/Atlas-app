'use client'

import { useEffect, useRef, useState } from 'react'

// Text that arrives the way a person types it, word by word.
//
// Founder, 2026-08-04: *"the text animation should appear like chat gpt's does.
// fast and word by word."*
//
// WORD BY WORD, NOT CHARACTER BY CHARACTER, and the difference is not cosmetic:
// a character reveal in Hebrew tears words apart as they form, and with mixed
// Hebrew/Latin it re-runs the bidi algorithm on a half-written word, so the line
// visibly JUMPS as each letter lands. Revealing whole words means every frame is
// a sentence prefix that was already going to be laid out that way.
//
// The answer is complete before this component ever sees it — the model call
// already finished. This is presentation, not streaming, which is why it can be
// this simple and why it never leaves a half-sentence on screen if it is
// interrupted: the full text is in `text` the whole time.

const DEFAULT_SPEED_MS = 26

/** The character index after each word, INCLUDING its trailing whitespace, so a
 *  revealed prefix never ends mid-gap and the next word does not shift. */
function wordEnds(text: string): number[] {
  const ends: number[] = []
  const re = /\S+\s*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) ends.push(m.index + m[0].length)
  return ends
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function WordReveal({
  text,
  speedMs = DEFAULT_SPEED_MS,
  onReveal,
  className,
  dir,
}: {
  text: string
  speedMs?: number
  /** fired on each word, so a thread can hold itself scrolled to the bottom */
  onReveal?: () => void
  className?: string
  /** Normally OMITTED, so direction is inherited from the bubble around it. A
   *  second `dir="auto"` here would resolve the same way the container already
   *  did, but it makes the span its own bidi context — and .claude/rules/app.md
   *  has four filed occurrences of exactly that going wrong on a mixed line. */
  dir?: 'auto' | 'ltr' | 'rtl'
}) {
  const [chars, setChars] = useState(0)

  // A ref, not a dependency: the callers pass an inline arrow, and putting it in
  // the dep array would restart the animation from the first word on every
  // parent render.
  const reveal = useRef(onReveal)
  reveal.current = onReveal

  useEffect(() => {
    const ends = wordEnds(text)
    // Nothing to stagger, or the user has asked the OS for less motion — either
    // way the whole sentence, at once. An accessibility preference must not cost
    // the content itself.
    if (ends.length === 0 || prefersReducedMotion()) {
      setChars(text.length)
      reveal.current?.()
      return
    }

    // The first word lands immediately; waiting one tick to show anything reads
    // as lag on exactly the turn that is supposed to feel instant.
    setChars(ends[0])
    reveal.current?.()

    let i = 1
    const id = setInterval(() => {
      if (i >= ends.length) {
        clearInterval(id)
        return
      }
      setChars(ends[i])
      i += 1
      reveal.current?.()
    }, speedMs)
    return () => clearInterval(id)
  }, [text, speedMs])

  return (
    <span dir={dir} className={className}>
      {text.slice(0, chars)}
    </span>
  )
}
