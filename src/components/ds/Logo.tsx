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
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="font-semibold" style={{ fontSize: Math.round(size * 0.36) }}>
          {initialsOf(name)}
        </span>
      )}
    </span>
  )
}
