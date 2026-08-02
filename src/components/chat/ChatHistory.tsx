'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { PlusIcon, SparkleIcon } from '@/components/ds/icons'
import { fetchConversations } from '@/lib/api/conversations'
import { ErrorLine } from '@/components/projects/ErrorLine'
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
  /**
   * May reject — `ChatView.openConversation` throws when the fetch fails. Typed
   * as returning something awaitable so a failure here is SHOWN rather than
   * becoming an unhandled rejection with a row that just does nothing.
   */
  onOpen: (id: string) => void | Promise<void>
  refreshKey: number
  /** the design's chat sidebar renders its own New-chat row above this list */
  hideNewButton?: boolean
}) {
  const { dict } = useI18n()
  const [items, setItems] = useState<ConversationSummary[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)

  const open = (id: string) => {
    setOpenError(null)
    void Promise.resolve(onOpen(id)).catch((e) => setOpenError((e as Error).message))
  }

  // This used to be `.catch(() => setItems([]))`, which turned every failure of
  // GET /api/conversations into the confident empty state below — "no chats
  // yet" for a user whose chats exist and could not be fetched. It was also the
  // layer that ATE the error `conversationScope.ts` was narrowed to produce, so
  // the narrowing had nowhere to land. A failed load and an empty account are
  // different facts and now render differently.
  useEffect(() => {
    fetchConversations()
      .then((rows) => {
        setItems(rows)
        setListError(null)
      })
      .catch((e) => {
        setItems([])
        setListError((e as Error).message)
      })
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

      {/* A list that would not load and a row that will not open must both say
          so. Without these the rejections were swallowed — the click looked
          like nothing happened at all, and a 500 looked like an empty account.
          Two independent failures, so two lines, never one instead of the
          other. */}
      {(listError !== null || openError !== null) && (
        <div
          role="alert"
          dir="auto"
          className="flex flex-col gap-1 rounded-[7px] px-[9px] py-2 text-[12.5px] leading-[1.5] text-[#B0533E]"
        >
          {listError !== null && <ErrorLine template={dict.chat.historyFailed} error={listError} />}
          {openError !== null && <ErrorLine template={dict.projects.openChatFailed} error={openError} />}
        </div>
      )}

      {listError !== null ? null : items.length === 0 ? (
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
              onClick={() => open(c.id)}
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
