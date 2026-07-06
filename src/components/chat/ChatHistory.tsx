'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { PlusIcon, SparkleIcon } from '@/components/ds/icons'
import { fetchConversations } from '@/lib/api/conversations'
import type { ConversationSummary } from '@/lib/api/types'

// Lists past conversations and exposes new/open. ChatView bumps `refreshKey` after a chat is
// created/updated so the list re-fetches without a full reload.
export function ChatHistory({
  activeId,
  onNew,
  onOpen,
  refreshKey,
  hideNewButton = false,
}: {
  activeId: string | null
  onNew: () => void
  onOpen: (id: string) => void
  refreshKey: number
  /** the design's chat sidebar renders its own New-chat row above this list */
  hideNewButton?: boolean
}) {
  const { dict } = useI18n()
  const [items, setItems] = useState<ConversationSummary[]>([])

  useEffect(() => {
    fetchConversations()
      .then(setItems)
      .catch(() => setItems([]))
  }, [refreshKey])

  return (
    <div className="flex h-full flex-col gap-2">
      {!hideNewButton && (
        <button
          onClick={onNew}
          className="flex items-center gap-2 rounded-md border border-hairline px-2.5 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <PlusIcon size={15} />
          {dict.chat.newChat}
        </button>
      )}

      {items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md px-2.5 py-4 text-sm text-ink-faint">
          <SparkleIcon size={15} />
          {dict.common.empty}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {items.map((c) => (
            // per-item direction: Hebrew titles read RTL, English LTR (design's rc.dir/rc.align)
            <button
              key={c.id}
              onClick={() => onOpen(c.id)}
              dir="auto"
              className={`truncate rounded-[7px] px-[9px] py-2 text-start text-[13px] transition-colors hover:bg-subtle ${
                c.id === activeId ? 'bg-subtle text-ink' : 'text-ink-muted'
              }`}
              title={c.title}
            >
              {c.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
