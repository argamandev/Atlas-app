'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Typewriter } from '@/components/ds/Typewriter'
import { ErrorLine } from '@/components/projects/ErrorLine'
import { CloseIcon, ArrowUpIcon } from '@/components/ds/icons'
import { workspaceChatReq } from '@/lib/workspace/client'
import type { ChatTurn } from '@/lib/workspace/chat/prompt'

// Workspace chat — and Ask Atlas, which is the same conversation opened with a
// passage already in hand.
//
// Founder, 2026-08-04: *"the new workspace chat should just be workspace chat.
// this is where the user can communicate with an llm about the worksapce itself
// -> questions, data analysis, asking for more documents pulling"*, and *"we
// need to enable ask atlas feature! when we mark text we need to be able to ask
// atlas about it and let it open from the side pannel."*
//
// ONE COMPONENT for both because they are one feature: asking about a marked
// paragraph is asking about the workspace with the paragraph attached. The only
// difference is what is in the box when it opens.

export type AskContext = { itemId: string; title: string; text: string }

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

  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [animateAt, setAnimateAt] = useState<number | null>(null)
  /** files the last answer could only partly read, or not at all */
  const [caveat, setCaveat] = useState<string[]>([])

  const endRef = useRef<HTMLDivElement>(null)
  const stickToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [])
  useEffect(() => {
    stickToEnd()
  }, [turns, thinking, stickToEnd])

  // The marked passage rides with the NEXT message only. Keeping it attached to
  // every later turn would silently re-scope a conversation that has moved on.
  const [pending, setPending] = useState<AskContext | null>(null)
  useEffect(() => {
    if (seed) setPending(seed)
  }, [seed])

  const composerRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (seed) composerRef.current?.focus()
  }, [seed])

  async function send(text: string) {
    const q = text.trim()
    if (!q || thinking) return

    const next: ChatTurn[] = [...turns, { role: 'user', content: q }]
    setTurns(next)
    setDraft('')
    setError(null)
    setCaveat([])
    setThinking(true)

    const selection = pending
    setPending(null)
    onClearSeed?.()

    try {
      const { result } = await workspaceChatReq(workspaceId, next, selection)
      setThinking(false)

      // A model that could not answer still gets a turn, so the conversation
      // never just stops with nothing said.
      const spoken = result.reply ?? dict.workspace.chatNoAnswer
      setTurns([...next, { role: 'assistant', content: spoken }])
      setAnimateAt(next.length)
      setCaveat([...result.partial, ...result.unreadable])

      // "The same as add documents" — handed to the intake conversation rather
      // than attached here, so exactly one code path ever picks a file.
      if (result.wantsDocuments && onRequestDocuments) onRequestDocuments(result.wantsDocuments)
    } catch (e: unknown) {
      setThinking(false)
      setError(e)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="atscroll flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 py-5">
        {turns.length === 0 && !pending && (
          <div className="my-auto px-2 text-center">
            <div className="mb-1.5 text-[14px] font-medium text-ink">{dict.workspace.chatHead}</div>
            <p dir="auto" className="text-[12.5px] leading-[1.6] text-ink-muted">
              {dict.workspace.chatHint}
            </p>
          </div>
        )}

        {turns.map((t, i) =>
          t.role === 'user' ? (
            <div
              key={i}
              dir="auto"
              className="max-w-[85%] self-end rounded-[14px_14px_4px_14px] bg-ink px-[13px] py-[9px] text-[13.5px] leading-[1.6] text-paper"
            >
              {t.content}
            </div>
          ) : (
            <div
              key={i}
              dir="auto"
              className="max-w-[97%] self-start whitespace-pre-wrap text-[13.5px] leading-[1.7] text-ink"
            >
              {i === animateAt ? <Typewriter text={t.content} onReveal={stickToEnd} /> : t.content}
            </div>
          )
        )}

        {thinking && (
          <div dir="auto" className="flex items-center gap-2 self-start text-[12.5px] text-ink-ghost">
            <span className="flex gap-1">
              {['0ms', '150ms', '300ms'].map((d) => (
                <span
                  key={d}
                  className="inline-block h-[5px] w-[5px] animate-pulse rounded-full bg-ink-ghost"
                  style={{ animationDelay: d }}
                />
              ))}
            </span>
            {dict.workspace.intakeThinking}
          </div>
        )}

        {/* WHAT THE ANSWER COULD NOT SEE. A grounded answer drawn from part of a
            long transcript reads exactly like one drawn from all of it, so the
            gap is stated under the answer rather than left to be discovered. */}
        {caveat.length > 0 && !thinking && (
          <div
            dir="auto"
            className="self-start rounded-lg bg-[rgba(180,140,60,.13)] px-2.5 py-2 text-[11.5px] leading-[1.5] text-[#8A6A2F]"
          >
            {dict.workspace.chatPartial}
            <ul className="mt-1 flex flex-col gap-0.5">
              {caveat.map((t) => (
                <li key={t}>
                  <bdi>{t}</bdi>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error !== null && (
          <div
            role="alert"
            className="self-start rounded-[10px] border border-hairline bg-paper px-3 py-2 text-[12.5px] text-ink"
          >
            <ErrorLine
              template={dict.workspace.chatFailed}
              error={error}
              auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
            />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex-none border-t border-hairline p-3">
        {/* THE MARKED PASSAGE, SHOWN BEFORE IT IS SENT. Atlas must never answer
            about a paragraph the user cannot see it holding — and they can drop
            it, which is why it has its own remove button. */}
        {pending && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-hairline bg-subtle/60 px-2.5 py-2">
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-ghost">
                <bdi>{pending.title}</bdi>
              </div>
              {/* Clamped with the box properties directly: `line-clamp-*` needs
                  a Tailwind plugin this build does not have, and without it the
                  whole marked paragraph filled the composer. */}
              <p
                dir="auto"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
                className="text-[12px] leading-[1.5] text-ink-muted"
              >
                {pending.text}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPending(null)
                onClearSeed?.()
              }}
              aria-label={dict.common.close}
              className="flex-none text-ink-ghost hover:text-ink"
            >
              <CloseIcon size={12} strokeWidth={2.2} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-xl border border-hairline bg-paper px-3 py-2">
          <input
            ref={composerRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send(draft)}
            placeholder={dict.workspace.chatPlaceholder}
            dir="auto"
            disabled={thinking}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-ghost"
          />
          <button
            type="button"
            onClick={() => void send(draft)}
            disabled={thinking}
            aria-label={dict.workspace.intakeSend}
            className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-ink text-paper disabled:opacity-40"
          >
            <ArrowUpIcon size={13} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  )
}
