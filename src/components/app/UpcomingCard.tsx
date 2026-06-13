'use client'

import Link from 'next/link'
import { Logo } from '@/components/ds/Logo'

// Elevated upcoming-call row (V1 design pass): logo → name + sub on the leading edge,
// date/time on the trailing edge, a soft "starts in" pill, and a lift-on-hover. Staggered
// in via `index` so the list reveals top-to-bottom. Logical properties keep it RTL-correct.
export function UpcomingCard({
  href,
  logoSrc,
  name,
  sub,
  dateLabel,
  timeLabel,
  relLabel,
  index = 0,
}: {
  href: string
  logoSrc?: string | null
  name: string
  sub: string
  dateLabel: string
  timeLabel: string
  relLabel: string
  index?: number
}) {
  return (
    <Link
      href={href}
      className="group flex animate-fade-up items-center gap-3 rounded-card bg-canvas px-3 py-2.5 transition-all duration-200 hover:-translate-y-px hover:shadow-float"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <Logo src={logoSrc} name={name} size={34} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">{name}</div>
        <div className="mt-0.5 truncate text-xs text-ink-faint">{sub}</div>
      </div>
      <div className="shrink-0 text-end">
        <div className="text-sm font-semibold text-ink tabular-nums">{dateLabel}</div>
        <div className="text-2xs text-ink-faint" dir="ltr">
          {timeLabel}
        </div>
      </div>
      <span className="shrink-0 whitespace-nowrap rounded-full bg-subtle px-2.5 py-1 text-2xs text-ink-muted">
        {relLabel}
      </span>
    </Link>
  )
}
