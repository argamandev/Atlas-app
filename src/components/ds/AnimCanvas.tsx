'use client'

import { useEffect, useRef } from 'react'
import { animCanvasAttrs, type AnimCanvasProps } from '@/lib/design/anim'

declare global {
  interface Window {
    AtlasAnim?: { scan: () => void; mount: (c: HTMLCanvasElement) => void }
  }
}

/** Thin wrapper over the design-import canvas engine (public/atlas-anim.js, loaded
 *  once in the app shell). The engine self-starts any canvas carrying its data-*
 *  contract via IntersectionObserver once scan() runs; mount() is idempotent so
 *  re-scanning after client navigation is safe. */
export function AnimCanvas({ className, ...props }: AnimCanvasProps & { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (window.AtlasAnim) {
      window.AtlasAnim.scan()
      return
    }
    // engine script may still be loading (lazyOnload) — poll briefly until it lands
    const t = setInterval(() => {
      if (window.AtlasAnim) {
        window.AtlasAnim.scan()
        clearInterval(t)
      }
    }, 200)
    return () => clearInterval(t)
  }, [])

  // The engine resizes its pixel buffer only on WINDOW resize — but our containers also
  // change size on their own (the Ask Atlas dock narrows the call frame). Without this,
  // CSS stretches the stale buffer and the countdown ring squashes into an ellipse.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let w = el.clientWidth
    let h = el.clientHeight
    const ro = new ResizeObserver(() => {
      const nw = el.clientWidth
      const nh = el.clientHeight
      if (Math.abs(nw - w) > 2 || Math.abs(nh - h) > 2) {
        w = nw
        h = nh
        window.dispatchEvent(new Event('resize')) // reuse the engine's own resize path
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return <canvas ref={ref} {...animCanvasAttrs(props)} className={className} />
}
