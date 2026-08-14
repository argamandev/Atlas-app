'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { streamChat } from '@/lib/api/chat'
import type { ChatSource, ChatSnip } from '@/lib/chat/grounding'
import { sanitizeHistory } from '@/lib/chat/history'
import { appendSnip } from '@/lib/documents/snip'
import { armSnip, getSnipTarget, subscribeSnipTarget } from '@/lib/live/snipBridge'
import { CitationChip } from '@/components/chat/CitationPopover'
import { ThinkingDots } from '@/components/chat/ThinkingDots'
import { Markdown } from '@/components/chat/Markdown'
import { SparkleIcon, CloseIcon, QuoteIcon, ArrowUpIcon, ScissorsIcon, MicIcon } from '@/components/ds/icons'
import { detectDir } from '@/lib/utils'

// In-transcript side chat (Feature 6, refined). Opens beside the transcript; the transcript
// stays visible and the global audio keeps playing. While it's open, highlighting transcript
// text auto-populates a *reference block above the composer* (Claude-style) — the user just
// types their question. On send, the reference becomes part of that message (shown in its
// bubble), so a new highlight never clobbers earlier context; history reads top-to-bottom.
interface Msg {
  role: 'user' | 'assistant'
  content: string
  /** what /api/chat actually received (reference-labeled / snip default) — replayed as history */
  apiContent?: string
  reference?: string
  snips?: ChatSnip[]
  source?: ChatSource | null
  streaming?: boolean
}

export function TranscriptChatPanel({
  companyId,
  transcriptId,
  liveContext,
  quote,
  seedNonce,
  docRef,
  snip,
  onClose,
  heroLine2,
  snipAvailable,
}: {
  companyId: string | null
  transcriptId: string | undefined
  /** LIVE view only: the on-screen captions, sent as grounding context instead of a DB lookup */
  liveContext?: string
  quote: string
  /** bumps every time a fresh selection is referenced (star or, while open, any highlight) */
  seedNonce: number
  /** multiview: the pending reference came from the report PDF (document + pages) */
  docRef?: { documentId: string; pages: number[] } | null
  /** Pinge: a fresh snip to attach (rides seedNonce like docRef) */
  snip?: ChatSnip | null
  onClose: () => void
  /** hero second line override — "about this call" (default) vs "about this company" */
  heroLine2?: string
  /** design round 2: a snippable document pane is open → show the composer scissors */
  snipAvailable?: boolean
}) {
  const { dict } = useI18n()
  // a real, snippable document pane is mounted (ReportPane publishes via the snip bridge)
  const snipTarget = useSyncExternalStore(subscribeSnipTarget, getSnipTarget, () => false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [ref, setRef] = useState<string>(quote) // the pending reference shown above the composer
  const [refDoc, setRefDoc] = useState<typeof docRef>(docRef ?? null)
  const [snips, setSnips] = useState<ChatSnip[]>([]) // Pinge chip stack (≤ SNIP_MAX)
  const [capMsg, setCapMsg] = useState(false)
  const lastNonce = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // a fresh selection (star, or any highlight while open) → set it as the pending reference.
  // preventScroll is CRITICAL: focusing while the panel is mid slide-in (translateX) made the
  // browser scroll the whole document sideways to reveal the input — the "page pushes left" bug.
  useEffect(() => {
    // nonce-guarded so re-renders with the same seed never double-apply (esp. snips)
    if (seedNonce !== lastNonce.current) {
      lastNonce.current = seedNonce
      if (quote) {
        setRef(quote)
        setRefDoc(docRef ?? null)
      }
      if (snip) {
        setSnips((prev) => {
          const r = appendSnip(prev, snip)
          if (r.dropped) {
            setCapMsg(true)
            setTimeout(() => setCapMsg(false), 2500)
          }
          return r.list
        })
      }
    }
    inputRef.current?.focus({ preventScroll: true })
  }, [seedNonce, quote, snip, docRef]) // quote/docRef/snip all ride the nonce

  const scrollToEnd = () => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }
  useEffect(scrollToEnd, [messages.length])

  async function send(explicit?: string) {
    const text = (explicit ?? input).trim()
    const usedSnips = snips
    if ((!text && usedSnips.length === 0) || sending) return
    const usedRef = ref.trim()
    const usedDoc = refDoc
    const history = sanitizeHistory(messages)
    // Label the passage by page(s): "(page 4)" for one, "(pages 4–5)" for a start/end span,
    // omitted entirely when no page could be resolved from the selection.
    const pageLabel =
      usedDoc && usedDoc.pages.length > 0
        ? usedDoc.pages.length > 1
          ? ` (pages ${usedDoc.pages[0]}–${usedDoc.pages[usedDoc.pages.length - 1]})`
          : ` (page ${usedDoc.pages[0]})`
        : ''
    const apiMessage = usedRef
      ? usedDoc
        ? `Regarding this passage from the company's quarterly report${pageLabel}: "${usedRef}"\n\n${text}`
        : `Regarding this quote from the investor call: "${usedRef}"\n\n${text}`
      : text
    // Snips can be sent without typed text — a default question keeps the model pointed.
    const outMessage = apiMessage || dict.chat.snipDefault
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: text,
        apiContent: outMessage,
        reference: usedRef || undefined,
        snips: usedSnips.length ? usedSnips : undefined,
      },
      { role: 'assistant', content: '', streaming: true },
    ])
    setInput('')
    setRef('')
    setRefDoc(null)
    setSnips([])
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
        {
          message: outMessage,
          companyId: companyId ?? undefined,
          transcriptId,
          liveContext,
          history,
          documentRef: usedDoc ? { documentId: usedDoc.documentId, pages: usedDoc.pages } : undefined,
          attachments: usedSnips.length ? usedSnips : undefined,
        },
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
    // in-call chat dock — Harvey (design round 2, probed): 347px, docked full-height,
    // hairline border-s, no heavy edge shadow (the panel is flat, the panes float)
    <aside className="aa-panel call-hair hidden w-[347px] shrink-0 flex-col border-s lg:flex">
      {/* Harvey: flat panel header — no separator line, level with the identity header */}
      <header className="flex h-[58px] flex-none items-center justify-between gap-2 pe-3.5 ps-5">
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
                {heroLine2 ?? dict.live.askHeroLine2}
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
            // Every part of the user's turn hugs the PHYSICAL right in both locales — founder
            // decision 2026-08-02, matching the main chat surface. The stack deliberately carries
            // NO `items-end`: that is logical, so in Hebrew it pushed the whole turn to the left.
            // Each child instead takes `ml-auto`, which absorbs the free space on the physical left
            // in any direction AND (being a cross-axis auto margin) stops the child stretching, so
            // the boxes still shrink to their content. Text direction is untouched — the bubble
            // keeps dir="auto" and the reference keeps detectDir(), so each reads per its own
            // language inside a box that no longer moves.
            <div key={i} className="flex animate-fade-up flex-col gap-1">
              {m.snips && m.snips.length > 0 && (
                // Pinge: what Atlas saw stays visible in the history (trust moment)
                <div className="ml-auto flex max-w-[92%] flex-wrap justify-end gap-1.5" dir="ltr">
                  {m.snips.map((s, j) => (
                    <img
                      key={j}
                      src={s.dataUrl}
                      alt={`${dict.chat.pageShort} ${s.page}`}
                      className="call-hair h-20 w-auto max-w-[170px] rounded-[8px] border bg-white object-contain"
                    />
                  ))}
                </div>
              )}
              {m.reference && (
                // Flat reference attachment, call-themed (flips with Dark/Light).
                <div
                  dir={detectDir(m.reference)}
                  className="call-hair call-panel-bg ml-auto max-w-[92%] rounded-[8px] border px-3 py-2"
                >
                  <div className="call-faint mb-1 flex items-center gap-1.5 text-2xs font-medium">
                    <QuoteIcon size={11} />
                    {dict.chat.referringTo}
                  </div>
                  {/* transcript-like air (founder round 3): the marked passage should read as
                      nicely in the chat as it does in the transcript */}
                  <p className="call-muted line-clamp-4 text-[12.5px] leading-[1.8]">{m.reference}</p>
                </div>
              )}
              {m.content && (
                <div
                  dir="auto"
                  className="call-raised-bg call-ink ml-auto max-w-[92%] rounded-[14px] rounded-br-[4px] px-3.5 py-2 text-sm leading-relaxed"
                >
                  {m.content}
                </div>
              )}
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
        {snips.length > 0 && (
          // Pinge chip stack: thumbnail + page label + remove, above the reference block
          <div className="mb-2.5 flex flex-wrap gap-2" dir="ltr">
            {snips.map((s, i) => (
              <div key={i} className="call-hair relative rounded-[10px] border bg-white p-1">
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
                  onClick={() => setSnips((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -end-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                >
                  <CloseIcon size={11} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
        {capMsg && <div className="call-muted mb-2 text-[11.5px]">{dict.chat.snipCap}</div>}
        {ref && (
          <div className="call-hair mb-2.5 flex items-start gap-2 rounded-[14px] border px-[11px] py-[9px]">
            <span className="call-muted mt-0.5 flex-none">
              <QuoteIcon size={12} />
            </span>
            <div
              dir={detectDir(ref)}
              className="call-ink line-clamp-4 min-w-0 flex-1 text-[12.5px] leading-[1.8]"
            >
              {ref}
            </div>
            <button
              type="button"
              onClick={() => {
                setRef('')
                setRefDoc(null)
              }}
              title={dict.common.remove}
              className="call-muted mt-0.5 flex flex-none transition-colors hover:call-ink"
            >
              <CloseIcon size={14} strokeWidth={1.7} />
            </button>
          </div>
        )}
        {/* Harvey composer (design round 2, probed): 12px corners, gray field on the panel,
            input row above an icon row — scissors (Pinge, when a document pane is open)
            at the start, round send at the end. */}
        <div className="call-hair call-panel-bg rounded-[12px] border px-3.5 pb-2.5 pt-3">
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
            className="call-ink max-h-[120px] w-full resize-none bg-transparent pb-[3px] pt-[2px] text-[14.5px] leading-[1.45] outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            {/* scissors is ALWAYS visible (founder round-2 note) — enabled only while a
                real document pane is mounted (snipBridge); otherwise a quiet disabled state */}
            <button
              type="button"
              title={dict.live.snip}
              aria-label={dict.live.snip}
              onClick={armSnip}
              disabled={!(snipAvailable && snipTarget)}
              /* hover ink via the Tailwind `ink` token, NOT `call-ink` — that one is a plain
                 globals.css class, so `hover:call-ink` compiles to nothing (both resolve to
                 #0A0A0A, so this is the same colour the class would have painted) */
              className="call-muted grid h-[28px] w-[28px] place-items-center rounded-[8px] transition-colors enabled:hover:text-ink disabled:opacity-35"
            >
              <ScissorsIcon size={15} strokeWidth={1.8} />
            </button>
            <span className="flex items-center gap-1.5">
              {/* voice-ask affordance (design aa-ic row) — future feature, visibly disabled */}
              <button
                type="button"
                title={dict.live.voiceSoon}
                aria-label={dict.live.voiceSoon}
                disabled
                className="call-muted grid h-[28px] w-[28px] place-items-center rounded-[8px] opacity-50"
              >
                <MicIcon size={15} strokeWidth={1.7} />
              </button>
              <button
                type="button"
                aria-label={dict.common.save}
                onClick={() => void send()}
                disabled={sending || (!input.trim() && snips.length === 0)}
                className="call-send-btn grid h-[30px] w-[30px] flex-none place-items-center rounded-full transition-opacity disabled:opacity-40"
              >
                <ArrowUpIcon size={15} strokeWidth={2} />
              </button>
            </span>
          </div>
        </div>
        {/* what Atlas is connected to, per context (design round 2 captions) */}
        <p className="call-muted mt-2 px-1 text-center text-[11.5px] leading-[1.5]">
          {liveContext !== undefined
            ? dict.live.askFollowLive
            : transcriptId
              ? dict.live.askConnectedCall
              : dict.live.askConnectedCompany}
        </p>
      </div>
    </aside>
  )
}
