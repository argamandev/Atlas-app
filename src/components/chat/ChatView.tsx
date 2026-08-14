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
import { streamChat } from '@/lib/api/chat'
import type { ChatSource } from '@/lib/chat/grounding'
import {
  sanitizeCallTruncated,
  sanitizeContextStatus,
  sanitizeTruncated,
  truncatedForPersist,
  type ProjectContextStatus,
} from '@/lib/chat/messageState'
import { streamChatV2, type ClientIncompleteCode } from '@/lib/api/chat2'
import { incompleteMessage } from '@/lib/chat/incompleteCopy'
import { chatMode, type ChatMode } from '@/lib/chat2/mode'
import { ErrorLine } from '@/components/projects/ErrorLine'
import { createConversation, saveConversation, fetchConversation } from '@/lib/api/conversations'
import { companyDisplayName, type Company } from '@/lib/api/types'
import { fetchCompany } from '@/lib/api/companies'

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
  /**
   * A failure attached to this turn — kept OUT of `content` on purpose.
   *
   * The error used to be written into `content`, so a raw server string
   * ("unauthorized", or a Postgres relation message) rendered in the place a
   * Hebrew answer belongs, styled exactly as if Atlas had said it. And because
   * the persistence step runs AFTER the answer has streamed in full, that also
   * DESTROYED a good answer and replaced it with the reason it could not be
   * saved. Held as the thrown value rather than its message so an expired
   * session can be told apart from a model failure.
   */
  error?: unknown
  /**
   * Which half failed. `answer` = nothing arrived. `truncated` = the stream
   * broke partway, so the text on screen is REAL but incomplete. `save` = the
   * answer finished and only persistence failed.
   *
   * Three, not two. A first version keyed off `full.length > 0` and folded
   * `truncated` into `save`, telling the user "this answer arrived but was not
   * saved" about half an answer — presenting an incomplete reply as a complete
   * one, which is the exact class this branch exists to remove.
   */
  errorKind?: 'answer' | 'truncated' | 'save'
  /**
   * The persisted counterpart of `errorKind === 'truncated'`. `errorKind`
   * describes THIS session's failure and dies on reload; this is the fact that
   * has to outlive it, so a reopened thread still says the answer is partial
   * instead of presenting half an answer as the whole one.
   */
  truncated?: boolean | null
  /**
   * The v2 backend's answer to "why is this not whole", as a CODE (ticket 07).
   *
   * Deliberately NOT folded into `errorKind`. The two describe different things
   * and merging them would lose the distinction the backend spent three review
   * rounds building: `errorKind` is a failure of the REQUEST — the stream broke,
   * the save failed, nothing arrived. `incomplete` is a successful request whose
   * ANSWER is partial, and it carries which of nine reasons applies so a
   * Hebrew-first surface can say the true one (`lib/chat/incompleteCopy.ts`).
   *
   * An answer can hold both: an `incomplete` turn that then fails to save shows
   * "this answer is partial" AND "it was not stored", because both are true.
   */
  incomplete?: ClientIncompleteCode | null
  /**
   * The CALL this answer is grounded in did not fit in one turn (ticket 08b).
   *
   * A third distinct fact, deliberately not folded into `incomplete` or
   * `truncated`: those two describe the ANSWER — it stopped early, or the stream
   * broke. This one describes the INPUT. An answer can be complete, whole and
   * saved, and still have been written from the first two thirds of the call the
   * chip above it names. Merging it into either neighbour would tell the user
   * their answer was cut off, which is a different and untrue statement.
   *
   * PERSISTED, and the first draft of this branch had it session-only with a
   * comment arguing that a reopened thread should stay silent because "nothing
   * re-derives it". Cold review called that a BLOCKER and it was right: the
   * server MEASURED this and said so on its `grounding` event, so storing it
   * records a measurement rather than inventing one — and the version being
   * defended was one refresh away from showing a partly-grounded answer as a
   * whole one, which is exactly what `truncated` above exists to prevent.
   */
  callTruncated?: boolean
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
  /**
   * The call this chat is scoped to. `company` and `quarter` stay SEPARATE
   * because the chip renders them as a Hebrew run beside a Latin one
   * ("תיגבור · Q3 2025"), and the bidi law wants a `<bdi>` per run — impossible
   * once they have been concatenated upstream into one opaque label.
   */
  initialTranscript?: { id: string; company: string; quarter: string } | null
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
  /** Which open is current — see openConversation(). */
  const openSeq = useRef(0)
  // Set when a PAST conversation was deliberately opened. Distinct from
  // `conversationId`, which is also set the moment a brand-new thread is
  // persisted — that one must not take over an embedded surface.
  const [conversationOpen, setConversationOpen] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ─── WHICH BACKEND THIS VIEW TALKS TO (ticket 07 / B1b) ───────────────────
  //
  // `/api/chat/v2` is the unified backend (spec §3): typed events, tool loop,
  // corpus grounding, visible degradation. It does NOT accept `projectId`, and a
  // project chat's whole point is that the project's instructions, memory and
  // notes are injected server-side — sending those turns to v2 would silently
  // answer without them, which is the invisible degradation this migration
  // exists to end, committed by the migration itself.
  //
  // So project chats stay on the old route until B2 retires it, which is the
  // documented migration order (spec §6, ticket 06: "Old /api/chat keeps serving
  // clients until B2"). This is a temporary fork with a named owner, not a
  // permanent branch. B2 removes it along with `streamChat`.
  //
  // TRANSCRIPT CHATS WERE THE SECOND HALF OF THIS FORK, AND ARE NOW ON V2
  // (ticket 08b). `/app/chat?transcript=…` ("open in chat" from a call) renders a
  // chip naming that call; until whole-call injection existed, v2 had no code that
  // read a transcript id, so sending those turns to it answered from the general
  // corpus while the chip still promised the call. `chat2/callInjection.ts` is
  // that code, and the turn now ends visibly when the call cannot be loaded.
  //
  // ONE RULE, unchanged: a surface goes to v2 only when v2 can honour every
  // grounding that surface displays. That is still what this line says — it now
  // has one arm instead of two, because a project chat's instructions, memory and
  // notes are injected by the OLD route and by nothing else. Sending those turns
  // to v2 would answer without them silently, which is the invisible degradation
  // this migration exists to end. The old route therefore stays alive for project
  // chats, for the live-captions panel and for the multiview document/snip
  // grounding — named in ticket 08 as what the next slice owes.
  const useV2 = !projectId

  /**
   * The grounding mode of the CURRENT turn, as the server reported it.
   *
   * `null` before the first answer — deliberately not defaulted to 'search',
   * because a default is a guess and the whole point of the mode being a server
   * event is that the surface never guesses it (spec §2.3).
   */
  const [reportedMode, setReportedMode] = useState<ChatMode | null>(null)

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

  /**
   * The v2 backend resolved a company mid-turn (`resolve_company`, spec §2.2).
   *
   * Adopt it as this conversation's scope — the answer on screen was grounded in
   * that company, and the next turn must be too, or the chip and the answer
   * disagree. Then go and get its NAME: a chip saying "pinned" without saying to
   * WHAT is a notice the user cannot act on, and acting on it (switching back to
   * search, or correcting the company) is the entire point of showing the mode.
   *
   * A failed lookup clears the name rather than leaving a STALE one — showing the
   * previously-pinned company's name beside a different company's id is worse
   * than showing no name at all.
   */
  async function adoptResolvedCompany(id: string) {
    setCompanyId(id)
    try {
      const { company } = await fetchCompany(id)
      setCompanyName(companyDisplayName(company, locale))
    } catch {
      setCompanyName(null)
    }
  }

  async function send(explicit?: string) {
    const text = (explicit ?? input).trim()
    if (!text || sending) return
    const priorMessages = messages
    // A PARTIAL PRIOR TURN IS LABELLED PARTIAL TO THE MODEL TOO.
    //
    // The surface knows an earlier answer was cut off — it renders a notice
    // saying so. Replaying it as a plain `{role:'assistant', content}` told the
    // model the opposite: that a sentence ending mid-clause was a finished reply,
    // which it will then happily build on. The same fact the user is shown is now
    // the fact the model gets, from the same two fields the persistence path
    // reads (`incomplete` this session, `truncated` after a reload).
    // THROUGH THE CHOKE POINT, not a second opinion beside it (M3.1). The first
    // version of this read `incomplete || truncated` — its own two-field guess at
    // a question `truncatedForPersist` already answers from THREE fields. It
    // missed `errorKind: 'truncated'`, a stream that broke this session, which is
    // reachable on exactly the route `useV2` keeps alive for project and
    // transcript chats. One function decides "is this answer partial", and both
    // the storage path and the model now ask it.
    const history = messages.map((m) => ({
      role: m.role,
      content:
        m.role === 'assistant' && truncatedForPersist(m)
          ? `${m.content}\n\n[This answer was cut off before it finished — it is not complete.]`
          : m.content,
    }))
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
    // The v2 outcome, held in an OBJECT rather than two `let`s. Both are written
    // only inside the event callback, and TypeScript narrows a `let x: T | null =
    // null` back to `null` when every assignment lives in a closure — so the
    // checks below would be flagged as unintentional comparisons and, worse,
    // could be "simplified" away by someone trusting the narrowing.
    const outcome: {
      incomplete: ClientIncompleteCode | null
      error: string | null
      callTruncated: boolean
      source: ChatSource | null
    } = {
      incomplete: null,
      error: null,
      callTruncated: false,
      source: null,
    }
    // Did the model's stream finish? Distinguishes a mid-stream break from a
    // failure that happened AFTER a complete answer arrived. `full.length > 0`
    // cannot tell those apart — a stream that broke halfway also has content —
    // and labelling a truncated answer "arrived but was not saved" presents an
    // incomplete answer as a complete one, which is the defect this branch
    // exists to remove rather than relocate.
    let streamFinished = false
    try {
      // `source` lives on `outcome` for the reason stated at its declaration: it
      // is now written inside the v2 event closure (the `grounding` case), so as
      // a plain `let … = null` TypeScript narrows it back to `null` and the read
      // below looks like a constant. `projectContext` is NOT — it is assigned
      // synchronously from `streamChat`'s return on the old-route branch, where
      // that narrowing does not apply.
      let projectContext: ProjectContextStatus | null = null

      if (useV2) {
        await streamChatV2(
          {
            message: apiMessage,
            // ONE recipe, and the CALL WINS when this view has both. A chat opened
            // from a call carries that call's company too, and the two are not
            // alternatives at the same altitude: the chip on screen names the
            // call, so the call is what the answer owes its grounding to. Sending
            // the company instead would search that company's whole corpus and
            // answer under a chip promising one specific call.
            grounding: transcript
              ? { kind: 'call', transcriptId: transcript.id }
              : companyId
                ? { kind: 'company', companyId }
                : { kind: 'none' },
            history,
          },
          (e) => {
            switch (e.type) {
              case 'delta':
                full += e.text
                setLastAssistant({ content: full })
                scrollToEnd()
                break
              case 'mode':
                setReportedMode(e.mode)
                // The server resolved a company we did not know about — the
                // `@mention`-free path into pinpoint mode. Adopt it, so the chip
                // on screen and the scope of the NEXT turn agree with what
                // actually grounded this answer.
                if (e.companyId && e.companyId !== companyId) void adoptResolvedCompany(e.companyId)
                break
              case 'grounding':
                // The two facts v2 could not express until 08b. `source` is the
                // citation chip the old route carried on `x-chat-source` — the
                // same fact, from the same row, so migrating this surface does
                // not cost it the chip it already had. `state` is the honesty
                // half: a call too long to read in full produces an answer built
                // on part of it, and that must not look like an answer built on
                // the call. Recorded, not rendered mid-stream, exactly like
                // `incomplete` below.
                outcome.source = e.source
                outcome.callTruncated = e.state === 'truncated'
                break
              case 'incomplete':
                // The text already on screen is REAL — it just is not all of it.
                // Recorded, not rendered here: the notice goes out with the
                // settled message below so it cannot flash mid-stream.
                outcome.incomplete = e.code
                break
              case 'error':
                outcome.error = e.message
                break
              case 'tool':
              case 'done':
                break
            }
          }
        )
        // `error` is the backend saying nothing usable came back — a FAILURE, not
        // a partial answer. It goes down the existing error path, and
        // `streamFinished` stays false so it cannot be mislabelled "this answer
        // arrived but was not saved".
        if (outcome.error) throw new Error(outcome.error)
      } else {
        const res = await streamChat(
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
        outcome.source = res.source
        projectContext = res.projectContext
      }
      streamFinished = true
      setLastAssistant({
        content: full,
        source: outcome.source,
        projectContext,
        incomplete: outcome.incomplete,
        callTruncated: outcome.callTruncated,
        streaming: false,
      })

      // Persist the full thread — create the conversation lazily on the first exchange.
      // `projectContext` rides along so the notice SURVIVES a reload. It used to
      // live only in view state, so refreshing the page turned "answered without
      // your project's context" into an answer that looked complete — the
      // degradation was visible exactly until the user did the most ordinary
      // thing possible. Prior messages carry theirs through unchanged.
      const fullThread = [
        ...priorMessages
          // A turn that FAILED leaves an assistant message with empty content —
          // its error lives in `error`/`errorKind`, which are view state and are
          // not persisted. Writing it through anyway stored `{role:'assistant',
          // content:''}`, so reloading the thread showed the user's question
          // followed by a silently blank reply: the fix for "an error rendered
          // as an answer" had traded it for "nothing rendered at all", which
          // rules/app.md ranks as the worse of the two. Drop the empty turn; the
          // question stands on its own and nothing claims to be a reply.
          .filter((m) => !(m.role === 'assistant' && m.content.trim().length === 0))
          .map((m) => ({
            role: m.role,
            content: m.content,
            projectContext: m.projectContext ?? null,
            // Carry the "this one is partial" fact into storage. Without it the
            // partial text persists as an ordinary complete answer, because it
            // has content and therefore survives the filter above.
            truncated: truncatedForPersist(m),
            // The INPUT-partial fact, carried through unchanged like
            // `projectContext`. Prior turns keep whatever they were saved with,
            // whether they were written this session or read back from storage.
            callTruncated: m.callTruncated ?? null,
          })),
        { role: 'user' as const, content: text },
        // The stream RESOLVED — which under v2 is no longer the same question as
        // "the answer is whole". A turn that ended `incomplete` finishes its
        // stream perfectly normally and resolves this promise, so hard-coding
        // `truncated: false` here (correct for the old route, where only a broken
        // stream meant partial) would persist a cut-off answer as a complete one:
        // the round-three BLOCKER, re-entering through the honesty machinery
        // built to prevent it. Taken from the terminal event instead.
        {
          role: 'assistant' as const,
          content: full,
          projectContext: projectContext ?? null,
          // THROUGH THE CHOKE POINT, like every other answer to this question.
          // `outcome.incomplete != null` inline was correct today and was still
          // the wrong shape: it is a second opinion sitting one screen below the
          // history mapper, where the identical inline guess had just been
          // removed for missing a field. One function decides "is this partial".
          truncated: truncatedForPersist({ incomplete: outcome.incomplete }),
          // Taken from the server's `grounding` event, which is a measurement —
          // so this survives a reload instead of dying with the session and
          // leaving a partly-grounded answer looking whole.
          callTruncated: outcome.callTruncated,
        },
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
      // NEVER `content: err.message`. `full` is whatever actually streamed in:
      // if the failure came from createConversation/saveConversation the answer
      // is complete and correct, and the only true statement is that it was not
      // saved. Leaving `content` alone keeps it on screen.
      setLastAssistant({
        streaming: false,
        error: err,
        errorKind: streamFinished ? 'save' : full.length > 0 ? 'truncated' : 'answer',
      })
    } finally {
      setSending(false)
    }
  }

  async function openConversation(id: string) {
    // ONE sequence counter, here, because this function is what both surfaces
    // call. The children each grew their own guard a round ago, which covered
    // their own REJECTIONS and nothing else: two counters that cannot see each
    // other, and neither watching the success path. So clicking row A (slow)
    // then row B (fast) let A's late resolution overwrite B — the user reading
    // a conversation they did not open, with the sidebar highlighting the one
    // they did. A superseded open now returns silently, success or failure,
    // which also retires the cross-surface stale-rejection case.
    const seq = ++openSeq.current
    let conv: Awaited<ReturnType<typeof fetchConversation>>
    try {
      conv = await fetchConversation(id)
    } catch (e) {
      // Only the CURRENT open may report a failure. An error about a
      // conversation the user has already navigated away from describes the
      // wrong thing.
      if (seq !== openSeq.current) return
      throw e
    }
    if (seq !== openSeq.current) return
    setConversationId(conv.id)
    // The mode is not persisted, so a reopened thread's mode is UNKNOWN. Leaving
    // the previous conversation's mode on screen would describe the wrong thread;
    // defaulting to 'search' would state a fact nothing measured. Both are the
    // same error, so it goes back to null and the next turn reports the truth.
    setReportedMode(null)
    // Sanitised, not trusted: `messages` is a jsonb blob that predates this
    // field, so rows written by older code have none and anything unrecognised
    // must land on null rather than on a rendered warning.
    setMessages(
      conv.messages.map((m) => ({
        role: m.role,
        content: m.content,
        projectContext: sanitizeContextStatus(m.projectContext),
        truncated: sanitizeTruncated(m.truncated),
        callTruncated: sanitizeCallTruncated(m.callTruncated),
      }))
    )
    // Last, and only on success: a rejected fetch must leave the surface where
    // it was so the caller's error banner is what the user sees.
    setConversationOpen(true)
  }

  function newChat() {
    setConversationId(null)
    setConversationOpen(false)
    setMessages([])
    setInput('')
    setQuote(null)
    // Back to unknown, NOT to 'search'. The mode is a fact the server reports
    // about an actual turn; asserting one before any turn has run is the guess
    // this whole design exists to avoid.
    setReportedMode(null)
  }

  const empty = messages.length === 0

  /**
   * The mode SHOWN, which is not always the last mode the server REPORTED.
   *
   * Found by looking (verify-app, both locales): after tapping "pin to a
   * company" the chip went on claiming SEARCH MODE while the `@company` chip sat
   * directly beside it — two controls on one row contradicting each other, which
   * is worse than either alone and is exactly the untrue-UI class this surface is
   * supposed to close. `mode` is a fact about the last turn, and the user has
   * just changed the scope of the NEXT one.
   *
   * This is not the client-side guess the design forbids: `chatMode` is the same
   * pure function the server decides with, over the same single fact, so both
   * ends compute one answer from one vocabulary. Before the user has pinned
   * anything the server's report still governs — only it can know what
   * `resolve_company` did mid-turn.
   *
   * AND THE RAW STATE IS NAMED `reportedMode` FOR A REASON. The first fix here
   * changed the two chips and MISSED the hint line one JSX block below, which
   * went on saying "no company was identified" directly under the `@company`
   * chip — the same contradiction, in the same commit that fixed it, because
   * `mode` was still sitting there looking like the right variable to reach for.
   * Renaming it makes the wrong choice announce itself at the call site (M3.3):
   * nothing in the render should want a mode that is only "what the server last
   * reported". Every JSX branch reads `shownMode`.
   */
  /**
   * A CALL-GROUNDED CHAT HAS NO MODE TO SHOW (ticket 08b).
   *
   * `mode` answers "is this pinned to a company, or searching the market", and
   * `chatMode` decides it from the one fact it rests on: a resolved company. A
   * call grounding resolves no company, so the server honestly reports `search`
   * — and rendering that produces "Search mode · pin a company" sitting directly
   * beside a chip naming one specific call, which is the same two-controls-
   * contradicting-each-other defect this file already fixed once for the pin
   * button. The answer IS grounded in the call; the market is not being searched.
   *
   * So the mode is not shown here at all, rather than shown as something else:
   * the transcript chip already says what this chat is grounded in, and a second
   * chip could only agree with it (noise) or disagree with it (a lie).
   */
  const shownMode: ChatMode | null = transcript ? null : companyId ? chatMode({ companyId }) : reportedMode

  // Composer block — shared between the empty (centered) and active (pinned-bottom) states.
  const composer = (
    <div className="relative mx-auto w-full max-w-2xl">
      {/* context tags (company / transcript). The quoted excerpt now lives inside the
          composer as its warm reference header (unified two-toned box). */}
      {/* `companyId` LEADS THIS CONDITION (round-3 review). The inner branches
          were fixed to gate on the scope rather than the name, but this enclosing
          one still asked for `companyName` — so on the OLD route (project chat,
          where `useV2` is false and `shownMode` cannot rescue it) a real company
          scope with a missing name rendered no row at all, and the fix one level
          down never got the chance to run. Fixing the inner guard while the outer
          one still decides on a proxy is the same defect wearing a smaller hat
          (M3.1/M3.2). */}
      {/* NOTE there is no `companyName` here. It would be redundant — every path
          that sets a name sets the id with it — and it is the only way this row
          could render EMPTY: a name without an id passes the condition while
          every inner branch (all keyed on the id) declines. An empty chip row is
          a fabricated state, so the condition asks the same fact the branches do. */}
      {(companyId || transcript || (useV2 && shownMode)) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {/* GATED ON `companyId`, NOT ON THE NAME (round-2 review). When the
              server resolved a company mid-turn and `adoptResolvedCompany`'s name
              lookup then failed, the name was null while the SCOPE was real — so
              this chip, the unpin button and the search chip all rendered
              nothing, and the chat sat silently pinned to a company the user
              could neither see nor undo. A scope that exists must be visible; an
              unnamed one says "a company" rather than disappearing. */}
          {/* AND NOT WHEN A CALL IS THE GROUNDING (ticket 08b). "Open in chat"
              from a call seeds both the call and its company, but only one of
              them can be the recipe — the call wins, and it is the call that is
              sent. A company chip beside it would promise a company-wide scope
              the request does not carry: the surface claiming a grounding the
              backend never received, which is ticket 07's defect pointing the
              other way. One chip, naming what the answer is actually built on. */}
          {companyId && !transcript && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-xs text-ink-muted">
              {initialCompany?.logoUrl && companyName && (
                <Logo src={initialCompany.logoUrl} name={companyName} size={16} />
              )}
              {/* A company name can be Hebrew, Latin or both ("אלביט Systems").
                  Its own <bdi> so each run resolves independently and one Latin
                  word cannot flip the chip; `dir` stays on the container (<html>),
                  never on this mixed line — rules/app.md's bidi law. The "@" is a
                  bare sign and belongs outside the <bdi>. */}
              <span className="font-medium text-ink">
                @<bdi>{companyName ?? dict.chat.pinnedUnknownCompany}</bdi>
              </span>
            </span>
          )}
          {transcript && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-xs text-ink-muted">
              {/* A `<bdi>` PER RUN, `dir` on the container (<html>) — never on
                  this line. "תיגבור · Q3 2025" is Hebrew beside Latin, so
                  `dir="auto"` would resolve the whole chip from the first strong
                  character and flip the quarter to the wrong side. The separator
                  is neutral and stays outside both isolates. */}
              <span className="font-medium text-ink">
                <bdi>{transcript.company}</bdi>
                {transcript.company && transcript.quarter ? ' · ' : ''}
                <bdi>{transcript.quarter}</bdi>
              </span>
            </span>
          )}
          {/* SEARCH MODE IS SHOWN, AND IS ONE TAP FROM PINPOINT (spec §2.3).
              The mode is decided from scope alone and never inferred from the
              question — so when it is the wrong mode for what the user meant, the
              only thing that can notice is the user. This chip is how they
              notice, and the button beside it is how they fix it. That pair IS
              the "visible failure" app.md's classifier law asks to be bought
              instead of a longer word list.

              Only in search mode: in pinpoint the company chip above already
              says what the answer is grounded in, and a second chip repeating it
              would be noise. */}
          {useV2 && shownMode === 'search' && (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-xs text-ink-muted"
            >
              <span className="font-medium text-ink">{dict.chat.searchMode}</span>
              <span className="text-ink-faint">·</span>
              <button
                type="button"
                onClick={() => {
                  // Straight into the @-mention flow — the same door the user
                  // would have used, rather than a second way to pick a company.
                  setInput((v) => (v.endsWith('@') || v === '' ? v + '@' : v + ' @'))
                  setMentionQuery('')
                  inputRef.current?.focus()
                }}
                className="underline underline-offset-2 hover:text-ink"
              >
                {dict.chat.pinCompany}
              </button>
            </span>
          )}
          {/* The mirror tap: leave a company and search the whole market. Shown
              only when a company is actually pinned, so it never offers to undo
              something that is not there. */}
          {/* Also gated on the SCOPE, not the name — the escape hatch has to
              exist for exactly the case where the name is missing. */}
          {useV2 && shownMode === 'pinpoint' && companyId && (
            <button
              type="button"
              onClick={() => {
                setCompanyId(null)
                setCompanyName(null)
                setReportedMode('search')
              }}
              className="rounded-full px-2.5 py-1 text-xs text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              {dict.chat.unpinCompany}
            </button>
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
      {/* WHY the answers above look like leads rather than one narrative. Without
          this, per-company diversified results read as Atlas rambling across
          companies instead of as the deliberate market-wide shape they are — the
          mode would be technically visible (the chip) and still not understood.
          Only once a thread is running: on the blank screen there is no answer
          for it to explain. */}
      {useV2 && !empty && shownMode === 'search' && (
        <p className="mt-2 px-1 text-center text-2xs text-ink-faint">{dict.chat.searchModeHint}</p>
      )}
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
                {/* The failure, BESIDE the answer rather than instead of it. When
                    `errorKind` is 'save' the text above is a real answer that
                    arrived and simply was not stored — saying "Atlas could not
                    answer" there would be false, and overwriting it (which this
                    used to do) threw away work the user had already been given. */}
                {/* THE ANSWER IS REAL BUT NOT WHOLE (ticket 07). Rendered from
                    the CODE, never from the server's English `reason` — that is
                    the entire purpose of the backend sending a code, and a
                    Hebrew surface parsing English prose to pick a sentence would
                    be the classifier app.md forbids.

                    Beside the answer, not instead of it: the text above streamed
                    in and is genuine, and hiding it would be its own invisible
                    degradation. This sits ABOVE the {error} line because a turn
                    can honestly carry both — a partial answer that then failed to
                    save is two true statements, not a choice between them. */}
                {/* THE INPUT WAS PARTIAL, WHICH IS NOT THE SAME CLAIM AS "the
                    answer was cut off" (ticket 08b). The call was longer than one
                    turn can carry, so the model read its opening. The answer
                    below may be complete and correct AND built on part of the
                    call — both true at once, which is why this renders alongside
                    the notices below rather than instead of one of them. */}
                {m.callTruncated && !m.streaming && (
                  <p role="status" dir="auto" className="mt-2 text-[12.5px] leading-[1.5] text-[#B0533E]">
                    {dict.chat.callTruncated}
                  </p>
                )}
                {m.incomplete && !m.streaming && (
                  <p role="status" dir="auto" className="mt-2 text-[12.5px] leading-[1.5] text-[#B0533E]">
                    {incompleteMessage(dict.chat.incomplete, m.incomplete)}
                  </p>
                )}
                {/* A reopened thread. `errorKind` died with the session, so
                    without this the partial text below would read as a complete
                    answer. No {error} here — the failure that caused it is not
                    known any more, and inventing one would be worse than saying
                    only what is true: this answer is not all of it. */}
                {/* `!m.incomplete` so a live v2 turn shows the SPECIFIC reason
                    above, not that one plus this generic restatement of it. */}
                {m.truncated === true && !m.incomplete && m.error == null && !m.streaming && (
                  <p role="status" dir="auto" className="mt-2 text-[12.5px] leading-[1.5] text-[#B0533E]">
                    {dict.chat.answerWasTruncated}
                  </p>
                )}
                {m.error != null && !m.streaming && (
                  <p role="alert" dir="auto" className="mt-2 text-[12.5px] leading-[1.5] text-[#B0533E]">
                    <ErrorLine
                      template={
                        m.errorKind === 'save'
                          ? dict.chat.notSaved
                          : m.errorKind === 'truncated'
                            ? dict.chat.answerTruncated
                            : dict.chat.answerFailed
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
      {/* `conversationOpen`, not just `messages.length`: a conversation row CAN
          resolve with zero messages (db/conversations.ts inserts the row before
          the first exchange is saved, so a failure in between leaves a real but
          empty row in the project's list). Keyed on the length alone, clicking
          that row re-rendered the project page unchanged — no navigation, no
          error, nothing. A dead click is a silent failure, and the row is the
          only route into that conversation. Opening one now always lands you IN
          it, empty or not, with a composer to continue from. */}
      {embedded && messages.length === 0 && !conversationOpen ? embedded : content}
    </CollapsiblePanel>
  )
}
