'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { WordReveal } from '@/components/ds/WordReveal'
import { ThinkingDots } from '@/components/chat/ThinkingDots'
import { Markdown } from '@/components/chat/Markdown'
import { ErrorLine } from '@/components/projects/ErrorLine'
import { CloseIcon, ArrowUpIcon, QuoteIcon, MicIcon } from '@/components/ds/icons'
import { workspaceChatReq } from '@/lib/workspace/client'
import { detectDir } from '@/lib/utils'
import type { ChatTurn } from '@/lib/workspace/chat/prompt'

// Workspace chat — and Ask Atlas, which is the same conversation opened with a
// passage already in hand.
//
// BUILT ON THE APP'S EXISTING ASK ATLAS, not beside it. Founder, 2026-08-04:
// *"the ask atlas aesthetic, ux, text panel etc needs to be exactly as we have
// in the rest of the application."* The first version of this file invented its
// own bubbles, its own dots and its own composer while
// components/live/TranscriptChatPanel.tsx — the in-transcript side chat — had
// already settled every one of those questions. What is shared is now shared
// (ThinkingDots, Markdown, detectDir, the reference-above-composer shape); what
// differs is only the palette, because that panel is themed for the call surface
// (`call-*` flips with the call's dark/light) and this one sits on the
// workspace's paper.
//
// THE ONE UX PROPERTY WORTH NAMING, copied deliberately: the marked passage
// becomes PART OF THE MESSAGE and stays visible in that message's bubble. So
// marking a second passage never clobbers the first, and the history reads
// top-to-bottom as a record of what was asked about what.

export type AskContext = { itemId: string; title: string; text: string }

type Msg = {
  role: 'user' | 'assistant'
  content: string
  /** the passage this question was asked about, kept with it forever */
  reference?: string
  referenceTitle?: string
  /** files the answer could see only part of, or not at all */
  caveat?: string[]
  revealing?: boolean
}

export function WorkspaceChat({
  workspaceId,
  seed,
  onClearSeed,
  onRequestDocuments,
}: {
  workspaceId: string
  /** a marked passage, when this was opened by Ask Atlas */
  seed?: AskContext | null
  onClearSeed?: () => void
  /** the chat cannot attach files — it hands the request to the intake flow */
  onRequestDocuments?: (request: string) => void
}) {
  const { dict } = useI18n()

  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  /** the pending reference shown above the composer */
  const [ref, setRef] = useState<AskContext | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])
  useEffect(scrollToEnd, [messages.length, sending, scrollToEnd])

  useEffect(() => {
    if (!seed) return
    setRef(seed)
    // preventScroll is CRITICAL and is the same guard TranscriptChatPanel
    // carries: focusing a panel that is still settling makes the browser scroll
    // the whole document sideways to reveal the input.
    inputRef.current?.focus({ preventScroll: true })
  }, [seed])

  async function send() {
    const text = input.trim()
    if (!text || sending) return

    const used = ref
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: text,
        ...(used ? { reference: used.text, referenceTitle: used.title } : {}),
      },
    ])
    setInput('')
    setRef(null)
    onClearSeed?.()
    setError(null)
    setSending(true)

    const history: ChatTurn[] = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: text },
    ]

    try {
      const { result } = await workspaceChatReq(
        workspaceId,
        history,
        used ? { title: used.title, text: used.text } : null
      )
      setSending(false)
      // A model that could not answer still gets a turn, so the conversation
      // never just stops with nothing said.
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.reply ?? dict.workspace.chatNoAnswer,
          caveat: [...result.partial, ...result.unreadable],
          revealing: true,
        },
      ])
      // "The same as add documents" — handed to the intake conversation rather
      // than attached here, so exactly one code path ever picks a file.
      if (result.wantsDocuments && onRequestDocuments) onRequestDocuments(result.wantsDocuments)
    } catch (e: unknown) {
      setSending(false)
      setError(e)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="atscroll flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          // The serif hero, staggered word entrance — the same greeting shape the
          // in-call Ask Atlas opens with.
          <div className="flex h-full flex-col items-center justify-center px-4 pb-2.5 text-center">
            <h1 className="max-w-[15ch] font-display text-[26px] font-medium leading-[1.16] tracking-[-0.012em] text-ink">
              <span className="aa-w" style={{ animationDelay: '.06s' }}>
                {dict.live.askHeroLine1}
              </span>{' '}
              <span className="aa-w block" style={{ animationDelay: '.24s' }}>
                {dict.workspace.chatHeroLine2}
              </span>
            </h1>
            <p
              className="aa-w mt-3.5 max-w-[28ch] text-[13px] leading-[1.55] text-ink-muted"
              style={{ animationDelay: '.4s' }}
            >
              {dict.workspace.chatHint}
            </p>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            // Every part of the user's turn hugs the PHYSICAL right in both
            // locales — founder decision 2026-08-02, and the reason each child
            // takes `ml-auto` rather than the stack taking `items-end`: that one
            // is logical, so in Hebrew it pushes the whole turn to the left.
            <div key={i} className="flex animate-fade-up flex-col gap-1">
              {m.reference && (
                <div
                  dir={detectDir(m.reference)}
                  className="ml-auto max-w-[92%] rounded-[8px] border border-hairline bg-subtle/60 px-3 py-2"
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium text-ink-ghost">
                    <QuoteIcon size={11} />
                    <bdi>{m.referenceTitle || dict.chat.referringTo}</bdi>
                  </div>
                  <p className="line-clamp-4 text-[12.5px] leading-[1.8] text-ink-muted">{m.reference}</p>
                </div>
              )}
              <div
                dir="auto"
                className="ml-auto max-w-[92%] rounded-[14px] rounded-br-[4px] bg-subtle px-3.5 py-2 text-[13.5px] leading-relaxed text-ink"
              >
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="animate-fade-in text-[13.5px] leading-relaxed text-ink">
              {m.revealing && i === messages.length - 1 ? (
                // The answer arrives whole (the route returns JSON, so it cannot
                // stream), and is REVEALED word by word — founder, 2026-08-04:
                // *"fast and word by word"*. The caret is the same one the
                // streaming surfaces use, so the two read alike.
                <p dir="auto" className="whitespace-pre-wrap">
                  <WordReveal text={m.content} onReveal={scrollToEnd} />
                  <span className="caret" />
                </p>
              ) : (
                <Markdown content={m.content} />
              )}
              {/* WHAT THE ANSWER COULD NOT SEE. An answer drawn from part of a
                  long transcript reads exactly like one drawn from all of it, so
                  the gap is stated under it rather than left to be discovered. */}
              {m.caveat && m.caveat.length > 0 && (
                <div
                  dir="auto"
                  className="mt-2 rounded-lg bg-[rgba(180,140,60,.13)] px-2.5 py-2 text-[11.5px] leading-[1.5] text-[#8A6A2F]"
                >
                  {dict.workspace.chatPartial}
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {m.caveat.map((t) => (
                      <li key={t}>
                        <bdi>{t}</bdi>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        )}

        {sending && <ThinkingDots />}

        {error !== null && (
          <div
            role="alert"
            className="rounded-[10px] border border-hairline bg-paper px-3 py-2 text-[12.5px] text-ink"
          >
            <ErrorLine
              template={dict.workspace.chatFailed}
              error={error}
              auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
            />
          </div>
        )}
      </div>

      <div className="flex-none px-4 pb-4 pt-3.5">
        {/* THE MARKED PASSAGE, SHOWN BEFORE IT IS SENT — Atlas must never hold a
            paragraph the user cannot see it holding, and they can drop it. Same
            shape as the in-call composer's reference block. */}
        {ref && (
          <div className="mb-2.5 flex items-start gap-2 rounded-[14px] border border-hairline px-[11px] py-[9px]">
            <span className="mt-0.5 flex-none text-ink-ghost">
              <QuoteIcon size={12} />
            </span>
            <div dir={detectDir(ref.text)} className="min-w-0 flex-1">
              <div className="mb-0.5 text-[10.5px] font-medium text-ink-ghost">
                <bdi>{ref.title}</bdi>
              </div>
              <div className="line-clamp-4 text-[12.5px] leading-[1.8] text-ink">{ref.text}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setRef(null)
                onClearSeed?.()
              }}
              title={dict.common.remove}
              className="mt-0.5 flex flex-none text-ink-ghost transition-colors hover:text-ink"
            >
              <CloseIcon size={14} strokeWidth={1.7} />
            </button>
          </div>
        )}

        {/* Harvey composer: 12px corners, field on the panel, input row above an
            icon row with a round send at the end. */}
        <div className="rounded-[12px] border border-hairline bg-panel px-3.5 pb-2.5 pt-3">
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
            // A single authored run, so dir="auto" is exactly right here — this
            // is the one place rules/app.md endorses it.
            dir="auto"
            className="max-h-[120px] w-full resize-none bg-transparent pb-[3px] pt-[2px] text-[14.5px] leading-[1.45] text-ink outline-none placeholder:text-ink-ghost"
          />
          <div className="mt-2 flex items-center justify-end">
            <span className="flex items-center gap-1.5">
              {/* voice-ask affordance — future feature, visibly disabled rather
                  than absent, exactly as the in-call composer carries it */}
              <button
                type="button"
                title={dict.live.voiceSoon}
                aria-label={dict.live.voiceSoon}
                disabled
                className="grid h-[28px] w-[28px] place-items-center rounded-[8px] text-ink-ghost opacity-50"
              >
                <MicIcon size={15} strokeWidth={1.7} />
              </button>
              <button
                type="button"
                // A wrapper, never `onClick={send}`: React's MouseEvent would
                // arrive as the first argument. That exact bug shipped once on
                // the main composer and the keyboard path masked it.
                onClick={() => void send()}
                disabled={sending || !input.trim()}
                aria-label={dict.workspace.intakeSend}
                className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-ink text-paper transition-opacity disabled:opacity-40"
              >
                <ArrowUpIcon size={15} strokeWidth={2} />
              </button>
            </span>
          </div>
        </div>
        <p className="mt-2 px-1 text-center text-[11.5px] leading-[1.5] text-ink-ghost">
          {dict.workspace.chatConnected}
        </p>
      </div>
    </div>
  )
}
