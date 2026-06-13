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
}: {
  activeId: string | null
  onNew: () => void
  onOpen: (id: string) => void
  refreshKey: number
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
      <button
        onClick={onNew}
        className="flex items-center gap-2 rounded-md border border-hairline px-2.5 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <PlusIcon size={15} />
        {dict.chat.newChat}
      </button>

      {items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md px-2.5 py-4 text-sm text-ink-faint">
          <SparkleIcon size={15} />
          {dict.common.empty}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpen(c.id)}
              className={`truncate rounded-md px-2.5 py-1.5 text-start text-sm transition-colors hover:bg-subtle ${
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
