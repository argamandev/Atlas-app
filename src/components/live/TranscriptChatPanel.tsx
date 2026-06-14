'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { streamChat, type ChatSource } from '@/lib/api/chat'
import { CitationChip } from '@/components/chat/CitationPopover'
import { ChatComposer } from '@/components/chat/ChatComposer'
import { ThinkingDots } from '@/components/chat/ThinkingDots'
import { SparkleIcon, CloseIcon, QuoteIcon } from '@/components/ds/icons'

// In-transcript side chat (Feature 6). Opens beside the transcript when the user stars a
// selection; the transcript stays visible and the (global) audio keeps playing. Seeded with
// the selected quote + the call's company/transcript so the user can ask about that excerpt.
interface Msg {
  role: 'user' | 'assistant'
  content: string
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
  /** bumps every time a new selection is starred, so the seed re-applies */
  seedNonce: number
  onClose: () => void
}) {
  const { dict } = useI18n()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [activeQuote, setActiveQuote] = useState<string>(quote)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // re-seed the grounding quote whenever a fresh selection is starred
  useEffect(() => {
    setActiveQuote(quote)
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
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    const apiMessage = activeQuote
      ? `Regarding this quote from the investor call: "${activeQuote}"\n\n${text}`
      : text
    setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '', streaming: true }])
    setInput('')
    setActiveQuote('')
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
        {/* the seeded quote context */}
        {activeQuote && (
          <div className="animate-fade-up rounded-card bg-canvas p-3 shadow-card">
            <div className="mb-1 flex items-center gap-1.5 text-2xs font-medium text-ink-faint">
              <QuoteIcon size={12} />
              {dict.chat.referringTo}
            </div>
            <p dir="auto" className="text-sm leading-relaxed text-ink">
              “{activeQuote}”
            </p>
          </div>
        )}
        {messages.length === 0 && (
          <p className="px-1 text-sm leading-relaxed text-ink-faint">{dict.live.askAboutQuoteHint}</p>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex animate-fade-up">
              <div dir="auto" className="ml-auto max-w-[90%] rounded-bubble bg-subtle px-3.5 py-2 text-sm leading-relaxed text-ink">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="animate-fade-in text-sm leading-relaxed text-ink">
              {m.streaming && !m.content ? (
                <ThinkingDots />
              ) : (
                <p dir="auto" className="whitespace-pre-wrap">
                  {m.content}
                  {m.streaming && <span className="caret" />}
                </p>
              )}
              {m.source && !m.streaming && <CitationChip source={m.source} />}
            </div>
          ),
        )}
      </div>

      <div className="border-t border-hairline p-3">
        <ChatComposer inputRef={inputRef} value={input} onChange={setInput} onSend={send} onAt={() => {}} />
      </div>
    </aside>
  )
}
