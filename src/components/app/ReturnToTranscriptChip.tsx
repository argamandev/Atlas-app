'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePlayer } from '@/lib/player/PlayerProvider'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Logo } from '@/components/ds/Logo'
import { ChevronLeftIcon } from '@/components/ds/icons'

// "Return to transcript" — a floating chip shown on every page WHILE a recorded call is
// loaded, except the transcript page itself. Click → back to that call's transcript (the
// player keeps playing the whole time). Disappears when the player is closed (Feature 4).
export function ReturnToTranscriptChip() {
  const { call, viewingIds } = usePlayer()
  const pathname = usePathname()
  const { dict } = useI18n()
  if (!call) return null
  const href = `/app/live/${call.id}`
  // Already showing those words — by URL, by the inline live→finished swap, or in a
  // workspace pane. Any of the three makes this chip an offer to go where you are.
  if (pathname === href || viewingIds.includes(call.id)) return null

  return (
    <Link
      href={href}
      className="animate-fade-up fixed inset-x-0 top-3 z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-player px-3 py-1.5 text-sm font-medium text-player-ink shadow-player transition-transform hover:-translate-y-0.5"
    >
      <ChevronLeftIcon size={16} className="rtl:rotate-180" />
      <Logo src={call.logoUrl} name={call.title} size={18} />
      <span>{dict.live.returnToTranscript}</span>
    </Link>
  )
}
