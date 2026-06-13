'use client'

import { useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Greeting } from '@/components/app/Greeting'
import { ChatComposer } from './ChatComposer'
import { MentionDropdown } from './MentionDropdown'
import { CitationChip } from './CitationPopover'
import { Logo } from '@/components/ds/Logo'
import { sendChat, type ChatSource } from '@/lib/api/chat'
import { companyDisplayName, type Company } from '@/lib/api/types'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  source?: ChatSource | null
}

export function ChatView({
  initialCompany,
}: {
  initialCompany: { id: string; name: string; logoUrl: string | null } | null
}) {
  const { dict, locale } = useI18n()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(initialCompany?.id ?? null)
  const [companyName, setCompanyName] = useState<string | null>(initialCompany?.name ?? null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)

  function onChange(v: string) {
    setInput(v)
    const m = v.match(/@(\w*)$/)
    setMentionQuery(m ? m[1] : null)
  }

  function onSelectMention(c: Company) {
    setCompanyId(c.id)
    setCompanyName(companyDisplayName(c, locale))
    setInput((v) => v.replace(/@(\w*)$/, `@${companyDisplayName(c, locale)} `))
    setMentionQuery(null)
    inputRef.current?.focus()
  }

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setMentionQuery(null)
    setSending(true)
    try {
      const res = await sendChat({ message: text, companyId: companyId ?? undefined, history })
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply, source: res.source }])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: (err as Error).message }])
    } finally {
      setSending(false)
    }
  }

  const empty = messages.length === 0

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <div className="app-scroll flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-2xl">
          {empty ? (
            <div className="flex flex-col items-center gap-2 pt-[14vh] text-center">
              <Greeting className="text-2xl font-bold text-ink" />
              <p className="text-ink-muted">{dict.chat.subhead}</p>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[80%] rounded-bubble bg-subtle px-3.5 py-2 text-[15px] text-ink">{m.content}</div>
                  </div>
                ) : (
                  <div key={i} className="text-[15px] leading-relaxed text-ink">
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.source && <CitationChip source={m.source} />}
                  </div>
                ),
              )}
              {sending && <p className="text-sm text-ink-faint">{dict.chat.thinking}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="px-6 pb-5">
        <div className="relative mx-auto w-full max-w-2xl">
          {companyName && (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-xs text-ink-muted">
              {initialCompany?.logoUrl && <Logo src={initialCompany.logoUrl} name={companyName} size={16} />}
              <span className="font-medium text-ink">@{companyName}</span>
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
      </div>
    </div>
  )
}
