'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Surface } from '@/components/ds/Surface'
import { IconButton } from '@/components/ds/IconButton'
import { QuoteIcon, SparkleIcon, ShareIcon, ChevronRightIcon, CopyIcon, TrashIcon, FolderIcon, FolderPlusIcon, CheckIcon, CloseIcon } from '@/components/ds/icons'
import { deleteQuote } from '@/lib/api/quotes'
import type { Quote } from '@/lib/api/types'

// A saved quote with its actions (brief): open in chat WITH the quote as context,
// share to WhatsApp, jump to the quote in the transcript, copy, and remove. The optional
// folder props add an "add to folder" control (used in the My Quotes tab).
export function QuoteCard({
  quote,
  companyName,
  companyId,
  onRemoved,
  folders,
  folderId,
  onAssignFolder,
  onCreateFolder,
}: {
  quote: Quote
  companyName: string
  companyId: string
  onRemoved: (id: string) => void
  folders?: { id: string; name: string }[]
  folderId?: string | null
  onAssignFolder?: (quoteId: string, folderId: string | null) => void
  onCreateFolder?: (quoteId: string, name: string) => void
}) {
  const { dict } = useI18n()
  const router = useRouter()
  const [removed, setRemoved] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [folderOpen, setFolderOpen] = useState(false)
  const [addingFolder, setAddingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const showFolders = Boolean(folders && onAssignFolder)
  const currentFolder = folders?.find((f) => f.id === folderId) ?? null

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
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {quote.speaker && <p className="text-xs text-ink-muted">{quote.speaker}</p>}
            {currentFolder && (
              <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-2xs text-ink-muted">
                <FolderIcon size={11} />
                {currentFolder.name}
              </span>
            )}
          </div>

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
            {showFolders && (
              <span className="relative">
                <IconButton label={dict.company.addToFolder} size={28} active={folderOpen} onClick={() => setFolderOpen((o) => !o)}>
                  <FolderIcon size={15} />
                </IconButton>
                {folderOpen && (
                  <Surface elevation="popover" className="absolute bottom-full end-0 z-50 mb-1 w-52 p-1 text-start">
                    <div className="px-2 py-1 text-2xs font-medium text-ink-faint">{dict.company.addToFolder}</div>
                    {folders!.map((f) => {
                      const on = f.id === folderId
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            onAssignFolder!(quote.id, on ? null : f.id)
                            setFolderOpen(false)
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-subtle"
                        >
                          <FolderIcon size={14} className="text-ink-muted" />
                          <span className="min-w-0 flex-1 truncate">{f.name}</span>
                          {on && <CheckIcon size={14} className="shrink-0 text-ink" />}
                        </button>
                      )
                    })}
                    {addingFolder ? (
                      <div className="flex items-center gap-1 px-1 py-1">
                        <input
                          autoFocus
                          dir="auto"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newFolderName.trim()) {
                              onCreateFolder?.(quote.id, newFolderName)
                              setNewFolderName('')
                              setAddingFolder(false)
                              setFolderOpen(false)
                            }
                            if (e.key === 'Escape') {
                              setNewFolderName('')
                              setAddingFolder(false)
                            }
                          }}
                          placeholder={dict.company.folderNamePlaceholder}
                          className="w-full rounded-md bg-subtle px-2 py-1 text-sm text-ink outline-none placeholder:text-ink-faint"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setNewFolderName('')
                            setAddingFolder(false)
                          }}
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint hover:text-ink"
                        >
                          <CloseIcon size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingFolder(true)}
                        className="mt-0.5 flex w-full items-center gap-2 rounded-md border-t border-hairline px-2 py-1.5 text-sm text-ink-muted hover:bg-subtle hover:text-ink"
                      >
                        <FolderPlusIcon size={14} />
                        {dict.company.newFolder}
                      </button>
                    )}
                  </Surface>
                )}
              </span>
            )}
            <IconButton label={dict.common.remove} size={28} onClick={remove}>
              <TrashIcon size={15} />
            </IconButton>
          </div>
        </div>
      </div>
    </Surface>
  )
}
