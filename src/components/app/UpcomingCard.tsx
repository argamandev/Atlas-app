'use client'

import Link from 'next/link'
import { Monogram } from '@/components/ds/Monogram'
import { ChevronRightIcon } from '@/components/ds/icons'

// Upcoming-call row, design anatomy (lines 241-254): mono date/time column leading →
// monogram → name + sub → relative-day chip → chevron. Rows live inside the page's
// bordered paper card and separate with #ECE7DD hairlines. Staggered in via `index`.
export function UpcomingCard({
  href,
  name,
  sub,
  dateLabel,
  timeLabel,
  relLabel,
  index = 0,
}: {
  href: string
  /** kept for call-site compatibility; the design renders monograms, not logos */
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
      className="hov-fill flex animate-fade-up items-center gap-4 border-b border-[#ECE7DD] px-[18px] py-[15px] last:border-b-0"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="w-[74px] flex-none text-start" dir="ltr">
        <div className="font-mono-num text-[13px] font-medium text-[#6B6862]">{dateLabel}</div>
        <div className="mt-0.5 font-mono-num text-[11.5px] text-[#9A968C]">{timeLabel}</div>
      </div>
      <Monogram name={name} size={40} fontSize={17} radius={10} />
      <div className="min-w-0 flex-1 text-start">
        <div className="truncate text-[15px] font-semibold text-ink">
          <span dir="auto">{name}</span>
        </div>
        <div className="mt-px truncate text-[12.5px] text-[#6B6862]">{sub}</div>
      </div>
      <span className="flex-none whitespace-nowrap rounded-md border border-[#E0DACE] px-[9px] py-1 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#8A867C]">
        {relLabel}
      </span>
      <ChevronRightIcon size={16} strokeWidth={1.7} className="flex-none text-[#C7C2B6] rtl:rotate-180" />
    </Link>
  )
}
