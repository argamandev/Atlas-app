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
      className="group flex animate-fade-up items-center gap-[13px] border-b border-hairline px-3 py-[13px] transition-colors hover:bg-subtle/60"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <Logo src={logoSrc} name={name} size={38} className="rounded-[9px]" />
      <div className="min-w-0 flex-1 text-start">
        <div className="truncate text-[14.5px] font-semibold text-ink">
          <span dir="auto">{name}</span>
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-ink-muted">{sub}</div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="text-end">
          <div className="font-mono-num text-[13px] font-semibold text-ink" dir="ltr">
            {dateLabel}
          </div>
          <div className="font-mono-num text-[11.5px] text-ink-faint" dir="ltr">
            {timeLabel}
          </div>
        </div>
        <span className="whitespace-nowrap rounded-md bg-subtle px-[9px] py-1 text-[11.5px] text-ink-muted">
          {relLabel}
        </span>
      </div>
    </Link>
  )
}
