'use client'

import { useEffect, useRef, useState } from 'react'
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
  // The thrown value, not its message: ErrorLine needs the status to tell an
  // expired session apart from a broken query.
  const [listError, setListError] = useState<unknown>(null)
  const [openError, setOpenError] = useState<unknown>(null)
  // Distinguishes "not fetched yet" from "fetched, and there is nothing". Without
  // it the empty state below rendered on the very first paint, so every load
  // flashed "Nothing here yet" at a user whose chats were on the way — the same
  // untrue-empty-state defect as the `.catch` this component already fixed, just
  // for a shorter moment.
  const [loading, setLoading] = useState(true)

  // Which open is the current one. The list fetch gained cancellation this
  // round and this did not, so a slow REJECTED open resolving after a newer
  // successful one painted "Could not open that chat" over a chat that was open
  // — the same stale-rejection defect, one function away.
  const openSeq = useRef(0)

  const open = (id: string) => {
    const seq = ++openSeq.current
    setOpenError(null)
    void Promise.resolve(onOpen(id)).catch((e) => {
      if (seq === openSeq.current) setOpenError(e)
    })
  }

  // This used to be `.catch(() => setItems([]))`, which turned every failure of
  // GET /api/conversations into the confident empty state below — "no chats
  // yet" for a user whose chats exist and could not be fetched. It was also the
  // layer that ATE the error `conversationScope.ts` was narrowed to produce, so
  // the narrowing had nowhere to land. A failed load and an empty account are
  // different facts and now render differently.
  useEffect(() => {
    // Cancellation, because `refreshKey` bumps after every exchange: without it
    // a slow REJECTED fetch could resolve after a newer successful one and paint
    // an error banner over a list that had loaded correctly.
    let live = true
    setLoading(true)
    fetchConversations()
      .then((rows) => {
        if (!live) return
        setItems(rows)
        setListError(null)
        // A successful reload also retires a stale "could not open that chat"
        // line — it was cleared only by another open attempt, so it stood over a
        // list that had since loaded fine. Same defect as the one fixed in
        // ProjectView.write() this round, in the mirror position.
        setOpenError(null)
      })
      .catch((e) => {
        if (!live) return
        setItems([])
        setListError(e)
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
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
          {listError !== null && (
            <ErrorLine
              template={dict.chat.historyFailed}
              error={listError}
              auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
            />
          )}
          {openError !== null && (
            <ErrorLine
              template={dict.projects.openChatFailed}
              error={openError}
              auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
            />
          )}
        </div>
      )}

      {listError !== null || loading ? null : items.length === 0 ? (
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
