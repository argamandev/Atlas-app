'use client'

import Link from 'next/link'
import { Logo } from '@/components/ds/Logo'
import { ChevronRightIcon } from '@/components/ds/icons'

// Upcoming-call row, design anatomy (lines 241-254): mono date/time column leading →
// brand mark → name + sub → relative-day chip → chevron. Rows live inside the page's
// bordered paper card and separate with #EAEAEA hairlines. Staggered in via `index`.
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
  /**
   * ⚠ THIS PROP WAS ACCEPTED AND SILENTLY DISCARDED until 2026-08-09. Its doc
   * comment read "kept for call-site compatibility; the design renders
   * monograms, not logos", and Home has been passing `call.company?.logoUrl`
   * into it the whole time — so every call site LOOKED wired and nothing was.
   * That was defensible while `logo_url` was set on 3 of 234 companies; it is
   * not now that it is set on 220, and it would never have surfaced as a bug
   * because a monogram is a perfectly reasonable-looking thing to render.
   * A prop that is accepted must be used or removed — accepting and ignoring it
   * is a lie the type system endorses.
   */
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
      className="hov-fill flex animate-fade-up items-center gap-4 border-b border-[#EAEAEA] px-[18px] py-[15px] last:border-b-0"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="w-[74px] flex-none text-start" dir="ltr">
        <div className="font-mono-num text-[13px] font-medium text-[#575757]">{dateLabel}</div>
        <div className="mt-0.5 font-mono-num text-[11.5px] text-[#8A8A8A]">{timeLabel}</div>
      </div>
      {/* `Logo` renders the initials tile itself when `src` is null, so the 14
          companies MAYA serves a generic placeholder for keep the monogram this
          row has always shown — nothing regresses, the other 220 gain a face. */}
      <Logo src={logoSrc} name={name} size={40} className="rounded-[10px]" />
      <div className="min-w-0 flex-1 text-start">
        <div className="truncate text-[15px] font-semibold text-ink">
          <span dir="auto">{name}</span>
        </div>
        <div className="mt-px truncate text-[12.5px] text-[#575757]">{sub}</div>
      </div>
      <span className="flex-none whitespace-nowrap rounded-md border border-[#D5D5D5] px-[9px] py-1 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#767676]">
        {relLabel}
      </span>
      <ChevronRightIcon size={16} strokeWidth={1.7} className="flex-none text-[#BCBCBC] rtl:rotate-180" />
    </Link>
  )
}
