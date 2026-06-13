'use client'

import { useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Greeting } from '@/components/app/Greeting'
import { CollapsiblePanel } from '@/components/app/CollapsiblePanel'
import { SectionHeader } from '@/components/ds/SectionHeader'
import { ChatComposer } from './ChatComposer'
import { ChatHistory } from './ChatHistory'
import { MentionDropdown } from './MentionDropdown'
import { CitationChip } from './CitationPopover'
import { Logo } from '@/components/ds/Logo'
import { QuoteIcon, CloseIcon } from '@/components/ds/icons'
import { sendChat, type ChatSource } from '@/lib/api/chat'
import { createConversation, saveConversation, fetchConversation } from '@/lib/api/conversations'
import { companyDisplayName, type Company } from '@/lib/api/types'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  source?: ChatSource | null
}

export function ChatView({
  initialCompany,
  initialQuote,
  initialTranscript,
}: {
  initialCompany: { id: string; name: string; logoUrl: string | null } | null
  initialQuote?: string | null
  initialTranscript?: { id: string; label: string } | null
}) {
  const { dict, locale } = useI18n()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(initialCompany?.id ?? null)
  const [companyName, setCompanyName] = useState<string | null>(initialCompany?.name ?? null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [quote, setQuote] = useState<string | null>(initialQuote ?? null)
  const [transcript] = useState(initialTranscript ?? null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [historyKey, setHistoryKey] = useState(0)

  function onChange(v: string) {
    setInput(v)
    // Matches an @-mention token incl. Hebrew (any non-space, non-@ run) → "@תיגבור" tags too.
    const m = v.match(/@([^\s@]*)$/)
    setMentionQuery(m ? m[1] : null)
  }

  function onSelectMention(c: Company) {
    setCompanyId(c.id)
    setCompanyName(companyDisplayName(c, locale))
    setInput((v) => v.replace(/@([^\s@]*)$/, `@${companyDisplayName(c, locale)} `))
    setMentionQuery(null)
    inputRef.current?.focus()
  }

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    // A quote carried in from "Chat about this quote" rides along on the API message as
    // grounding context, but only the user's typed text shows in the bubble. One turn only.
    const apiMessage = quote ? `Regarding this quote from the investor call: "${quote}"\n\n${text}` : text
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setMentionQuery(null)
    setQuote(null)
    setSending(true)
    try {
      const res = await sendChat({ message: apiMessage, companyId: companyId ?? undefined, transcriptId: transcript?.id, history })
      const assistant: Msg = { role: 'assistant', content: res.reply, source: res.source }
      setMessages((prev) => [...prev, assistant])
      // Persist the full thread — create the conversation lazily on the first exchange.
      const full = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text },
        { role: assistant.role, content: assistant.content },
      ]
      let cid = conversationId
      if (!cid) {
        const conv = await createConversation({ companyId: companyId ?? null, transcriptId: transcript?.id ?? null })
        cid = conv.id
        setConversationId(cid)
      }
      await saveConversation(cid, full)
      setHistoryKey((k) => k + 1)
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: (err as Error).message }])
    } finally {
      setSending(false)
    }
  }

  async function openConversation(id: string) {
    const conv = await fetchConversation(id)
    setConversationId(conv.id)
    setMessages(conv.messages.map((m) => ({ role: m.role, content: m.content })))
  }

  function newChat() {
    setConversationId(null)
    setMessages([])
    setInput('')
    setQuote(null)
  }

  const empty = messages.length === 0

  // Composer block — shared between the empty (centered) and active (pinned-bottom) states.
  const composer = (
    <div className="relative mx-auto w-full max-w-2xl">
      {(companyName || quote || transcript) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {companyName && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-xs text-ink-muted">
              {initialCompany?.logoUrl && <Logo src={initialCompany.logoUrl} name={companyName} size={16} />}
              <span className="font-medium text-ink">@{companyName}</span>
            </span>
          )}
          {transcript && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-xs text-ink-muted">
              <span className="font-medium text-ink">{transcript.label}</span>
            </span>
          )}
          {quote && (
            <span dir="auto" className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-xs text-ink-muted">
              <QuoteIcon size={12} className="shrink-0" />
              <span className="truncate text-ink">
                {dict.chat.referringTo}: “{quote}”
              </span>
              <button
                type="button"
                onClick={() => setQuote(null)}
                aria-label={dict.common.close}
                className="shrink-0 text-ink-faint transition-colors hover:text-ink"
              >
                <CloseIcon size={12} />
              </button>
            </span>
          )}
        </div>
      )}
      {mentionQuery !== null && (
        <MentionDropdown query={mentionQuery} onSelect={onSelectMention} onClose={() => setMentionQuery(null)} />
      )}
      <ChatComposer
        inputRef={inputRef}
        value={input}
        onChange={onChange}
        onSend={send}
        onAt={() => {
          setInput((v) => (v.endsWith('@') || v === '' ? v + '@' : v + ' @'))
          setMentionQuery('')
          inputRef.current?.focus()
        }}
      />
      <p className="mt-2 px-1 text-center text-2xs text-ink-faint">{dict.chat.slashHint}</p>
    </div>
  )

  // Empty: greeting + composer centered. Active: messages scroll, composer drops to the bottom.
  const content = empty ? (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-[8vh]">
        <div className="w-full max-w-2xl">
          <div className="mb-6 text-center">
            <Greeting className="text-[28px] font-bold tracking-tight text-ink" />
            <p className="mt-1.5 text-ink-muted">{dict.chat.subhead}</p>
          </div>
          {composer}
        </div>
      </div>
    </div>
  ) : (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <div className="app-scroll flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-2xl space-y-5">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              // dir="auto" lets a Hebrew message read RTL even in English mode; ml-auto keeps
              // the user's own bubble on the trailing (right) edge in both directions.
              <div key={i} className="flex">
                <div dir="auto" className="ml-auto max-w-[85%] rounded-bubble bg-subtle px-3.5 py-2 text-[15px] text-ink">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="text-[15px] leading-relaxed text-ink">
                <p dir="auto" className="whitespace-pre-wrap">
                  {m.content}
                </p>
                {m.source && <CitationChip source={m.source} />}
              </div>
            ),
          )}
          {sending && <p className="text-sm text-ink-faint">{dict.chat.thinking}</p>}
        </div>
      </div>
      <div className="px-6 pb-5">{composer}</div>
    </div>
  )

  return (
    <CollapsiblePanel
      title={dict.chat.chats}
      panel={
        <div className="flex h-full flex-col gap-4">
          <ChatHistory activeId={conversationId} onNew={newChat} onOpen={openConversation} refreshKey={historyKey} />
          <div className="mt-auto space-y-4">
            <div>
              <SectionHeader label={dict.chat.myAgents} className="mb-1" />
              <p className="px-2.5 text-xs text-ink-faint">{dict.chat.agentsComingSoon}</p>
            </div>
            <div>
              <SectionHeader label={dict.chat.mySkills} className="mb-1" />
              <p className="px-2.5 text-xs text-ink-faint">{dict.common.comingSoon}</p>
            </div>
          </div>
        </div>
      }
    >
      {content}
    </CollapsiblePanel>
  )
}
