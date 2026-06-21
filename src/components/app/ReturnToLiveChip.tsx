'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLiveAudio } from '@/lib/live/LiveAudioProvider'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Logo } from '@/components/ds/Logo'
import { ChevronLeftIcon } from '@/components/ds/icons'

// "Return to live" — a floating chip shown on every page WHILE a live call is active, except the
// live page itself. Click → back to the live broadcast (the audio keeps playing the whole time).
// Disappears when the live call is closed or fully over (Global Live Call). Mirrors
// ReturnToTranscriptChip; a small live dot distinguishes it from the recorded "return to transcript".
export function ReturnToLiveChip() {
  const live = useLiveAudio()
  const pathname = usePathname()
  const { dict } = useI18n()
  if (!live.active || live.viewing) return null // not live, or already displaying it (inline swap-safe)
  const href = '/app/live/live'
  if (pathname === href) return null

  return (
    <Link
      href={href}
      className="animate-fade-up fixed inset-x-0 top-3 z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-player px-3 py-1.5 text-sm font-medium text-player-ink shadow-player transition-transform hover:-translate-y-0.5"
    >
      <ChevronLeftIcon size={16} className="rtl:rotate-180" />
      {!live.over && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-live animate-pulse-live" />}
      <Logo src={live.logoUrl} name={live.companyName} size={18} />
      <span>{dict.live.returnToLive}</span>
    </Link>
  )
}
