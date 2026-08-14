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
import { defang } from './fence'

export const MODEL = 'claude-sonnet-5'
export const MAX_ROUND_TRIPS = 4
export const MAX_TOKENS = 4096

// Straight or curly double quotes AND the Hebrew gershayim `״` (U+05F4) — the
// punctuation this repo's corpus and system prompt ask the model to quote with.
// Round 1's review caught the comment claiming gershayim while the character was
// absent from the class: a Hebrew answer quoting `״…״` was never extracted, so it
// was never verified, and it passed as though it had been checked. `citations.ts`
// already normalises `״`; only the EXTRACTOR was blind to it.
//
// The upper bound is a real, stated limit: a quote longer than MAX_QUOTE_CHARS is
// not extracted and therefore not verified. It is set high enough to cover any
// quote the corpus's own chunking can produce (~2,200 chars at the largest split).
const MAX_QUOTE_CHARS = 2400
const QUOTE_RE = new RegExp(`["“״][^"“”״]{4,${MAX_QUOTE_CHARS}}["”״]`, 'g')

function extractQuotes(text: string): string[] {
  return (text.match(QUOTE_RE) ?? []).map((m) => m.slice(1, -1))
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

/**
 * The three TERMINAL event types. Exported so a caller can exhaustively switch on
 * them and so the battery can assert the set has not quietly grown a fourth.
 */
export const TERMINAL_EVENTS = ['done', 'incomplete', 'error'] as const

export type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; status: 'start' | 'end'; isError?: boolean }
  /** TERMINAL. The model finished cleanly. The ONLY event that means complete. */
  | { type: 'done' }
  /**
   * TERMINAL. Ended early — the deltas so far are real but the turn is not
   * finished. RENDER FROM `code`, never from `reason`: `reason` is English
   * developer prose, and the degradation law wants this on screen in both
   * locales (ticket 07's surface is Hebrew-first).
   */
  | { type: 'incomplete'; code: IncompleteCode; reason: string }
  /** TERMINAL. Nothing usable came back. */
  | { type: 'error'; message: string }

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

  const messages: Anthropic.MessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.content }) as Anthropic.MessageParam),
    { role: 'user', content: message },
  ]

  const system = buildSystemPrompt({ todayIsrael, scopeSummary })

  // The pool every citation this turn is checked against — the raw content every
  // tool actually returned, not a summary of it. Grows across round-trips; a claim
  // grounded in round-1's search result is still verifiable after round-3's lookup.
  let sourcePool = ''
  let citationRetried = false
  // Two facts the terminal decision needs, and they are NOT the same question as
  // "is sourcePool empty" — round 2's hole. A turn whose every tool failed has an
  // empty pool AND ran tools; a turn that never called a tool has an empty pool and
  // did not. The first must end `incomplete` (nothing could be grounded OR verified);
  // the second is an ordinary ungrounded answer, which is the prompt's problem.
  let anyToolRan = false
  let anySourceSurvived = false
  // EVERY delta this turn sends, accumulated at the one point they are yielded.
  // The terminal facts are derived from THIS, not from the last API response, so
  // no text can reach the user without having been quote-checked.
  let emittedText = ''

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
