import 'server-only'
import OpenAI from 'openai'

// ─────────────────────────────────────────────────────────────────────────────
// ONE MODEL CALL, TWO PROVIDERS, whichever answers first.
//
// Extracted from the intake route on 2026-08-04 when the workspace chat needed
// the same thing. The reasoning below is why it is a HEDGE and not a chain, and
// it is the whole reason the intake got fast — duplicating it by hand into a
// second route is how one copy quietly goes back to being a chain.
//
// Founder, 2026-08-04: *"it responds very slow, it needs to be a lot faster."*
// The dev log said why: Gemini was returning 503 "high demand" and timing out,
// and the fallback only started once Gemini had exhausted itself — 12s, 17s,
// 27s, one turn at 68s. Every one of those seconds was spent waiting on a model
// that was never going to answer while a working one sat idle.
//
// So OpenAI no longer waits its turn. Gemini starts; if it has not answered
// within HEDGE_MS — or has already failed — OpenAI starts alongside it, and the
// first USABLE answer wins. Latency stops being the sum of one provider's
// retries and becomes the minimum of two independent attempts.
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'gemini-3.5-flash'

/** Budget for a request someone is watching. */
const GEMINI_TIMEOUT_MS = 20_000
/** How long Gemini gets alone before a second model is started alongside it. */
const HEDGE_MS = 1_200

export type AskOptions = {
  maxOutputTokens: number
  /** Long-context reads (a whole transcript) need more than an interactive
   *  selection does; the caller knows which it is. */
  timeoutMs?: number
}

/**
 * The model's raw text, or ''. NEVER throws: an unusable answer is a DEGRADED
 * request, not a failed one, and the caller decides what to say about it.
 * Failing here would turn a missing API key into "the workspace is broken".
 */
export async function askModel(prompt: string, opts: AskOptions): Promise<string> {
  const gemini = askGemini(prompt, opts)

  const hedged = (async () => {
    // Whichever comes first: Gemini finishing, or the patience running out.
    const early = await Promise.race([gemini, sleep(HEDGE_MS).then(() => null)])
    // Gemini already answered — nothing to hedge against, and no second bill.
    if (typeof early === 'string' && early) return ''
    return askOpenAi(prompt, opts)
  })()

  return firstUsable([gemini, hedged])
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

async function askGemini(prompt: string, opts: AskOptions): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    console.warn('[workspace] GEMINI_API_KEY is not set')
    return ''
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            // temperature 0: these are selections and grounded answers, not
            // compositions. Two identical requests must agree.
            temperature: 0,
            maxOutputTokens: opts.maxOutputTokens,
            responseMimeType: 'application/json',
            // MANDATORY, and this cost a verification round: thinking tokens are
            // drawn from maxOutputTokens, so a small budget came back TRUNCATED
            // mid-JSON and every request silently degraded. Same root cause as
            // the filed live-captions rule (.claude/rules/live.md).
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? GEMINI_TIMEOUT_MS),
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

async function askOpenAi(prompt: string, opts: AskOptions): Promise<string> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return ''
  try {
    const openai = new OpenAI({ apiKey: key })
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4.1',
      temperature: 0,
      max_tokens: opts.maxOutputTokens,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    })
    return res.choices[0]?.message?.content ?? ''
  } catch (e) {
    console.warn(`[workspace] OpenAI fallback failed: ${(e as Error).message}`)
    return ''
  }
}
