'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Surface } from '@/components/ds/Surface'
import { IconButton } from '@/components/ds/IconButton'
import { QuoteIcon, SparkleIcon, ShareIcon, ChevronRightIcon, CopyIcon, TrashIcon } from '@/components/ds/icons'
import { deleteQuote } from '@/lib/api/quotes'
import type { Quote } from '@/lib/api/types'

// A saved quote with its actions (brief): open in chat WITH the quote as context,
// share to WhatsApp, jump to the quote in the transcript, copy, and remove.
export function QuoteCard({
  quote,
  companyName,
  companyId,
  onRemoved,
}: {
  quote: Quote
  companyName: string
  companyId: string
  onRemoved: (id: string) => void
}) {
  const { dict } = useI18n()
  const router = useRouter()
  const [removed, setRemoved] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function flash(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 1600)
  }

  // 1) Chat — open the chat with the company tagged AND this quote AND the specific call as context.
  function openInChat() {
    const q = encodeURIComponent(quote.text)
    const tid = quote.transcriptId ? `&transcript=${encodeURIComponent(quote.transcriptId)}` : ''
    router.push(`/app/chat?company=${companyId}&quote=${q}${tid}`)
  }

  // 2) Share — WhatsApp: "SPEAKER said on the QUARTER investor call: '…'".
  function shareWhatsApp() {
    const who = quote.speaker || companyName
    const when = quote.quarter ? `the ${quote.quarter}` : 'an'
    const msg = `${who} said on ${when} investor call: "${quote.text}"`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }

  // 3) Go to quote — open the transcript at the exact moment.
  function goToQuote() {
    if (!quote.transcriptId) return
    const t = Math.max(0, Math.floor(quote.startSec ?? 0))
    const seg = quote.anchor?.segmentId ? `&seg=${encodeURIComponent(quote.anchor.segmentId)}` : ''
    router.push(`/app/live/${quote.transcriptId}?t=${t}${seg}`)
  }

  // 4) Copy a formatted quote.
  async function copy() {
    const meta = [companyName, quote.speaker, quote.quarter].filter(Boolean).join(' · ')
    const formatted = meta ? `"${quote.text}" — ${meta}` : `"${quote.text}"`
    try {
      await navigator.clipboard.writeText(formatted)
      flash(dict.common.copied)
    } catch {
      /* clipboard blocked */
    }
  }

  // 5) Remove.
  async function remove() {
    setRemoved(true)
    try {
      await deleteQuote(quote.id)
      onRemoved(quote.id)
    } catch {
      setRemoved(false)
    }
  }

  if (removed) return null

  return (
    <Surface tone="canvas" className="group relative border border-hairline p-3.5 transition-shadow hover:shadow-popover">
      {toast && (
        <span className="pointer-events-none absolute end-3 top-3 rounded-full bg-ink px-2 py-0.5 text-2xs font-medium text-white">
          {toast}
        </span>
      )}
      <div className="flex gap-2.5">
        <QuoteIcon size={16} className="mt-0.5 shrink-0 text-ink-faint" />
        <div className="min-w-0 flex-1">
          <p dir="auto" className="text-sm leading-relaxed text-ink">
            {quote.text}
          </p>
          {quote.speaker && <p className="mt-1.5 text-xs text-ink-muted">{quote.speaker}</p>}

          <div className="mt-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <IconButton label={dict.company.openInChat} size={28} onClick={openInChat}>
              <SparkleIcon size={15} />
            </IconButton>
            <IconButton label={dict.common.share} size={28} onClick={shareWhatsApp}>
              <ShareIcon size={15} />
            </IconButton>
            {quote.transcriptId && (
              <IconButton label={dict.live.goToQuote} size={28} onClick={goToQuote}>
                <ChevronRightIcon size={15} />
              </IconButton>
            )}
            <IconButton label={dict.common.copied} size={28} onClick={copy}>
              <CopyIcon size={15} />
            </IconButton>
            <IconButton label={dict.common.remove} size={28} onClick={remove}>
              <TrashIcon size={15} />
            </IconButton>
          </div>
        </div>
      </div>
    </Surface>
  )
}
