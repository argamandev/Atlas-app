'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { QuoteCard } from './QuoteCard'
import { ChevronDownIcon, FolderIcon, FolderPlusIcon, CloseIcon, TrashIcon } from '@/components/ds/icons'
import { quarterSortKey } from '@/lib/utils'
import {
  createFolder as apiCreateFolder,
  deleteFolder as apiDeleteFolder,
  assignQuoteFolder as apiAssignFolder,
} from '@/lib/api/quoteFolders'
import type { Quote, QuoteFolder } from '@/lib/api/types'

function groupByQuarter(items: Quote[]): [string, Quote[]][] {
  const map = new Map<string, Quote[]>()
  for (const it of items) {
    const q = it.quarter || '—'
    const arr = map.get(q) ?? []
    arr.push(it)
    map.set(q, arr)
  }
  return Array.from(map.entries()).sort((a, b) => quarterSortKey(b[0]) - quarterSortKey(a[0]))
}

// My Quotes tab: quotes grouped by quarter (each group collapsible), plus user-named folders.
// Folders + assignments are server-backed (table quote_folders + quotes.folder_id, migration
// 20260614_010); the quote rows themselves stay owned by QuoteCard.
export function MyQuotes({
  quotes,
  companyId,
  companyName,
  onRemoved,
  initialFolders,
}: {
  quotes: Quote[]
  companyId: string
  companyName: string
  onRemoved: (id: string) => void
  initialFolders: QuoteFolder[]
}) {
  const { dict } = useI18n()

  const [folders, setFolders] = useState<QuoteFolder[]>(initialFolders)
  // local overrides of a quote's folder (so assignment reflects instantly); falls back to quote.folderId
  const [assign, setAssign] = useState<Record<string, string | null>>({})
  const [active, setActive] = useState<string>('all') // 'all' | folderId
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const folderOf = (q: Quote): string | null => (q.id in assign ? assign[q.id] : (q.folderId ?? null))

  async function createFolder(name: string): Promise<string | null> {
    const trimmed = name.trim()
    if (!trimmed) return null
    try {
      const folder = await apiCreateFolder(companyId, trimmed)
      setFolders((f) => [...f, folder])
      return folder.id
    } catch {
      return null
    }
  }
  async function deleteFolder(id: string) {
    setFolders((f) => f.filter((x) => x.id !== id))
    if (active === id) setActive('all')
    // reflect the ON DELETE SET NULL: any quote pointing here is now unfiled
    setAssign((a) => {
      const next = { ...a }
      for (const q of quotes) if (folderOf(q) === id) next[q.id] = null
      return next
    })
    try {
      await apiDeleteFolder(id)
    } catch {
      /* keep optimistic state */
    }
  }
  function assignFolder(quoteId: string, folderId: string | null) {
    setAssign((a) => ({ ...a, [quoteId]: folderId }))
    void apiAssignFolder(quoteId, folderId).catch(() => {
      /* keep optimistic state */
    })
  }
  function handleRemoved(id: string) {
    setAssign((a) => {
      const next = { ...a }
      delete next[id]
      return next
    })
    onRemoved(id)
  }
  async function createAndAssign(quoteId: string, name: string) {
    const id = await createFolder(name)
    if (id) assignFolder(quoteId, id)
  }

  const visible = active === 'all' ? quotes : quotes.filter((q) => folderOf(q) === active)
  const grouped = useMemo(() => groupByQuarter(visible), [visible])

  // design folder chips (lines 513-523): active = black pill with mono count; inactive = outlined
  const countFor = (key: string) =>
    key === 'all' ? quotes.length : quotes.filter((q) => folderOf(q) === key).length
  const chip = (key: string, label: string, on: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-[7px] rounded-pill px-[13px] py-1.5 text-sm font-medium transition-colors ${
        on ? 'bg-ink text-white' : 'border border-subtle-strong text-ink-muted hover:text-ink'
      }`}
    >
      <span dir="auto">{label}</span>
      <span className={`font-mono-num text-[11px] ${on ? 'text-white/70' : 'text-ink-faint'}`} dir="ltr">
        {countFor(key)}
      </span>
    </button>
  )

  if (quotes.length === 0) {
    return <p className="px-2.5 py-4 text-sm text-ink-faint">{dict.common.empty}</p>
  }

  return (
    <div className="animate-fade-up space-y-5">
      {/* folder bar */}
      <div className="app-scroll flex items-center gap-2 overflow-x-auto pb-1">
        {chip('all', dict.company.allQuotes, active === 'all', () => setActive('all'))}
        {folders.map((f) => (
          <span key={f.id} className="flex shrink-0 items-center">
            {chip(f.id, f.name, active === f.id, () => setActive(f.id))}
            {active === f.id && (
              <button
                type="button"
                onClick={() => void deleteFolder(f.id)}
                title={dict.company.deleteFolder}
                className="ms-1 grid h-6 w-6 place-items-center rounded-full text-ink-faint transition-colors hover:text-live"
              >
                <TrashIcon size={13} />
              </button>
            )}
          </span>
        ))}
        {creating ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-panel px-2 py-1">
            <input
              autoFocus
              dir="auto"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  const id = await createFolder(newName)
                  if (id) setActive(id)
                  setNewName('')
                  setCreating(false)
                }
                if (e.key === 'Escape') {
                  setNewName('')
                  setCreating(false)
                }
              }}
              placeholder={dict.company.folderNamePlaceholder}
              className="w-36 bg-transparent px-1.5 text-sm text-ink outline-none placeholder:text-ink-faint"
            />
            <button
              type="button"
              onClick={() => {
                setNewName('')
                setCreating(false)
              }}
              className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:text-ink"
            >
              <CloseIcon size={13} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-hairline px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
          >
            <FolderPlusIcon size={15} />
            {dict.company.newFolder}
          </button>
        )}
      </div>

      {/* quotes grouped by quarter — each group collapsible */}
      {grouped.length === 0 ? (
        <p className="px-2.5 py-6 text-sm text-ink-faint">{dict.company.emptyFolder}</p>
      ) : (
        grouped.map(([quarter, qs]) => {
          const isCollapsed = collapsed[quarter]
          return (
            // design quarter group (lines 526-535): a paper card that collapses
            <div key={quarter} className="overflow-hidden rounded-card border border-subtle-strong bg-paper">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [quarter]: !c[quarter] }))}
                className="flex w-full items-center gap-2.5 px-4 py-[13px] text-start transition-colors hover:bg-subtle/40"
              >
                <ChevronDownIcon
                  size={15}
                  className={`flex-none text-ink-faint transition-transform duration-150 ${isCollapsed ? '-rotate-90 rtl:rotate-90' : ''}`}
                />
                <span className="font-mono-num text-sm font-semibold text-ink" dir="ltr">
                  {quarter}
                </span>
                <span className="font-mono-num text-xs text-ink-faint" dir="ltr">
                  · {qs.length}
                </span>
              </button>
              {!isCollapsed && (
                <div className="flex flex-col gap-2.5 px-4 pb-4">
                  {qs.map((quote) => (
                    <QuoteCard
                      key={quote.id}
                      quote={quote}
                      companyName={companyName}
                      companyId={companyId}
                      onRemoved={handleRemoved}
                      folders={folders}
                      folderId={folderOf(quote)}
                      onAssignFolder={assignFolder}
                      onCreateFolder={(quoteId, name) => void createAndAssign(quoteId, name)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
