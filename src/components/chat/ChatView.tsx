'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Greeting } from '@/components/app/Greeting'
import { CollapsiblePanel } from '@/components/app/CollapsiblePanel'
import { ChatComposer } from './ChatComposer'
import { ChatHistory } from './ChatHistory'
import { MentionDropdown } from './MentionDropdown'
import { CitationChip } from './CitationPopover'
import { ThinkingDots } from './ThinkingDots'
import { Markdown } from './Markdown'
import { Logo } from '@/components/ds/Logo'
import { PencilIcon, ProjectsIcon, WorkspacesIcon, AgentsIcon } from '@/components/ds/icons'
import { streamChat, type ChatSource, type ProjectContextStatus } from '@/lib/api/chat'
import { createConversation, saveConversation, fetchConversation } from '@/lib/api/conversations'
import { companyDisplayName, type Company } from '@/lib/api/types'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  source?: ChatSource | null
  /** true while tokens are still streaming in from the model (caret shown) */
  streaming?: boolean
  /**
   * Set when this answer did NOT get the project's context whole. It is carried
   * per-message rather than per-view because it is a fact about THIS reply —
   * the next one may load fine, and the notice must not follow it.
   */
  projectContext?: ProjectContextStatus | null
}

export function ChatView({
  initialCompany,
  initialQuote,
  initialTranscript,
  mainView,
  renderMain,
  projectId,
}: {
  initialCompany: { id: string; name: string; logoUrl: string | null } | null
  initialQuote?: string | null
  initialTranscript?: { id: string; label: string } | null
  /**
   * Renders in place of the chat transcript, keeping the secondary panel intact.
   * Used by the Projects routes (/app/chat/projects…), which the design draws
   * inside this same surface. Conversation state below is untouched by it.
   */
  mainView?: React.ReactNode
  /**
   * Same slot, but handed the chat's own `send` so the embedded surface can
   * drive it. This is how a project's composer reaches the real chat engine —
   * streaming, persistence, citations and history all stay here rather than
   * being reimplemented inside the project page.
   */
  renderMain?: (api: {
    send: (text: string) => void
    sending: boolean
    /**
     * Loads a past conversation into this view. Rejects if the fetch fails, so
     * the embedded surface can SHOW that rather than swallow it.
     */
    open: (id: string) => Promise<void>
  }) => React.ReactNode
  /**
   * When set, every message in this view belongs to that project: the project's
   * context is injected server-side, and the conversation row is stamped with
   * project_id so it lists under that project instead of the global recents.
   */
  projectId?: string
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
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollToEnd = () => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }
  // keep pinned to the newest message as the thread grows
  useEffect(() => {
    scrollToEnd()
  }, [messages.length, sending])

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

  async function send(explicit?: string) {
    const text = (explicit ?? input).trim()
    if (!text || sending) return
    const priorMessages = messages
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    // A quote carried in from "Chat about this quote" rides along on the API message as
    // grounding context, but only the user's typed text shows in the bubble. One turn only.
    const apiMessage = quote ? `Regarding this quote from the investor call: "${quote}"\n\n${text}` : text
    // Push the user message + an empty assistant message we stream tokens into.
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '', streaming: true },
    ])
    setInput('')
    setMentionQuery(null)
    setQuote(null)
    setSending(true)

    const setLastAssistant = (patch: Partial<Msg>) =>
      setMessages((prev) => {
        const cp = prev.slice()
        const last = cp[cp.length - 1]
        if (last && last.role === 'assistant') cp[cp.length - 1] = { ...last, ...patch }
        return cp
      })

    let full = ''
    try {
      const { source, projectContext } = await streamChat(
        {
          message: apiMessage,
          companyId: companyId ?? undefined,
          transcriptId: transcript?.id,
          projectId,
          history,
        },
        (delta) => {
          full += delta
          setLastAssistant({ content: full })
          scrollToEnd()
        }
      )
      setLastAssistant({ content: full, source, projectContext, streaming: false })

      // Persist the full thread — create the conversation lazily on the first exchange.
      const fullThread = [
        ...priorMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text },
        { role: 'assistant' as const, content: full },
      ]
      let cid = conversationId
      if (!cid) {
        const conv = await createConversation({
          companyId: companyId ?? null,
          transcriptId: transcript?.id ?? null,
          projectId: projectId ?? null,
        })
        cid = conv.id
        setConversationId(cid)
      }
      await saveConversation(cid, fullThread)
      setHistoryKey((k) => k + 1)
    } catch (err) {
      setLastAssistant({ content: (err as Error).message, streaming: false })
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
      {/* context tags (company / transcript). The quoted excerpt now lives inside the
          composer as its warm reference header (unified two-toned box). */}
      {(companyName || transcript) && (
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
        </div>
      )}
      {mentionQuery !== null && (
        <MentionDropdown
          query={mentionQuery}
          onSelect={onSelectMention}
          onClose={() => setMentionQuery(null)}
        />
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
        reference={quote}
        onRemoveReference={() => setQuote(null)}
        variant={empty ? 'tall' : 'pill'}
      />
      {/* The hint teaches / and @ on the opening screen. Once the thread is
          running the pill drops it, per the founder's 2026-08-01 design. */}
      {empty && <p className="mt-2 px-1 text-center text-2xs text-ink-faint">{dict.chat.slashHint}</p>}
    </div>
  )

  // Empty: serif greeting + warm composer + suggestion chips (design update 2026-07-06).
  // Active: messages scroll and the composer drops to the bottom; the reply streams in with a caret.
  const content = empty ? (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-7 pb-[8vh]">
        <div className="w-full max-w-[680px] animate-fade-up">
          <div className="mb-7 text-center">
            <Greeting className="font-display text-[40px] font-medium leading-[1.03] tracking-[-0.022em] text-[#0A0A0A]" />
            <p className="mt-3 text-[15.5px] leading-normal text-ink-muted">{dict.chat.subhead}</p>
          </div>
          {composer}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {dict.chat.suggestions.slice(0, 3).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setInput(s)
                  inputRef.current?.focus()
                }}
                className="rounded-[20px] border border-field-line bg-chip-bg px-[15px] py-2 text-[13px] text-ink transition-colors hover:bg-field"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="atscroll flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto w-full max-w-[720px] space-y-[22px]">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              // Charcoal pill (design bubble: 14/14/4/14) anchored to the PHYSICAL right in
              // BOTH locales — founder decision 2026-08-02, the ChatGPT model: your own message
              // is always the one on the right. This is a deliberate deviation from the design
              // reference, which puts the bubble on the *trailing* edge; in English those agree,
              // in Hebrew they do not, and the founder chose right. Do not "restore" the mirror.
              //
              // The bug both fixes came from: `ms-auto` on an element carrying dir="auto".
              // Logical margins resolve against the element's OWN direction, so a Hebrew message
              // computed to RTL, `ms-auto` became margin-RIGHT, and that one message jumped to
              // the opposite side of the thread from its English neighbours.
              //
              // EVERY property that decides the SIDE must therefore be physical: `ml-auto` and
              // `rounded-br`. The logical spellings are all traps here — `ms-auto`, `rounded-ee`
              // and `justify-end` alike follow writing direction, and <html dir="rtl"> in Hebrew
              // flips all three to the left. An auto margin on the physical left absorbs the free
              // space on that side in any direction, which is exactly the invariant we want.
              //
              // ALIGNMENT is physical; DIRECTION is not. The text stays in its own <bdi> (which
              // is dir="auto" by default), so Hebrew reads RTL and English reads LTR inside a box
              // that does not move — moving the box is the whole point of not forcing `dir` on
              // the content, which is the bidi defect class rules/app.md has filed four times.
              <div key={i} className="flex animate-fade-up">
                <div className="ml-auto max-w-[75%] rounded-[14px] rounded-br-[4px] bg-ink px-[15px] py-[11px] text-sm leading-relaxed text-paper">
                  <bdi className="block">{m.content}</bdi>
                </div>
              </div>
            ) : (
              <div key={i} className="animate-fade-in text-[15px] leading-relaxed text-ink">
                {m.streaming && !m.content ? (
                  <ThinkingDots />
                ) : m.streaming ? (
                  // stream as plain text (fast, no reflow) — render polished markdown once settled
                  <p dir="auto" className="whitespace-pre-wrap">
                    {m.content}
                    <span className="caret" />
                  </p>
                ) : (
                  <Markdown content={m.content} />
                )}
                {m.source && !m.streaming && <CitationChip source={m.source} />}
                {/* The project's context did not reach the model whole. Said on
                    the answer it applies to, because that is the only place the
                    user can act on it (rules/app.md — never render success UI
                    for content the server dropped). */}
                {m.projectContext && !m.streaming && (
                  <p role="status" dir="auto" className="mt-2 text-[12.5px] leading-[1.5] text-[#B0533E]">
                    {m.projectContext === 'failed'
                      ? dict.projects.contextFailed
                      : dict.projects.contextTruncated}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      </div>
      <div className="px-6 pb-5 pb-dock">{composer}</div>
    </div>
  )

  // The embedded surface, if any. `renderMain` gets the chat's own send, so a
  // project's composer drives this engine instead of reimplementing it.
  // Evaluated once — calling it per branch would build the tree twice.
  const embedded: React.ReactNode = renderMain
    ? renderMain({ send, sending, open: openConversation })
    : mainView

  // Chat secondary panel (design lines 948-971): mini-nav rows (New chat / Projects /
  // Workspace / Agents) → divider → RECENT CHATS list.
  const navRow =
    'flex w-full items-center gap-[11px] rounded-lg px-[11px] py-[9px] text-start text-[13.5px] transition-colors'

  return (
    <CollapsiblePanel
      panel={
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex flex-col gap-px">
            <button
              type="button"
              onClick={newChat}
              className={`${navRow} font-medium text-ink hover:bg-subtle/70`}
            >
              <PencilIcon size={16} strokeWidth={1.6} className="flex-none" />
              {dict.chat.newChat}
            </button>
            <Link
              href="/app/chat/projects"
              className={`${navRow} text-ink-muted hover:bg-subtle/70 hover:text-ink`}
            >
              <ProjectsIcon size={16} strokeWidth={1.6} className="flex-none" />
              {dict.chat.projects}
            </Link>
            <Link
              href="/app/workspace"
              className={`${navRow} text-ink-muted hover:bg-subtle/70 hover:text-ink`}
            >
              <WorkspacesIcon size={16} strokeWidth={1.6} className="flex-none" />
              {dict.nav.workspace}
            </Link>
            <Link href="/app/agents" className={`${navRow} text-ink-muted hover:bg-subtle/70 hover:text-ink`}>
              <AgentsIcon size={16} strokeWidth={1.6} className="flex-none" />
              {dict.nav.agents}
            </Link>
          </div>
          <div className="mx-1 my-3.5 h-px bg-hairline" />
          <div className="px-[7px] pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            {dict.chat.recentChats}
          </div>
          <div className="atscroll min-h-0 flex-1 overflow-y-auto">
            <ChatHistory
              activeId={conversationId}
              onNew={newChat}
              onOpen={openConversation}
              refreshKey={historyKey}
              hideNewButton
            />
          </div>
        </div>
      }
    >
      {embedded && messages.length === 0 ? embedded : content}
    </CollapsiblePanel>
  )
}
