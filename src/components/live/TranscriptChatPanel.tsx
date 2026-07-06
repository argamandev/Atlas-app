'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { streamChat, type ChatSource } from '@/lib/api/chat'
import { CitationChip } from '@/components/chat/CitationPopover'
import { ThinkingDots } from '@/components/chat/ThinkingDots'
import { Markdown } from '@/components/chat/Markdown'
import { SparkleIcon, CloseIcon, QuoteIcon, ArrowUpIcon } from '@/components/ds/icons'
import { detectDir } from '@/lib/utils'

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
  liveContext,
  quote,
  seedNonce,
  onClose,
}: {
  companyId: string | null
  transcriptId: string | undefined
  /** LIVE view only: the on-screen captions, sent as grounding context instead of a DB lookup */
  liveContext?: string
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
        { message: apiMessage, companyId: companyId ?? undefined, transcriptId, liveContext, history },
        (delta) => {
          full += delta
          setLast({ content: full })
          scrollToEnd()
        }
      )
      setLast({ content: full, source, streaming: false })
    } catch (err) {
      setLast({ content: (err as Error).message, streaming: false })
    } finally {
      setSending(false)
    }
  }

  return (
    // in-call chat dock (design lines 538-570): call-themed, 380px, slides in from the end
    <aside
      className="aa-panel call-hair hidden w-[380px] shrink-0 flex-col border-s lg:flex"
      style={{ boxShadow: '-24px 0 60px -40px rgba(30,24,14,.35)' }}
    >
      <header className="call-hair flex h-[63px] flex-none items-center justify-between gap-2 border-b pe-3.5 ps-5">
        <span className="call-ink flex items-center gap-[9px] text-[15px] font-semibold tracking-[-0.01em]">
          <SparkleIcon size={22} />
          {dict.live.askAtlas}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={dict.common.close}
          className="call-muted grid h-8 w-8 place-items-center rounded-lg transition-colors hover:call-ink"
        >
          <CloseIcon size={17} />
        </button>
      </header>

      <div ref={scrollRef} className="atscroll flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          // serif hero (design lines 547-554): staggered word entrance
          <div className="flex h-full flex-col items-center justify-center px-5 pb-2.5 text-center">
            <h1 className="call-ink max-w-[15ch] font-display text-[29px] font-medium leading-[1.16] tracking-[-0.012em]">
              <span className="aa-w" style={{ animationDelay: '.06s' }}>
                {dict.live.askHeroLine1}
              </span>{' '}
              <span className="aa-w block" style={{ animationDelay: '.24s' }}>
                {dict.live.askHeroLine2}
              </span>
            </h1>
            <p
              className="aa-w call-muted mt-3.5 max-w-[28ch] text-[13px] leading-[1.55]"
              style={{ animationDelay: '.4s' }}
            >
              {dict.live.askHeroSub}
            </p>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex animate-fade-up flex-col items-end gap-1">
              {m.reference && (
                // Flat reference attachment, call-themed (flips with Dark/Light).
                <div
                  dir={detectDir(m.reference)}
                  className="call-hair call-panel-bg max-w-[92%] rounded-[8px] border px-3 py-2"
                >
                  <div className="call-faint mb-1 flex items-center gap-1.5 text-2xs font-medium">
                    <QuoteIcon size={11} />
                    {dict.chat.referringTo}
                  </div>
                  <p className="call-muted line-clamp-3 text-xs leading-relaxed">{m.reference}</p>
                </div>
              )}
              <div
                dir="auto"
                className="call-raised-bg call-ink max-w-[92%] rounded-[14px] rounded-ee-[4px] px-3.5 py-2 text-sm leading-relaxed"
              >
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="call-ink animate-fade-in text-sm leading-relaxed">
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
          )
        )}
      </div>

      {/* in-call composer (design lines 555-570): reference chip above a call-chip field */}
      <div className="flex-none px-4 pb-4 pt-3.5">
        {ref && (
          <div className="call-hair mb-2.5 flex items-start gap-2 rounded-[14px] border px-[11px] py-[9px]">
            <span className="call-muted mt-0.5 flex-none">
              <QuoteIcon size={12} />
            </span>
            <div
              dir={detectDir(ref)}
              className="call-ink line-clamp-3 min-w-0 flex-1 text-[12.5px] leading-[1.55]"
            >
              {ref}
            </div>
            <button
              type="button"
              onClick={() => setRef('')}
              title={dict.common.remove}
              className="call-muted mt-0.5 flex flex-none transition-colors hover:call-ink"
            >
              <CloseIcon size={14} strokeWidth={1.7} />
            </button>
          </div>
        )}
        <div className="call-hair call-panel-bg flex items-end gap-2 rounded-[16px] border py-3 pe-3 ps-4">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            rows={1}
            placeholder={dict.chat.askAnything}
            dir="auto"
            className="call-ink max-h-[120px] min-w-0 flex-1 resize-none bg-transparent pb-[3px] pt-[2px] text-[15px] leading-[1.45] outline-none"
          />
          <button
            type="button"
            aria-label={dict.common.save}
            onClick={() => void send()}
            disabled={sending || !input.trim()}
            className="call-send-btn grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] transition-opacity disabled:opacity-40"
          >
            <ArrowUpIcon size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    </aside>
  )
}
