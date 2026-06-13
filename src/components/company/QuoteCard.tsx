'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Surface } from '@/components/ds/Surface'
import { IconButton } from '@/components/ds/IconButton'
import { QuoteIcon, SparkleIcon, CopyIcon, PencilIcon, TrashIcon } from '@/components/ds/icons'
import { updateQuote, deleteQuote } from '@/lib/api/quotes'
import type { Quote } from '@/lib/api/types'

// A saved quote with management: tap the text to copy a formatted quote, or use the
// hover actions — edit, open in chat, copy, remove.
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
  const [text, setText] = useState(quote.text)
  const [draft, setDraft] = useState(quote.text)
  const [editing, setEditing] = useState(false)
  const [removed, setRemoved] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function flash(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 1600)
  }

  async function share() {
    const meta = [companyName, quote.speaker, quote.quarter].filter(Boolean).join(' · ')
    const formatted = meta ? `"${text}" — ${meta}` : `"${text}"`
    try {
      await navigator.clipboard.writeText(formatted)
      flash(dict.common.copied)
    } catch {
      /* clipboard blocked */
    }
  }

  async function save() {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== text) {
      setText(next)
      try {
        await updateQuote(quote.id, { text: next })
      } catch {
        /* keep optimistic value */
      }
    } else {
      setDraft(text)
    }
  }

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
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              dir="auto"
              rows={3}
              className="w-full resize-none rounded-md border border-hairline bg-canvas p-2 text-sm leading-relaxed text-ink outline-none focus:border-ink-faint"
            />
          ) : (
            <p dir="auto" onClick={share} title={dict.common.copied} className="cursor-pointer text-sm leading-relaxed text-ink">
              {text}
            </p>
          )}
          {quote.speaker && !editing && <p className="mt-1.5 text-xs text-ink-muted">{quote.speaker}</p>}

          <div className="mt-2 flex items-center gap-1">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={save}
                  className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-black"
                >
                  {dict.common.save}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setDraft(text)
                  }}
                  className="rounded-md px-2.5 py-1 text-xs text-ink-muted transition-colors hover:text-ink"
                >
                  {dict.common.cancel}
                </button>
              </>
            ) : (
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <IconButton label={dict.common.edit} size={28} onClick={() => { setDraft(text); setEditing(true) }}>
                  <PencilIcon size={15} />
                </IconButton>
                <IconButton label={dict.company.openInChat} size={28} onClick={() => router.push(`/app/chat?company=${companyId}`)}>
                  <SparkleIcon size={15} />
                </IconButton>
                <IconButton label={dict.common.copied} size={28} onClick={share}>
                  <CopyIcon size={15} />
                </IconButton>
                <IconButton label={dict.common.remove} size={28} onClick={remove}>
                  <TrashIcon size={15} />
                </IconButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </Surface>
  )
}
