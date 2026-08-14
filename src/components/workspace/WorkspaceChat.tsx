'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { WordReveal } from '@/components/ds/WordReveal'
import { ThinkingDots } from '@/components/chat/ThinkingDots'
import { Markdown } from '@/components/chat/Markdown'
import { ErrorLine } from '@/components/projects/ErrorLine'
import { CloseIcon, ArrowUpIcon, QuoteIcon, MicIcon, ScissorsIcon } from '@/components/ds/icons'
import { workspaceChatReq, saveThreadReq } from '@/lib/workspace/client'
import { deriveThreadTitle, type StoredMsg } from '@/lib/workspace/thread'
import { detectDir } from '@/lib/utils'
import type { ChatSnip } from '@/lib/chat/grounding'
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

/**
 * On-screen turn -> stored turn, and back.
 *
 * The asymmetry is the clippings, and it is the whole reason these two are
 * written out rather than being a cast. Going OUT, a live `snips` array becomes
 * a list of page numbers — the images do not go into the database
 * (lib/workspace/thread.ts). Coming BACK, those page numbers land in `snipPages`
 * and never in `snips`, so the renderer can tell a picture it can show from one
 * it can only describe.
 */
function toStored(m: Msg): StoredMsg {
  const out: StoredMsg = { role: m.role, content: m.content }
  if (m.reference) out.reference = m.reference
  if (m.referenceTitle) out.referenceTitle = m.referenceTitle
  if (m.caveat?.length) out.caveat = m.caveat
  // Either source of pages, because a turn may be live (snips) or already
  // restored (snipPages) by the time the next save sweeps the whole array.
  const pages = m.snips?.map((s) => s.page) ?? m.snipPages
  if (pages?.length) out.snipPages = pages
  return out
}

function fromStored(m: StoredMsg): Msg {
  return {
    role: m.role,
    content: m.content,
    ...(m.reference ? { reference: m.reference } : {}),
    ...(m.referenceTitle ? { referenceTitle: m.referenceTitle } : {}),
    ...(m.caveat?.length ? { caveat: m.caveat } : {}),
    ...(m.snipPages?.length ? { snipPages: m.snipPages } : {}),
    // NEVER `revealing`. The word-by-word entrance is for an answer arriving
    // now; replaying it on every reload would animate a conversation the user
    // has already read.
  }
}

type Msg = {
  role: 'user' | 'assistant'
  content: string
  /** the passage this question was asked about, kept with it forever */
  reference?: string
  referenceTitle?: string
  /** the clippings that went with it — what Atlas actually saw stays visible */
  snips?: ChatSnip[]
  /**
   * The pages clippings were cut from, on a turn RESTORED from the database.
   * The images are not stored (lib/workspace/thread.ts explains why), so a
   * reloaded turn that had clippings says so in words instead of pretending it
   * never had any. Live turns carry `snips` and never this.
   */
  snipPages?: number[]
  /** files the answer could see only part of, or not at all */
  caveat?: string[]
  revealing?: boolean
}

export function WorkspaceChat({
  workspaceId,
  initialMessages = [],
  onConversationChange,
  seed,
  onClearSeed,
  onRequestDocuments,
  onConnect,
  snips = [],
  onRemoveSnip,
  onClearSnips,
  snipAvailable = false,
  onArmSnip,
  snipCapped = false,
}: {
  workspaceId: string
  /**
   * The saved conversation, read on the SERVER with the rest of the room. A
   * prop rather than a fetch here: this panel is unmounted while the chat is
   * closed, so a fetch-on-mount would put a loading frame in front of history
   * every time the user reopened it — and would arrive after the first paint,
   * which is the cold-open the warm read exists to prevent.
   */
  initialMessages?: StoredMsg[]
  /**
   * Report the conversation upward as it grows, so the panel's Chats section
   * counts what is actually there. Without it that section reads the SERVER's
   * copy and keeps saying "nothing has been asked yet" through a conversation
   * happening beside it — untrue the moment the first question lands, and only
   * corrected by a reload.
   */
  onConversationChange?: (summary: { count: number; title: string }) => void
  /** a marked passage, when this was opened by Ask Atlas */
  seed?: AskContext | null
  onClearSeed?: () => void
  /** the chat cannot attach files — it hands the request to the intake flow */
  onRequestDocuments?: (request: string) => void
  /** work a marked piece of an answer into the working document */
  onConnect?: (passage: { title: string; text: string }) => void
  /**
   * PINGE, the in-call clipping tool, in the workspace. Founder, 2026-08-05:
   * *"we need to have the same UX as we have on the viewing live investor call
   * in terms of the snipping tool in Ask Atlas."* The clips are held by the
   * SHELL, not here, because the scissors and the PDF it cuts are siblings —
   * the composer arms, a pane captures, and the chip has to arrive in the
   * composer either way.
   */
  snips?: ChatSnip[]
  onRemoveSnip?: (i: number) => void
  onClearSnips?: () => void
  /** a real PDF is open somewhere; otherwise the scissors is visibly disabled */
  snipAvailable?: boolean
  onArmSnip?: () => void
  /** the 5th clip was refused — said out loud rather than dropped in silence */
  snipCapped?: boolean
}) {
  const { dict } = useI18n()

  const [messages, setMessages] = useState<Msg[]>(() => initialMessages.map(fromStored))
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  /** a conversation that could not be written — said out loud, never swallowed */
  const [saveError, setSaveError] = useState<unknown>(null)

  /** the pending reference shown above the composer */
  const [ref, setRef] = useState<AskContext | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  /** a marked run inside an answer, positioned relative to the scroller */
  const [answerMark, setAnswerMark] = useState<{ text: string; x: number; y: number } | null>(null)
  const readAnswerSelection = useCallback(() => {
    if (!onConnect) return
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    const host = scrollRef.current
    if (!sel || sel.rangeCount === 0 || text.length < 2 || !host) {
      setAnswerMark(null)
      return
    }
    if (!host.contains(sel.anchorNode) || !host.contains(sel.focusNode)) {
      setAnswerMark(null)
      return
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    const box = host.getBoundingClientRect()
    setAnswerMark({
      text,
      // Clamped inside the panel — it is only 340px wide, so an unclamped
      // centre on a long line puts the button off the edge.
      x: Math.min(Math.max(rect.left - box.left + rect.width / 2, 80), box.width - 80),
      // host.scrollTop, because this button is absolute inside a SCROLLING box:
      // without it the button sits where the selection was before the scroll.
      y: Math.max(rect.top - box.top + host.scrollTop - 8, 8),
    })
  }, [onConnect])

  /**
   * Write the conversation, ONE AT A TIME.
   *
   * The PUT replaces the whole array, so two in flight together would be a
   * lost update: the older request can land second and reinstate a
   * conversation missing the newest turn. The chain is the same device the
   * working document uses for its block saves, and for the same reason —
   * serialising is what makes "what is on screen is what is stored" true rather
   * than usually true.
   *
   * The messages are read from a REF, not from the closure. A save queued
   * behind another must write the conversation as it stands when its turn
   * comes, not as it stood when it was queued.
   */
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const saveChain = useRef<Promise<unknown>>(Promise.resolve())

  const saveConversation = useCallback(() => {
    saveChain.current = saveChain.current
      .catch(() => {})
      .then(async () => {
        try {
          await saveThreadReq(workspaceId, messagesRef.current.map(toStored))
          setSaveError(null)
        } catch (e) {
          // RENDERED, never swallowed. A conversation the user believes is
          // saved and is not would only be discovered on the reload that lost
          // it — the exact failure this feature was built to end.
          setSaveError(e)
        }
      })
  }, [workspaceId])

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
    const typed = input.trim()
    const usedSnips = snips
    // A clipping IS a question. Sending one with nothing typed is the in-call
    // behaviour, and the default sentence keeps the model pointed at it.
    if ((!typed && usedSnips.length === 0) || sending) return
    const text = typed || dict.chat.snipDefault

    const used = ref
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: text,
        ...(used ? { reference: used.text, referenceTitle: used.title } : {}),
        ...(usedSnips.length > 0 ? { snips: usedSnips } : {}),
      },
    ])
    setInput('')
    setRef(null)
    onClearSeed?.()
    onClearSnips?.()
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
        used ? { title: used.title, text: used.text } : null,
        usedSnips
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

  /**
   * Every turn is written, from an EFFECT rather than from `send`.
   *
   * `setMessages` schedules; it does not update. Calling the save at the end of
   * `send` would read a `messagesRef` that React has not refreshed yet and store
   * the conversation one turn short — the same "state set through React is not
   * state you have yet" trap `.claude/rules/app.md` files against the audio
   * element. An effect runs after the commit, so what it reads is what the user
   * can see.
   *
   * BOTH TURNS REACH IT, including the one whose answer failed: the question was
   * genuinely asked, and a failed model call is exactly when someone closes the
   * tab. Losing what they typed on top of not getting an answer is the worse
   * half of the same bad minute.
   *
   * `lastSaved` starts at the SERVER'S count, so opening a workspace does not
   * immediately write back the conversation it was just handed.
   */
  const lastSaved = useRef(initialMessages.length)
  useEffect(() => {
    if (messages.length === lastSaved.current) return
    lastSaved.current = messages.length
    saveConversation()
    // Told from the same place, so the panel's count and the stored row can
    // never disagree about how many turns there are.
    onConversationChange?.({
      count: messages.length,
      title: deriveThreadTitle(messages.map(toStored)),
    })
  }, [messages, saveConversation, onConversationChange])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        onPointerUp={readAnswerSelection}
        onScroll={() => setAnswerMark(null)}
        className="atscroll relative flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {/* AN ANSWER IS A SOURCE TOO. Founder, 2026-08-04: connect-to-document
            works *"in the answers atlas gave, in the reports, in the
            transcripts"*. No "Ask Atlas" here — you are already in it. */}
        {answerMark && onConnect && (
          <button
            type="button"
            // mousedown, not click: a click collapses the selection first.
            onMouseDown={(e) => {
              e.preventDefault()
              onConnect({ title: dict.live.askAtlas, text: answerMark.text })
              setAnswerMark(null)
              window.getSelection()?.removeAllRanges()
            }}
            style={{ left: answerMark.x, top: answerMark.y }}
            className="absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-3 py-1.5 text-[12px] font-medium text-paper shadow-menu"
          >
            {dict.workspace.connectToDocument}
          </button>
        )}
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
              {m.snips && m.snips.length > 0 && (
                // WHAT ATLAS SAW STAYS VISIBLE — the trust moment the in-call
                // panel established. An answer about a picture nobody can see
                // any more is unverifiable.
                <div dir="ltr" className="ml-auto flex max-w-[92%] flex-wrap justify-end gap-1.5">
                  {m.snips.map((s, j) => (
                    <img
                      key={j}
                      src={s.dataUrl}
                      alt={`${dict.chat.pageShort} ${s.page}`}
                      className="h-20 w-auto max-w-[170px] rounded-[8px] border border-hairline bg-white object-contain"
                    />
                  ))}
                </div>
              )}
              {/* A RESTORED CLIPPING, whose image is not stored. Said in words
                  rather than rendered as nothing: a turn that silently lost its
                  attachment reads as a question that never had one, and the
                  answer above it then looks like it came from thin air. See
                  lib/workspace/thread.ts for why the pixels do not go in the
                  row. Only ever one of these two branches — a live turn carries
                  `snips`, a reloaded one carries `snipPages`. */}
              {!m.snips?.length && m.snipPages && m.snipPages.length > 0 && (
                <div
                  dir="auto"
                  className="ml-auto max-w-[92%] rounded-[8px] border border-dashed border-hairline px-3 py-1.5 text-[11px] text-ink-ghost"
                >
                  <bdi>
                    {(m.snipPages.length === 1
                      ? dict.workspace.clipNotKept
                      : dict.workspace.clipsNotKept.replace('{n}', String(m.snipPages.length))
                    ).replace('{pages}', m.snipPages.join(', '))}
                  </bdi>
                </div>
              )}
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
                    {/* Keyed by POSITION, not by title. Two files on one shelf can
                        genuinely carry the same name — this workspace holds two
                        rows both called "דוח דירקטוריון Q1 2026" — and a title key
                        made React drop one of them with a duplicate-key warning.
                        Listing it twice is the honest render: both were read in
                        part, and collapsing them would under-report the gap. */}
                    {m.caveat.map((t, k) => (
                      <li key={`${k}-${t}`}>
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

        {/* A SEPARATE BANNER FROM THE ONE ABOVE, because they are separate
            facts: that one says the answer failed, this one says the record of
            it will not survive a reload. Showing only the first would leave the
            second to be discovered by losing the conversation. */}
        {saveError !== null && (
          <div
            role="alert"
            className="rounded-[10px] border border-hairline bg-paper px-3 py-2 text-[12.5px] text-ink"
          >
            <ErrorLine
              template={dict.workspace.chatSaveFailed}
              error={saveError}
              auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
            />
          </div>
        )}
      </div>

      <div className="flex-none px-4 pb-4 pt-3.5">
        {/* The clip stack, above the reference block — same order as in-call. */}
        {snips.length > 0 && (
          <div dir="ltr" className="mb-2.5 flex flex-wrap gap-2">
            {snips.map((s, i) => (
              <div key={i} className="relative rounded-[10px] border border-hairline bg-white p-1">
                <img
                  src={s.dataUrl}
                  alt={`${dict.chat.pageShort} ${s.page}`}
                  className="h-16 w-auto max-w-[150px] rounded-[6px] object-contain"
                />
                <span className="absolute bottom-1.5 start-1.5 rounded bg-black/50 px-1 text-[10px] leading-[1.5] text-white">
                  {dict.chat.pageShort} {s.page}
                </span>
                <button
                  type="button"
                  aria-label={dict.common.remove}
                  onClick={() => onRemoveSnip?.(i)}
                  className="absolute -end-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                >
                  <CloseIcon size={11} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
        {snipCapped && <div className="mb-2 text-[11.5px] text-ink-muted">{dict.chat.snipCap}</div>}
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
          <div className="mt-2 flex items-center justify-between">
            {/* ALWAYS RENDERED, disabled when there is nothing to cut — the
                founder's round-2 note on the in-call composer, and the same
                reasoning holds: an affordance that appears and disappears makes
                the control row jump, while one that is visibly disabled says
                "open a report and I work". */}
            <button
              type="button"
              title={dict.workspace.snipTool}
              aria-label={dict.workspace.snipTool}
              onClick={() => onArmSnip?.()}
              disabled={!snipAvailable || !onArmSnip}
              className="grid h-[28px] w-[28px] place-items-center rounded-[8px] text-ink-ghost transition-colors enabled:hover:text-ink disabled:opacity-35"
            >
              <ScissorsIcon size={15} strokeWidth={1.8} />
            </button>
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
                disabled={sending || (!input.trim() && snips.length === 0)}
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
