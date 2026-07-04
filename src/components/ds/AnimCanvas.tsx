'use client'

import { useEffect } from 'react'
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

  return <canvas {...animCanvasAttrs(props)} className={className} />
}
