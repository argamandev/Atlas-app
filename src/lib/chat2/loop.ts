// ─────────────────────────────────────────────────────────────────────────────
// THE TOOL LOOP — the new backend's engine (spec §3, ticket 06).
//
// EVENTS ARE OUT-OF-BAND (the slice-1 BLOCKER this ticket kills). The old
// route re-emitted raw model text as the whole HTTP body, so an upstream
// failure could only speak by writing Hebrew sentinel prose INTO that same
// channel — indistinguishable from a real answer once persisted. Here the
// stream is a sequence of typed `ChatEvent`s; `error`/`degraded` are their own
// event types, never spliced into `delta` text. A caller that ignores the
// distinction still cannot render an error as content, because there is no
// code path that puts error text in a `delta`.
//
// PARTIAL IS NEVER "COMPLETE". The loop always ends in exactly one terminal
// event — `done` (finished cleanly) or `error` (ended early) — and the caller
// decides persistence from THAT, never by inferring completion from the
// absence of further deltas.
//
// ROUND-TRIP CAP (§5 budget: ≤ ~4 round-trips per answer) bounds runaway tool
// use; hitting it ends the turn as a visible degradation, not a silent cutoff.
// ─────────────────────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk'
import { TOOL_DEFS, type ChatScope, type ToolResult } from './toolDefs'
import { buildSystemPrompt } from './systemPrompt'
import { verifyCitation } from './citations'

export const MODEL = 'claude-sonnet-5'
export const MAX_ROUND_TRIPS = 4
export const MAX_TOKENS = 4096

// Straight or curly double quotes / Hebrew gershayim — the punctuation this repo's
// corpus and the system prompt both ask the model to quote WITH.
const QUOTE_RE = /["“][^"“”]{4,400}["”]/g

function extractQuotes(text: string): string[] {
  return (text.match(QUOTE_RE) ?? []).map((m) => m.slice(1, -1))
}

/**
 * VERIFIED AT WRITE (spec §2.4 — law). Every quote the model's final answer
 * claims is checked against the pool of source text this turn's tools actually
 * returned — the ONE choke point every answer passes through (M3.1), never a
 * per-tool guess. `sourcePool` is the fact this decides on: the real fenced
 * content, not a proxy for it.
 */
function unverifiedQuotes(answerText: string, sourcePool: string): string[] {
  const quotes = extractQuotes(answerText)
  return quotes.filter((q) => !verifyCitation({ quote: q, sourceContent: sourcePool }).ok)
}

export type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; status: 'start' | 'end'; isError?: boolean }
  | { type: 'degraded'; reason: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

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
 * Runs the loop end-to-end and yields framed events. Never throws — every
 * failure mode (missing key, upstream error, round-trip exhaustion) ends the
 * generator with an `error` or `degraded` event followed by `done` never
 * following a mid-stream failure as if it were success.
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
      const answerText = textBlocks.map((b) => b.text).join('')
      const bad = sourcePool ? unverifiedQuotes(answerText, sourcePool) : []
      // Nothing quoted, or nothing to check against because no tool ever ran —
      // an ungrounded answer is an honesty question for the system prompt, not
      // this choke point, so only an actually-invented QUOTE is rejected here.
      if (bad.length > 0 && !citationRetried) {
        citationRetried = true
        messages.push({ role: 'assistant', content: response.content })
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Citation check failed: the following quoted text was not found verbatim in any ' +
                'source you were given this turn — quote the source exactly, or say you cannot ' +
                `verify the claim: ${bad.map((q) => `"${q}"`).join(' | ')}`,
            },
          ],
        })
        continue
      }
      if (bad.length > 0) {
        yield { type: 'degraded', reason: 'a quoted claim could not be verified against its source' }
      }
      for (const block of textBlocks) {
        if (block.text) yield { type: 'delta', text: block.text }
      }
      yield { type: 'done' }
      return
    }

    for (const block of textBlocks) {
      if (block.text) yield { type: 'delta', text: block.text }
    }

    messages.push({ role: 'assistant', content: response.content })

    const activeHandlers = await ensureHandlers()
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const use of toolUses) {
      const handler = activeHandlers[use.name]
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
        if (!result.isError) sourcePool += '\n' + result.content
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

  // Round-trip cap hit with tools still in flight — visible degradation, never a silent cutoff.
  yield {
    type: 'degraded',
    reason: 'reached the tool round-trip limit before finishing — try a narrower question',
  }
  yield { type: 'done' }
}
