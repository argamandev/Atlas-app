'use client'

import { useEffect, useState } from 'react'

// Cycling typewriter for the chat empty state — types out each example prompt, holds,
// deletes, advances. A subtle "alive" touch under the greeting (not clickable). Honours
// reduced-motion via the global media query. RTL-safe — the text itself carries dir.
export function Typewriter({
  items,
  speed = 42,
  pause = 1800,
  className,
}: {
  items: string[]
  speed?: number
  pause?: number
  className?: string
}) {
  const [i, setI] = useState(0)
  const [txt, setTxt] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (items.length === 0) return
    const full = items[i % items.length]
    let to: ReturnType<typeof setTimeout>
    if (!deleting && txt.length < full.length) {
      to = setTimeout(() => setTxt(full.slice(0, txt.length + 1)), speed)
    } else if (!deleting && txt.length === full.length) {
      to = setTimeout(() => setDeleting(true), pause)
    } else if (deleting && txt.length > 0) {
      to = setTimeout(() => setTxt(full.slice(0, txt.length - 1)), speed / 2.2)
    } else {
      setDeleting(false)
      setI((v) => v + 1)
      return
    }
    return () => clearTimeout(to)
  }, [txt, deleting, i, items, speed, pause])

  return (
    <span dir="auto" className={className}>
      {txt}
      <span className="caret" />
    </span>
  )
}
