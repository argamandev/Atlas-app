'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { streamChatV2, type ClientIncompleteCode, type Grounding } from '@/lib/api/chat2'
import type { DocumentContextState } from '@/lib/chat2/protocol'
import { incompleteMessage } from '@/lib/chat/incompleteCopy'
import { ErrorLine } from '@/components/projects/ErrorLine'
import type { ChatSource, ChatSnip } from '@/lib/chat/grounding'
import { sanitizeHistory } from '@/lib/chat/history'
import { appendSnip } from '@/lib/documents/snip'
import { armSnip, getSnipTarget, subscribeSnipTarget } from '@/lib/live/snipBridge'
import { askSubject, subjectHasAudio, type AskSubject } from '@/lib/live/askGrounding'
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
  /** what the ROUTE actually received (reference-labeled / snip default) — replayed as history */
  apiContent?: string
  reference?: string
  snips?: ChatSnip[]
  source?: ChatSource | null
  streaming?: boolean
  /** v2 only: the answer is real but not whole, with the reason as a CODE. */
  incomplete?: ClientIncompleteCode | null
  /**
   * v2 only: the CALL this answer is grounded in did not fit in one turn, so the
   * model read a prefix of it. A fact about the INPUT, not about the answer —
   * see the same field on ChatView's `Msg` for why the two must not be merged.
   *
   * Not persisted here, and that is not the same judgement call ChatView's is:
   * this panel stores no thread at all, so there is no reload for the fact to
   * survive. If it ever persists, this needs ChatView's treatment.
   */
  callTruncated?: boolean
  /**
   * How the ATTACHED REPORT reached the model on this turn (08c-3).
   *
   * A SEPARATE FIELD from `callTruncated`, never a widened one. A multiview turn
   * can be a whole call beside a cut report page, or a cut call beside a whole
   * page, and both notices are true at once — one flag for the pair would name
   * the wrong half of the screen. Held per message rather than read off a prop
   * because it varies by TURN: a user attaches a snip to one question and
   * nothing to the next, in the same panel.
   */
  documentContext?: DocumentContextState | null
  /**
   * The failure, held as the THROWN VALUE and kept out of `content`.
   *
   * This panel used to do `setLast({ content: (err as Error).message })`, which
   * rendered a raw server string — "unauthorized", a Postgres relation message —
   * in the place a Hebrew answer belongs, styled exactly as if Atlas had said it,
   * and destroyed whatever had already streamed in. The main chat surface fixed
   * that shape; this is the same fix, on the same law.
   */
  error?: unknown
}

export function TranscriptChatPanel({
  grounding,
  quote,
  seedNonce,
  docRef,
  snip,
  onClose,
  snipAvailable,
}: {
  /**
   * WHAT THIS PANEL'S ANSWERS ARE GROUNDED IN. **Required** since 08c-3.
   *
   * It used to be optional, and the optionality was load-bearing: unset meant
   * "send this turn to the old `/api/chat`", which was the only route that could
   * honour multiview's marked-PDF pages and snipped images. v2 honours them now,
   * that route is deleted, and there is nowhere for an ungrounded turn to go —
   * so the field is required and every call site names its recipe.
   *
   * WHY THAT IS THE SAFE DIRECTION rather than a tidy-up. `chooseChatRoute`'s
   * default fell to `legacy` precisely because a surface that has not said what
   * it is grounded in has not earned the new backend, and quietly sending it to
   * v2 as a blank market-wide chat is the downgrade the union exists to prevent.
   * With the fallback gone, an unset grounding could ONLY become that downgrade —
   * so it is made unrepresentable instead (M3.3). A caller with genuinely no
   * grounding says `{kind:'none'}` out loud, which is a real recipe.
   *
   * THE LIVE CAPTIONS TRAVEL IN HERE (08c-2), in the `live` recipe, rather than
   * in a `liveContext` prop beside it. That was the same fact in a second place:
   * the panel's own guard checked the grounding for attachments and forgot
   * `liveContext`, a review finding the shape itself invited.
   */
  grounding: Grounding
  quote: string
  /** bumps every time a fresh selection is referenced (star or, while open, any highlight) */
  seedNonce: number
  /** multiview: the pending reference came from the report PDF (document + pages) */
  docRef?: { documentId: string; pages: number[] } | null
  /** Pinge: a fresh snip to attach (rides seedNonce like docRef) */
  snip?: ChatSnip | null
  onClose: () => void
  /** design round 2: a snippable document pane is open → show the composer scissors */
  snipAvailable?: boolean
}) {
  const { dict } = useI18n()

  // WHO THIS PANEL'S COPY IS ABOUT — decided once, over the whole Grounding union,
  // in `lib/live/askGrounding.ts`. The hero, the audio promise and the caption all
  // read it, so they cannot disagree with each other or with the request. Three
  // separate inline conditions here is what made this a three-round review series.
  const subject = askSubject(grounding)
  const HERO_LINE2: Record<AskSubject, string> = {
    call: dict.live.askHeroLine2,
    live: dict.live.askHeroLine2,
    company: dict.live.askHeroCompany,
    workspace: dict.live.askHeroWorkspace,
    market: dict.live.askHeroMarket,
  }
  const CAPTION: Record<AskSubject, string> = {
    call: dict.live.askConnectedCall,
    live: dict.live.askFollowLive,
    company: dict.live.askConnectedCompany,
    workspace: dict.live.askConnectedWorkspace,
    market: dict.live.askConnectedMarket,
  }
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
    // Written only inside the v2 event callback, so it is held in an object —
    // TypeScript narrows a `let x: T | null = null` back to `null` when every
    // assignment lives in a closure, and the checks below would then read as
    // unintentional comparisons.
    const outcome: {
      incomplete: ClientIncompleteCode | null
      error: string | null
      callTruncated: boolean
      // `source` lives in here for the SAME reason the others do, which the
      // comment above states and the first draft then ignored two lines later:
      // it is written only inside the event closure, so as a `let … = null` it
      // narrows back to `null` and the `setLast` below reads as a constant.
      source: ChatSource | null
      /** How the ATTACHED REPORT reached the model, when one rode this turn. */
      documentContext: DocumentContextState | null
    } = {
      incomplete: null,
      error: null,
      callTruncated: false,
      source: null,
      documentContext: null,
    }
    try {
      // ONE BACKEND (08c-3). There is no route choice left to make: v2 now
      // honours every grounding this panel can display — the company, the stored
      // call, the live captions — AND the two things that kept `/api/chat` alive
      // through three slices, a marked report passage and a snipped page image,
      // which ride the turn as a fenced page block and as IMAGE CONTENT BLOCKS.
      //
      // `chooseChatRoute` and the per-turn fallback it decided are gone with the
      // route they chose between. What replaces them is not a widened fallback
      // but the absence of one: nothing on this screen is left unfulfilled, which
      // is the only condition under which the rule the fork enforced — *a surface
      // goes to v2 only when v2 can honour every grounding it displays* — is
      // satisfied by having no fork at all.
      await streamChatV2(
        {
          message: outMessage,
          grounding,
          history,
          // ONLY WHEN IT NAMES PAGES. `PdfViewer.onMouseUp` resolves the page
          // numbers from the selection's endpoints, and a selection whose
          // endpoints both fail that lookup yields `pages: []` — a documentRef
          // that asks for nothing. The gate collapses it to "no document", which
          // is correct, but sending it at all made the request claim a grounding
          // it did not carry.
          //
          // AND NOTHING IS OWED TO THE SCREEN HERE, which is why this is not a
          // notice: the reference block shows the marked PASSAGE, and that
          // passage is composed verbatim into `outMessage` above. The answer is
          // grounded in exactly what the user can see. What an empty page list
          // loses is the surrounding page prose, which the screen never promised.
          documentRef:
            usedDoc && usedDoc.pages.length > 0
              ? { documentId: usedDoc.documentId, pages: usedDoc.pages }
              : undefined,
          attachments: usedSnips.length ? usedSnips : undefined,
        },
        (e) => {
          switch (e.type) {
            case 'delta':
              full += e.text
              setLast({ content: full })
              scrollToEnd()
              break
            case 'grounding':
              outcome.source = e.source
              // BOTH halves of the event, not just the chip. Recording `source`
              // and dropping `state` renders a call read in part exactly like a
              // call read whole — the degradation this event exists to carry,
              // discarded at the one surface that receives it.
              outcome.callTruncated = e.state === 'truncated'
              break
            case 'documentContext':
              // The attached report's own state, kept SEPARATE from
              // `callTruncated`. A multiview turn can be a whole call beside a
              // cut report page, or the reverse, and one flag for both would
              // name the wrong half of the screen.
              outcome.documentContext = e.state
              break
            case 'incomplete':
              outcome.incomplete = e.code
              break
            case 'error':
              outcome.error = e.message
              break
            case 'mode':
            case 'tool':
            case 'projectContext':
            case 'done':
              break
          }
        }
      )
      // `error` is the backend saying nothing usable came back — a failure, not
      // a partial answer, so it goes down the error path rather than being
      // rendered as a reason beside an answer that does not exist.
      if (outcome.error) throw new Error(outcome.error)
      setLast({
        content: full,
        source: outcome.source,
        incomplete: outcome.incomplete,
        callTruncated: outcome.callTruncated,
        documentContext: outcome.documentContext,
        streaming: false,
      })
    } catch (err) {
      // NEVER `content: err.message`. Whatever streamed in is a real answer and
      // stays on screen; the failure is said BESIDE it (rules/app.md — a raw
      // server string must never render where an answer belongs).
      setLast({ streaming: false, error: err })
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
              {/*
                THE HERO, THE SUB-LINE AND THE CAPTION ALL NAME `subject`, which
                `askSubject` decides once over the whole Grounding union. Three
                separate inline conditions here is what made this a three-round
                series: each round fixed the one that had just been caught and left
                the others, and every one of them ended in a catch-all that said
                "this company" for anything unrecognised.
              */}
              <span className="aa-w block" style={{ animationDelay: '.24s' }}>
                {HERO_LINE2[subject]}
              </span>
            </h1>
            {/*
              THE SUB-LINE IS A PROMISE ABOUT AUDIO — "the audio keeps playing while
              you ask" — false wherever there is no recording. A missing line is not
              a lie; that one was.
            */}
            {subjectHasAudio(subject) && (
              <p
                className="aa-w call-muted mt-3.5 max-w-[28ch] text-[13px] leading-[1.55]"
                style={{ animationDelay: '.4s' }}
              >
                {dict.live.askHeroSub}
              </p>
            )}
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
              {/* The answer is REAL but not whole, rendered from the CODE and
                  never from the server's English `reason` — this panel is
                  Hebrew-first, and picking a sentence by string-matching English
                  prose is the classifier app.md forbids. Beside the answer, not
                  instead of it. */}
              {/* The INPUT was partial — a different claim from "the answer was
                  cut off", and both can be true at once. */}
              {m.callTruncated && !m.streaming && (
                <p role="status" dir="auto" className="mt-2 text-[12.5px] leading-[1.5] text-[#B0533E]">
                  {/* WHICH HALF WAS DROPPED depends on the recipe, and saying
                      the wrong one names the exact stretch the model did not
                      read. A stored call is injected from the top; live captions
                      are injected from the most recent end (`liveInjection.ts`).
                      Read off the prop rather than stored per message because a
                      panel's grounding KIND cannot change while it is mounted —
                      the live host is live for its whole life. */}
                  {grounding.kind === 'live' ? dict.chat.liveTruncated : dict.chat.callTruncated}
                </p>
              )}
              {/* The ATTACHED REPORT, said separately from the call above —
                  both can be true on one multiview turn, and a shared line
                  would name the wrong half of the screen. `ok` renders
                  nothing: it is the undegraded case, and a green notice under
                  every snip would train the user to stop reading this line. */}
              {m.documentContext === 'truncated' && !m.streaming && (
                <p role="status" dir="auto" className="mt-2 text-[12.5px] leading-[1.5] text-[#B0533E]">
                  {dict.chat.reportTruncated}
                </p>
              )}
              {m.documentContext === 'failed' && !m.streaming && (
                <p role="status" dir="auto" className="mt-2 text-[12.5px] leading-[1.5] text-[#B0533E]">
                  {dict.chat.reportFailed}
                </p>
              )}
              {m.incomplete && !m.streaming && (
                <p role="status" dir="auto" className="mt-2 text-[12.5px] leading-[1.5] text-[#B0533E]">
                  {incompleteMessage(dict.chat.incomplete, m.incomplete)}
                </p>
              )}
              {/* The failure, beside whatever did arrive. `ErrorLine` is what
                  turns an expired session into "sign in" rather than into the
                  word "unauthorized" sitting where an answer belongs. */}
              {m.error != null && !m.streaming && (
                <p role="alert" dir="auto" className="mt-2 text-[12.5px] leading-[1.5] text-[#B0533E]">
                  <ErrorLine
                    template={
                      // Text on screen + a failure = the answer broke partway.
                      // The main chat surface deliberately does NOT decide this
                      // from the content length, because there a failure can also
                      // arrive AFTER a complete answer (persistence) and calling
                      // that "cut off" would be false. This panel persists
                      // nothing, so there is no third case here for the length to
                      // be blind to — if that changes, this needs the same
                      // `streamFinished` split ChatView carries.
                      m.content.trim().length > 0 ? dict.chat.answerTruncated : dict.chat.answerFailed
                    }
                    error={m.error}
                    auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
                  />
                </p>
              )}
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
        {/*
          WHAT ATLAS IS CONNECTED TO — the same `subject` the hero names, so the two
          cannot disagree. It used to read a separate `transcriptId` prop; two inputs
          for one sentence is two chances to be wrong, and this one was.
        */}
        <p className="call-muted mt-2 px-1 text-center text-[11.5px] leading-[1.5]">{CAPTION[subject]}</p>
      </div>
    </aside>
  )
}
