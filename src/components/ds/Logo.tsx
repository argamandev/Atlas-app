'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Company brand mark — a small rounded-square logo tile, treated identically
// everywhere it appears (brief §3.6.2). 8px is the single logo corner-radius source.
function initialsOf(name: string): string {
  const cleaned = name.trim()
  if (!cleaned) return '?'
  return cleaned.slice(0, 2)
}

export function Logo({
  src,
  name = '',
  size = 36,
  className,
}: {
  src?: string | null
  name?: string
  size?: number
  className?: string
}) {
  /**
   * ⚠ A FAILED IMAGE MUST BECOME THE MONOGRAM, NOT AN EMPTY TILE.
   *
   * This component already draws initials when `src` is null — which is the
   * whole point of `sync-maya-companies.ts` storing null rather than a
   * placeholder URL. But an `<img>` whose request FAILS rendered a blank
   * `bg-subtle` square instead, silently defeating that decision at the one
   * moment it matters.
   *
   * It is not hypothetical here: these come from `mayafiles.tase.co.il`, which
   * `docs/MAYA-API.md` records answering a 200 with a WAF interstitial, and the
   * only load measurement (212 images, 171 loaded) was taken from localhost —
   * never from an origin sending `Referer: https://www.timlul-ai.com`, which is
   * exactly the request a WAF treats differently. Atlas is on that host now.
   *
   * ⚠ WHY `onError` ALONE WAS NOT ENOUGH, which is the half a review round
   * caught: React attaches `img` error listeners while HYDRATING, and this
   * `<img>` is server-rendered — so an image that already failed by the time
   * hydration runs never fires the handler, and that is precisely the
   * production case above (an above-the-fold logo refused by a WAF). The
   * durable check is the DOM's own record of the outcome, `complete` with a
   * zero `naturalWidth`, read once on mount.
   *
   * FAILURE IS KEYED TO THE URL, not a boolean reset by an effect. A boolean
   * cleared in `useEffect` clears AFTER paint, so a `src` changing in place
   * showed one frame of initials over a perfectly good logo; storing WHICH src
   * failed makes the answer derived during render, so there is no frame to see.
   */
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const failed = failedSrc !== null && failedSrc === src

  useEffect(() => {
    const img = imgRef.current
    if (!src || !img) return
    if (img.complete && img.naturalWidth === 0) setFailedSrc(src)
  }, [src])

  const showImage = Boolean(src) && !failed

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-subtle text-ink-muted',
        className
      )}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        // LAZY + ASYNC because the calendar month view renders one of these per
        // event — 224 in a busy month — and they are fetched from an external
        // host. Deferring the offscreen ones keeps the burst down to what is
        // actually visible.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={src as string}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src as string)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="font-semibold" style={{ fontSize: Math.round(size * 0.36) }}>
          {initialsOf(name)}
        </span>
      )}
    </span>
  )
}
