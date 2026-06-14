'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { streamChat, type ChatSource } from '@/lib/api/chat'
import { CitationChip } from '@/components/chat/CitationPopover'
import { ChatComposer } from '@/components/chat/ChatComposer'
import { ThinkingDots } from '@/components/chat/ThinkingDots'
import { Markdown } from '@/components/chat/Markdown'
import { SparkleIcon, CloseIcon, QuoteIcon } from '@/components/ds/icons'

// In-transcript side chat (Feature 6, refined). Opens beside the transcript; the transcript
// stays visible and the global audio keeps playing. While it's open, highlighting transcript
// text auto-populates a *reference block above the composer* (Claude-style) — the user just
// types their question. On send, the reference becomes part of that message (shown in its
// bubble), so a new highlight never clobbers earlier context; history reads top-to-bottom.
interface Msg {
  role: 'user' | 'assistant'
  content: string
  reference?: string
  source?: ChatSource | null
  streaming?: boolean
}

export function TranscriptChatPanel({
  companyId,
  transcriptId,
  quote,
  seedNonce,
  onClose,
}: {
  companyId: string | null
  transcriptId: string | undefined
  quote: string
  /** bumps every time a fresh selection is referenced (star or, while open, any highlight) */
  seedNonce: number
  onClose: () => void
}) {
  const { dict } = useI18n()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [ref, setRef] = useState<string>(quote) // the pending reference shown above the composer
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // a fresh selection (star, or any highlight while open) → set it as the pending reference
  useEffect(() => {
    if (quote) setRef(quote)
    inputRef.current?.focus()
  }, [seedNonce, quote])

  const scrollToEnd = () => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }
  useEffect(scrollToEnd, [messages.length])

  async function send(explicit?: string) {
    const text = (explicit ?? input).trim()
    if (!text || sending) return
    const usedRef = ref.trim()
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    const apiMessage = usedRef ? `Regarding this quote from the investor call: "${usedRef}"\n\n${text}` : text
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, reference: usedRef || undefined },
      { role: 'assistant', content: '', streaming: true },
    ])
    setInput('')
    setRef('')
    setSending(true)

    const setLast = (patch: Partial<Msg>) =>
      setMessages((prev) => {
        const cp = prev.slice()
        const last = cp[cp.length - 1]
        if (last && last.role === 'assistant') cp[cp.length - 1] = { ...last, ...patch }
        return cp
      })

    let full = ''
    try {
      const { source } = await streamChat(
        { message: apiMessage, companyId: companyId ?? undefined, transcriptId, history },
        (delta) => {
          full += delta
          setLast({ content: full })
          scrollToEnd()
        },
      )
      setLast({ content: full, source, streaming: false })
    } catch (err) {
      setLast({ content: (err as Error).message, streaming: false })
    } finally {
      setSending(false)
    }
  }

  return (
    <aside className="hidden w-[380px] shrink-0 flex-col border-s border-hairline bg-panel lg:flex">
      <header className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <span className="flex items-center gap-2 font-bold text-ink">
          <SparkleIcon size={16} />
          {dict.chat.title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={dict.common.close}
          className="grid h-7 w-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
        >
          <CloseIcon size={16} />
        </button>
      </header>

      <div ref={scrollRef} className="app-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="px-1 text-sm leading-relaxed text-ink-faint">{dict.live.askAboutQuoteHint}</p>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex animate-fade-up flex-col items-end gap-1">
              {m.reference && (
                <div dir="auto" className="max-w-[92%] rounded-card bg-canvas px-3 py-2 shadow-card">
                  <div className="mb-0.5 flex items-center gap-1 text-2xs font-medium text-ink-faint">
                    <QuoteIcon size={11} />
                    {dict.chat.referringTo}
                  </div>
                  <p className="line-clamp-3 text-xs leading-relaxed text-ink-muted">“{m.reference}”</p>
                </div>
              )}
              <div dir="auto" className="max-w-[92%] rounded-bubble bg-subtle px-3.5 py-2 text-sm leading-relaxed text-ink">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="animate-fade-in text-sm leading-relaxed text-ink">
              {m.streaming && !m.content ? (
                <ThinkingDots />
              ) : m.streaming ? (
                <p dir="auto" className="whitespace-pre-wrap">
                  {m.content}
                  <span className="caret" />
                </p>
              ) : (
                <Markdown content={m.content} />
              )}
              {m.source && !m.streaming && <CitationChip source={m.source} />}
            </div>
          ),
        )}
      </div>

      <div className="border-t border-hairline p-3">
        {/* the pending reference now lives INSIDE the composer as its warm header (unified box) */}
        <ChatComposer
          inputRef={inputRef}
          value={input}
          onChange={setInput}
          onSend={send}
          onAt={() => {}}
          reference={ref || null}
          onRemoveReference={() => setRef('')}
        />
      </div>
    </aside>
  )
}
