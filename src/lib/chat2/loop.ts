// ─────────────────────────────────────────────────────────────────────────────
// THE TOOL LOOP — the new backend's engine (spec §3, ticket 06).
//
// EVENTS ARE OUT-OF-BAND (the slice-1 BLOCKER this ticket kills). The old
// route re-emitted raw model text as the whole HTTP body, so an upstream
// failure could only speak by writing Hebrew sentinel prose INTO that same
// channel — indistinguishable from a real answer once persisted. Here the
// stream is a sequence of typed `ChatEvent`s; `error`/`incomplete` are their own
// event types, never spliced into `delta` text. A caller that ignores the
// distinction still cannot render an error as content, because there is no
// code path that puts error text in a `delta`.
//
// PARTIAL IS NEVER "COMPLETE" — and this is enforced by the TYPE, not by a
// guard (M3.3). Round 1's cold review found the first version failed exactly
// here: it ended a truncated turn with `done`, the same terminal event a clean
// answer ends in, and merely emitted a non-terminal `degraded` beforehand. A
// caller writing the obvious `if (e.type === 'done') persist()` therefore
// persisted a cut-off answer as a finished one — the defect this file exists to
// kill, rebuilt one level up.
//
// So there are exactly THREE terminal events and no way to conflate them:
//   `done`       — the model finished cleanly. The only one that means complete.
//   `incomplete` — the turn ended early, with a `code` and a `reason`. The text
//                  already emitted is still delivered; hiding it would be its own lie.
//   `error`      — nothing usable came back.
//
// TWO SEPARATE CLAIMS, and keeping them apart is the law here (round 2 rejected
// merging them): it is IMPOSSIBLE that one terminal event means both, because the
// types are distinct; it is TESTED that the right one is chosen, because
// `terminal.ts` decides it as a pure function swept exhaustively. The type does
// not and cannot make the CHOICE correct.
//
// AND THE FACTS ARE TAKEN AT THE EMIT POINT (round 3). The facts fed to that pure
// function used to come from the last API response, so a quote streamed in a
// pre-tool preamble was never checked — the function then decided confidently and
// wrongly on a proxy (M3.2). `emittedText` accumulates at the single
// `yield {type:'delta'}`, so the facts describe what the USER SAW. Three rounds,
// three different layers, the same lesson: put the invariant where everything
// passes through, and give it the fact rather than something shaped like it.
// ─────────────────────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk'
import { TOOL_DEFS, type ChatScope, type ToolResult } from './toolDefs'
import { buildSystemPrompt } from './systemPrompt'
import { verifyCitation } from './citations'
import { decideTerminal, type IncompleteCode } from './terminal'
import { chatMode, modeChanged, type ChatMode } from './mode'
import { defang } from './fence'
import { buildCallBlock, type CallForInjection } from './callInjection'
import {
  buildProjectBlock,
  PROJECT_UNAVAILABLE_SUMMARY,
  type ProjectContextState,
  type ProjectForInjection,
} from './projectInjection'

export const MODEL = 'claude-sonnet-5'
export const MAX_ROUND_TRIPS = 4
export const MAX_TOKENS = 4096

// ─── QUOTE VERIFICATION IS OFF. Read this before switching it back on. ───────
//
// FOUNDER DECISION 2026-08-14, at round 4 of this branch's cold review. Not a
// simplification and not a TODO: the check as built is WRONG FOR HEBREW, which is
// this product's primary language, and being off is strictly better than being on
// and wrong.
//
// WHY. In Hebrew the double quote is also the ACRONYM sign — ש״ח (shekels),
// בע״מ (Ltd), דו״ח (report), מנכ״ל (CEO). Any punctuation-based extractor pairs
// two ordinary abbreviations into a span that was never a quotation. Measured on
// the real sentence `הרווח הנקי של החברה בע"מ הסתכם ב-5 מיליון ש"ח.`, the
// extractor returned `מ הסתכם ב-5 מיליון ש` — from an answer that was correct and
// faithfully grounded. That fabrication then failed verification, spent a whole
// extra model call retrying, and ended the turn `incomplete{unverified_quote}`.
// **Every Hebrew answer naming shekels twice did this**, so the failure sat on the
// happy path, not an edge.
//
// THE COLLISION IS ORIGINAL, not a regression: the first version of this regex
// (`["“][^"“”]{4,400}["”]`, before any review round) matched that sentence too.
// Adding `״` at round 1 widened it. Four review rounds went by before anyone ran
// an ordinary Hebrew sentence through it — while three of those rounds hardened
// the machinery DOWNSTREAM of this check, making a systematically wrong signal
// more reliably visible.
//
// WHY NOT A BETTER REGEX. `app.md`: *when a decision rests on a natural-language
// classifier over an open vocabulary, buy VISIBLE FAILURE, not a longer word
// list.* Adding a character to a class is the longer word list. Hebrew genuinely
// spells quotation and abbreviation with the same mark, so no character class
// separates them. The real fix is to stop INFERRING quotes from prose: have the
// model return citations structurally, where there is no ambiguity to classify.
// That is a change to the model contract and is its own ticket.
//
// WHAT IS TRUE WHILE THIS IS OFF, and it must be said out loud rather than
// implied: a quote in an answer is NOT verified against its source. The fencing,
// the scoping and the terminal-event honesty are all unaffected — `unverifiedQuotes`
// is simply always 0, so the loop never invents a degradation it cannot justify.
// Tracked in `docs/open-findings.md` and in ticket 06.
export const QUOTE_VERIFICATION_ENABLED = false

function extractQuotes(_text: string): string[] {
  if (!QUOTE_VERIFICATION_ENABLED) return []
  // Deliberately unreachable until citations are structural — see above. Left as a
  // marker of where the replacement lands, NOT as a regex waiting to be re-enabled.
  return []
}

/**
 * VERIFIED AT WRITE (spec §2.4 — law). Every quote the model's final answer
 * claims is checked against the pool of source text this turn's tools actually
 * returned — the ONE choke point every answer passes through (M3.1), never a
 * per-tool guess. `sourcePool` is the fact this decides on: the real fenced
 * content, not a proxy for it.
 *
 * WHAT THIS DOES NOT PROVE, stated because round 1's review found the docstring
 * claiming otherwise: the pool is the concatenation of EVERY tool result this
 * turn, so this establishes "these words appear in something you were shown",
 * NOT "they appear in the document you attributed them to". A quote lifted
 * correctly from company A's filing still verifies while the sentence around it
 * credits company B. Closing that needs per-source attribution carried through
 * the fence and checked against the citation's own anchor — a real gap, filed in
 * `docs/open-findings.md`, and NOT something to read this function as covering.
 */
function unverifiedQuotes(answerText: string, sourcePool: string): string[] {
  const quotes = extractQuotes(answerText)
  return quotes.filter((q) => !verifyCitation({ quote: q, sourceContent: sourcePool }).ok)
}

// The event vocabulary IS the interface between this loop and every surface, so
// it is declared once in `protocol.ts` and imported by both sides (08a.2). It
// used to be declared here AND re-declared in `api/chat2.ts`, with the code list
// existing a third time there as a runtime array marked "kept in sync". Both are
// re-exported because a caller of the loop reasons in terms of them.
export { TERMINAL_EVENTS } from './protocol'
export type { ChatEvent } from './protocol'
import type { ChatEvent } from './protocol'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface RunChatLoopArgs {
  client: Pick<Anthropic, 'messages'>
  scope: ChatScope
  history: ChatTurn[]
  message: string
  todayIsrael: string
  scopeSummary?: string
  /** Injectable for tests; defaults to the real registry. */
  handlers?: Record<string, (input: Record<string, unknown>) => Promise<ToolResult>>
  /**
   * Loads the call named by `scope.transcriptId`. Injectable for the same reason
   * `handlers` is: the real one reaches Supabase at module load.
   *
   * `null` means the call is not there (deleted, or never existed). It is
   * DISTINCT from a thrown error only in the message the user gets — both end the
   * turn, because both mean the chip on screen is promising a grounding that did
   * not happen.
   */
  loadCall?: (transcriptId: string) => Promise<CallForInjection | null>
  /**
   * Loads the project named by `scope.projectId`. Injectable for the same reason
   * `loadCall` is — the real one reaches Supabase through the caller's own client.
   *
   * `null` means the project is not there FOR THIS CALLER (deleted, or someone
   * else's under RLS). Unlike `loadCall`, neither `null` nor a throw ends the
   * turn: see `projectInjection.ts` for why a missing modifier is reported and
   * answered around, while a missing SOURCE is not.
   */
  loadProject?: (projectId: string) => Promise<ProjectForInjection | null>
}

/**
 * Runs the loop end-to-end and yields framed events. Never throws, and always
 * ends in exactly ONE terminal event, which is always the last thing yielded:
 * `done` only when the model finished cleanly, `incomplete` for every early
 * ending (round-trip cap, a non-clean `stop_reason`, an unverifiable citation),
 * `error` when nothing usable came back. A mid-stream failure can therefore
 * never be read as success by a caller that switches on the terminal event.
 */
export async function* runChatLoop(args: RunChatLoopArgs): AsyncGenerator<ChatEvent> {
  const { client, scope, history, message, todayIsrael, scopeSummary } = args
  // Loaded lazily, and only when actually needed: `tools.ts` imports `@/lib/supabase`,
  // which constructs a client at module load — a cost (and an env-var requirement) a
  // caller that never triggers a tool call should not pay, and tests that inject their
  // own `handlers` should never pay at all.
  let handlers = args.handlers
  const ensureHandlers = async () => {
    if (!handlers) handlers = (await import('./tools')).buildToolHandlers(scope)
    return handlers
  }

  // ─── WHOLE-CALL INJECTION (spec §2.3, ticket 08b) ──────────────────────────
  //
  // A call-grounded turn gets that call in the prompt, whole, BEFORE the first
  // model call — not through a tool, because the user is looking at the call and
  // the surface has already named it. Retrieval over a document the user is
  // pointing at would answer from the best-matching window instead of from the
  // thing on screen.
  //
  // THE FAILURE PATH IS THE POINT. If the call cannot be loaded, this returns
  // `error` and no model call happens. Answering anyway would produce a fluent,
  // corpus-grounded reply underneath a chip naming a call that reached nothing —
  // success UI for content the server dropped, which is the exact defect that
  // took `transcriptId` off this scope in ticket 07. It is cheaper AND more
  // honest to end here.
  let callBlock: ReturnType<typeof buildCallBlock> | null = null
  if (scope.transcriptId) {
    let loaded: CallForInjection | null
    try {
      const load = args.loadCall ?? (await import('./callSource')).loadCallForInjection
      loaded = await load(scope.transcriptId)
    } catch (err) {
      yield { type: 'error', message: `the call could not be loaded: ${(err as Error).message}` }
      return
    }
    if (!loaded) {
      yield { type: 'error', message: 'this call is no longer available' }
      return
    }
    callBlock = buildCallBlock(loaded)
    // AFTER the load, never before: this event is the surface's evidence that the
    // grounding actually happened, so emitting it optimistically would make it
    // evidence of nothing.
    yield { type: 'grounding', state: callBlock.truncated ? 'truncated' : 'whole', source: callBlock.source }
  }

  const messages: Anthropic.MessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.content }) as Anthropic.MessageParam),
    {
      role: 'user',
      // The call rides on THIS turn's user message rather than in the system
      // prompt. The system block is the cache-stable prefix (`systemPrompt.ts`),
      // and a 60,000-char call pushed in front of it would vary per request —
      // destroying the one property that block's ordering exists to preserve.
      content: callBlock ? `${callBlock.text}\n\n${message}` : message,
    },
  ]

  // ─── PROJECT-CONTEXT INJECTION (ticket 08c) ────────────────────────────────
  //
  // AFTER the call block is built and BEFORE the system prompt, because it feeds
  // that prompt. A project's written layer is a MODIFIER on the turn, not its
  // source, so unlike the call above it composes with every grounding — a chat
  // inside a project can be pinned to a company by `@mention` and this still
  // applies. That is the whole reason `projectId` is a field beside the
  // `Grounding` union rather than a fifth variant of it (`requestScope.ts`).
  //
  // AND UNLIKE THE CALL, A FAILURE DOES NOT END THE TURN. The corpus, the tools
  // and any company scope are all still there, so an answer is still worth
  // having — written without the user's standing instructions, and SAYING SO on
  // both sides: `projectContext: 'failed'` to the surface, which persists it on
  // the message, and `PROJECT_UNAVAILABLE_SUMMARY` to the model, so the answer
  // does not sound fully informed underneath that notice.
  let projectBlockText = ''
  let projectState: ProjectContextState | null = null
  if (scope.projectId) {
    let project: ProjectForInjection | null = null
    try {
      const load =
        args.loadProject ??
        (async (id: string) => {
          if (!scope.userDb) return null
          const { loadProjectForInjection } = await import('./projectSource')
          return loadProjectForInjection(id, scope.userDb)
        })
      project = await load(scope.projectId)
    } catch {
      // Swallowed to `failed` ON PURPOSE, and this is the one place in this file
      // that swallows anything. A load that ERRORED and a project that is GONE
      // are the same fact to the user — "your project's context is not in this
      // answer" — and the surface has exactly one notice for it. Inventing a
      // second state the copy does not cover would be a distinction that only
      // ever reached a log. The developer-facing detail is not lost: the query
      // layer logs it, and the state is emitted either way.
      project = null
    }
    if (project) {
      const built = buildProjectBlock(project)
      projectBlockText = built.text
      projectState = built.state
    } else {
      projectState = 'failed'
    }
    // Emitted AFTER the load, never optimistically — same rule as the `grounding`
    // event above. This event is the surface's evidence about what happened, so
    // sending it before the thing it describes makes it evidence of nothing.
    yield { type: 'projectContext', state: projectState }
  }

  const system = buildSystemPrompt({
    todayIsrael,
    scopeSummary,
    // The project rides the VOLATILE tail (`systemPrompt.ts`), which is appended
    // after the cache-stable static prefix — so a per-project string never
    // disturbs the prefix the cache matches on. `failed` still contributes text:
    // the model has to be told the context is missing, or it answers as though
    // the project had none and contradicts the notice on screen.
    projectContext: projectState === 'failed' ? PROJECT_UNAVAILABLE_SUMMARY : projectBlockText || undefined,
  })

  // The pool every citation this turn is checked against — the raw content every
  // tool actually returned, not a summary of it. Grows across round-trips; a claim
  // grounded in round-1's search result is still verifiable after round-3's lookup.
  // AN INJECTED CALL IS A SOURCE, and seeding the pool with it is not tidiness.
  // The verification guard downstream is `sourcePool ? verify : skip`, so a
  // call-grounded turn — which can legitimately answer without calling a single
  // tool, that being the entire point of injecting the call — would run with
  // citation checking switched OFF while holding the one document the answer is
  // built on. That is the round-2 hole in `terminal.ts` arriving through a new
  // door. (Verification itself is off today; this makes the pool correct for when
  // it returns, rather than leaving a hole for it to return into.)
  let sourcePool = callBlock ? '\n' + callBlock.text : ''
  let citationRetried = false
  // Two facts the terminal decision needs, and they are NOT the same question as
  // "is sourcePool empty" — round 2's hole. A turn whose every tool failed has an
  // empty pool AND ran tools; a turn that never called a tool has an empty pool and
  // did not. The first must end `incomplete` (nothing could be grounded OR verified);
  // the second is an ordinary ungrounded answer, which is the prompt's problem.
  let anyToolRan = false
  // The injected call counts, for the same reason it seeds the pool: it is a
  // source that survived. It does not change any branch today (`anySourceSurvived`
  // is only consulted when a tool ran) — it is set so the fact stays true rather
  // than accidentally true.
  let anySourceSurvived = callBlock !== null
  // EVERY delta this turn sends, accumulated at the one point they are yielded, so
  // `anyTextEmitted` describes what the USER SAW rather than what the last API
  // response happened to contain. It does NOT mean every delta is quote-checked:
  // verification is off (see the flag above), and even when it returns, the check
  // necessarily runs after the deltas are already on screen — what it can change is
  // the terminal event, not the text. Round 4 caught the earlier wording here
  // claiming the stronger thing.
  let emittedText = ''

  // THE MODE, ANNOUNCED FROM ONE PLACE. `scope.companyId` is mutated in-place by
  // the `resolve_company` handler, so the mode can change mid-turn — and the only
  // honest way to render that is to say so when it happens. Both the opening
  // announcement and every later one go through this generator rather than
  // through an `if` at each site, so there is no path that changes the scope
  // without telling the surface (M3.1).
  let announcedMode: ChatMode | null = null
  function* announceMode(): Generator<ChatEvent> {
    const next = chatMode(scope)
    if (!modeChanged(announcedMode, next)) return
    announcedMode = next
    yield { type: 'mode', mode: next, companyId: scope.companyId ?? null }
  }

  yield* announceMode()

  for (let roundTrip = 0; roundTrip < MAX_ROUND_TRIPS; roundTrip++) {
    let response: Anthropic.Message
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools: TOOL_DEFS,
        messages,
      })
    } catch (err) {
      yield { type: 'error', message: (err as Error).message || 'the model provider failed' }
      return
    }

    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const isFinalAnswer = response.stop_reason !== 'tool_use' || toolUses.length === 0

    if (isFinalAnswer) {
      // The RETRY still looks only at the final message, because that is the only
      // text the model can still be asked to fix — a preamble delta is already on
      // the user's screen and cannot be unsent.
      const answerText = textBlocks.map((b) => b.text).join('')
      const bad = sourcePool ? unverifiedQuotes(answerText, sourcePool) : []
      // Is there actually a round-trip left to retry INTO? Round 1's review caught
      // a retry issued on the last iteration falling out of the loop entirely: the
      // answer text was discarded and the tail reported the round-trip cap as the
      // cause, for what was really a citation failure.
      const canRetry = roundTrip < MAX_ROUND_TRIPS - 1
      // Nothing quoted, or nothing to check against because no tool ever ran —
      // an ungrounded answer is an honesty question for the system prompt, not
      // this choke point, so only an actually-invented QUOTE is rejected here.
      if (bad.length > 0 && !citationRetried && canRetry) {
        citationRetried = true
        messages.push({ role: 'assistant', content: response.content })
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              // DEFANGED: the offending quote may itself have been lifted from a
              // hostile document, and this puts it back into the prompt. §2.2's law
              // is that every document-derived string is defanged before it
              // re-enters — a rule this retry was quietly exempting itself from.
              text:
                'Citation check failed: the following quoted text was not found verbatim in any ' +
                'source you were given this turn — quote the source exactly, or say you cannot ' +
                `verify the claim: ${bad.map((q) => `"${defang(q)}"`).join(' | ')}`,
            },
          ],
        })
        continue
      }
      // The deltas go out either way — withholding the text the model did produce
      // would be its own invisible degradation. What changes is the TERMINAL event,
      // decided in ONE place from the facts (`terminal.ts`).
      for (const block of textBlocks) {
        if (block.text) {
          emittedText += '\n' + block.text
          yield { type: 'delta', text: block.text }
        }
      }
      // BOTH facts are taken from EVERYTHING that reached the user (round 3): the
      // previous version derived them from the final message alone, so a model
      // could stream an invented quote in a pre-tool preamble, answer cleanly, and
      // end in `done` — the quote never checked because it was never in the final
      // message. `emittedText` is accumulated at the single `yield delta` point, so
      // the facts now describe what the USER actually saw rather than what the last
      // API response happened to contain. A fact taken anywhere but the choke point
      // is a proxy (M3.2), and this is the third time that distinction has bitten.
      yield decideTerminal({
        stopReason: response.stop_reason,
        anyTextEmitted: emittedText.trim().length > 0,
        unverifiedQuotes: sourcePool ? unverifiedQuotes(emittedText, sourcePool).length : 0,
        anySourceSurvived,
        anyToolRan,
        roundTripCapHit: false,
      })
      return
    }

    for (const block of textBlocks) {
      if (block.text) {
        emittedText += '\n' + block.text
        yield { type: 'delta', text: block.text }
      }
    }

    messages.push({ role: 'assistant', content: response.content })

    // INSIDE a try: round 2 measured a failing dynamic import throwing straight out
    // of the generator, ending the stream with ZERO terminal events — against the
    // docstring one screen up promising it never throws and always ends in exactly
    // one. A stream that simply stops is the least visible degradation there is.
    let activeHandlers: Record<string, (i: Record<string, unknown>) => Promise<ToolResult>>
    try {
      activeHandlers = await ensureHandlers()
    } catch (err) {
      yield { type: 'error', message: `tools unavailable: ${(err as Error).message}` }
      return
    }
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const use of toolUses) {
      const handler = activeHandlers[use.name]
      anyToolRan = true
      yield { type: 'tool', name: use.name, status: 'start' }
      if (!handler) {
        yield { type: 'tool', name: use.name, status: 'end', isError: true }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: `unknown tool "${use.name}"`,
          is_error: true,
        })
        continue
      }
      try {
        const result = await handler((use.input as Record<string, unknown>) ?? {})
        yield { type: 'tool', name: use.name, status: 'end', isError: result.isError }
        if (!result.isError) {
          anySourceSurvived = true
          sourcePool += '\n' + result.content
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: result.content,
          is_error: result.isError,
        })
      } catch (err) {
        yield { type: 'tool', name: use.name, status: 'end', isError: true }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: `tool failed: ${(err as Error).message}`,
          is_error: true,
        })
      }
    }
    // After the tools have run, because `resolve_company` sets `scope.companyId`
    // as a side effect — this is the point where a turn that began market-wide
    // becomes pinned to a company, and the surface has to be told.
    yield* announceMode()

    messages.push({ role: 'user', content: toolResults })
  }

  // Round-trip cap hit with tools still in flight. Through the SAME choke point as
  // every other ending, so there is exactly one place that decides what a terminal
  // event means and no path can grow its own answer to that question.
  yield decideTerminal({
    stopReason: null,
    anyTextEmitted: emittedText.trim().length > 0,
    unverifiedQuotes: sourcePool ? unverifiedQuotes(emittedText, sourcePool).length : 0,
    anySourceSurvived,
    anyToolRan,
    roundTripCapHit: true,
  })
}
