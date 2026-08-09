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
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-subtle text-ink-muted',
        className
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        // LAZY + ASYNC because the calendar month view renders one of these per
        // event — 224 in a busy month — and they are fetched from an external
        // host (mayafiles) that `docs/MAYA-API.md` records answering a 200 with
        // a WAF interstitial under load. Deferring the offscreen ones keeps the
        // burst down to what is actually visible.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span className="font-semibold" style={{ fontSize: Math.round(size * 0.36) }}>
          {initialsOf(name)}
        </span>
      )}
    </span>
  )
}
