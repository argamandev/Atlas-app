import 'server-only'
import OpenAI from 'openai'
import { geminiSnipParts, openAiSnipContent, type ChatAttachment } from '@/lib/chat/attachments'

// ─────────────────────────────────────────────────────────────────────────────
// ONE MODEL CALL, TWO PROVIDERS, whichever answers first.
//
// Extracted from the intake route on 2026-08-04 when the workspace chat needed
// the same thing. The reasoning below is why it is a HEDGE and not a chain, and
// it is the whole reason the intake got fast — duplicating it by hand into a
// second route is how one copy quietly goes back to being a chain.
//
// Founder, 2026-08-04: *"it responds very slow, it needs to be a lot faster."*
// The dev log said why: a provider was returning 503 "high demand" and timing
// out, and the fallback only started once it had exhausted itself — 12s, 17s,
// 27s, one turn at 68s. Every one of those seconds was spent waiting on a model
// that was never going to answer while a working one sat idle.
//
// So the second model no longer waits its turn. The primary starts; if it has
// not answered within HEDGE_MS — or has already failed — the other starts
// alongside it, and the first USABLE answer wins. Latency stops being the sum
// of one provider's retries and becomes the minimum of two independent
// attempts.
//
// WHICH ONE LEADS, 2026-08-05 — the founder, of the workspace: *"replace the
// chat layer and API calls to ChatGPT because Gemini keeps on falling, and
// that's not good."* So OpenAI is now the primary and Gemini is the hedge, the
// exact reverse of how this shipped yesterday. Gemini is kept rather than
// deleted BECAUSE it only ever runs when the primary is slow or silent: it
// costs nothing on a healthy turn and is the reason a bad minute at one vendor
// is not a dead workspace. The complaint was "Gemini answers my questions
// badly/never", and after this change it answers almost none of them.
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-3.5-flash'
/** Same env override the main chat route reads, so the app runs ONE OpenAI model. */
const OPENAI_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4.1'

/** Budget for a request someone is watching. */
const DEFAULT_TIMEOUT_MS = 20_000
/**
 * How long the primary gets alone before the other is started alongside it.
 *
 * 1200ms, which is what this shipped with, was shorter than ANY grounded
 * completion this pipeline makes — the prompt carries up to 40k characters of
 * shelf — so the hedge did not fire "when the primary is slow", it fired every
 * single time, and the comment above claiming it "costs nothing on a healthy
 * turn" described behaviour that never happened once. Nothing aborted the
 * loser either, so every workspace question, every compose, every intake search
 * was billed twice, in full, at both vendors.
 *
 * 6s is past the normal answer and still well inside the 20s budget, so the
 * hedge does what it was built for — covering a vendor that has gone quiet —
 * without paying for a second opinion nobody reads. The loser is now aborted as
 * well; the two together are what make the fallback cheap enough to keep.
 */
const HEDGE_MS = 6_000

export type AskOptions = {
  maxOutputTokens: number
  /** Long-context reads (a whole transcript) need more than an interactive
   *  selection does; the caller knows which it is. */
  timeoutMs?: number
  /**
   * Pinge snips travelling with the question — the workspace's Ask Atlas can
   * clip a region of a PDF, and the clip is the question. Sent to BOTH
   * providers, so a hedged answer sees the same picture the primary did; an
   * answer written without the image the user attached would be worse than no
   * answer, and indistinguishable from a good one.
   */
  attachments?: ChatAttachment[]
  /** One caption per attachment, in the same order (see `snipCaption`). */
  captions?: string[]
}

/**
 * The model's raw text, or ''. NEVER throws: an unusable answer is a DEGRADED
 * request, not a failed one, and the caller decides what to say about it.
 * Failing here would turn a missing API key into "the workspace is broken".
 */
export async function askModel(prompt: string, opts: AskOptions): Promise<string> {
  // WHOEVER LOSES STOPS. A hedge that leaves the other request running pays for
  // an answer nobody will read, at both vendors, on every turn.
  const done = new AbortController()
  const primary = askOpenAi(prompt, opts, done.signal)

  const hedged = (async () => {
    // Whichever comes first: the primary finishing, or the patience running out.
    const early = await Promise.race([primary, sleep(HEDGE_MS).then(() => null)])
    // It already answered — nothing to hedge against, and no second bill.
    if (typeof early === 'string' && early) return ''
    if (done.signal.aborted) return ''
    return askGemini(prompt, opts, done.signal)
  })()

  const answer = await firstUsable([primary, hedged])
  done.abort()
  return answer
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * The caller's time budget, plus "we already have an answer".
 *
 * Both reasons to stop are real and independent, so they are combined rather
 * than chosen between: the timeout still bounds a request nobody is racing, and
 * the abort still cancels a loser that had plenty of time left.
 */
function withAbort(opts: AskOptions, abort?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  return abort ? AbortSignal.any([timeout, abort]) : timeout
}

/**
 * The first non-empty string among the promises, or '' once all are exhausted.
 *
 * Not `Promise.race`: that resolves on the first SETTLED promise, which here is
 * usually the fast failure — the losing provider's empty string would win the
 * race and discard a good answer that was still in flight.
 */
function firstUsable(promises: Promise<string>[]): Promise<string> {
  return new Promise((resolve) => {
    let outstanding = promises.length
    for (const p of promises) {
      p.then(
        (text) => {
          // resolve() after the first call is a no-op, so the loser is ignored.
          if (text) resolve(text)
          else if (--outstanding === 0) resolve('')
        },
        () => {
          if (--outstanding === 0) resolve('')
        }
      )
    }
  })
}

async function askGemini(prompt: string, opts: AskOptions, abort?: AbortSignal): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    console.warn('[workspace] GEMINI_API_KEY is not set')
    return ''
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              // Images first, each followed by its caption, then the question —
              // the same order /api/chat sends, so the two surfaces read a snip
              // the same way.
              parts: [...geminiSnipParts(opts.attachments ?? [], opts.captions ?? []), { text: prompt }],
            },
          ],
          generationConfig: {
            // temperature 0: these are selections and grounded answers, not
            // compositions. Two identical requests must agree.
            temperature: 0,
            maxOutputTokens: opts.maxOutputTokens,
            responseMimeType: 'application/json',
            // MANDATORY, and this cost a verification round: thinking tokens are
            // drawn from maxOutputTokens, so a small budget came back TRUNCATED
            // mid-JSON and every request silently degraded. Same root cause as
            // the filed live-captions rule (docs/live-engines.md).
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: withAbort(opts, abort),
      }
    )
    if (!res.ok) {
      console.warn(`[workspace] Gemini ${res.status}: ${(await res.text()).slice(0, 400)}`)
      return ''
    }
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
    }
    const out = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
    if (!out) {
      console.warn(`[workspace] Gemini returned no text (finishReason=${body.candidates?.[0]?.finishReason})`)
    }
    return out
  } catch (e) {
    console.warn(`[workspace] Gemini call failed: ${(e as Error).message}`)
    return ''
  }
}

async function askOpenAi(prompt: string, opts: AskOptions, abort?: AbortSignal): Promise<string> {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    console.warn('[workspace] OPENAI_API_KEY is not set')
    return ''
  }
  const snips = openAiSnipContent(opts.attachments ?? [], opts.captions ?? [])
  try {
    const openai = new OpenAI({ apiKey: key })
    const res = await openai.chat.completions.create(
      {
        model: OPENAI_MODEL,
        temperature: 0,
        max_tokens: opts.maxOutputTokens,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content:
              snips.length > 0
                ? ([
                    ...snips,
                    { type: 'text', text: prompt },
                  ] as unknown as OpenAI.Chat.Completions.ChatCompletionContentPart[])
                : prompt,
          },
        ],
      },
      // The SDK retries internally and its default timeout is 10 minutes, so
      // without this the primary could still be waiting long after the hedge
      // gave up — and the caller's own budget would mean nothing.
      { signal: withAbort(opts, abort) }
    )
    const out = res.choices[0]?.message?.content ?? ''
    if (!out) {
      console.warn(`[workspace] OpenAI returned no text (finish=${res.choices[0]?.finish_reason})`)
    }
    return out
  } catch (e) {
    console.warn(`[workspace] OpenAI call failed: ${(e as Error).message}`)
    return ''
  }
}
