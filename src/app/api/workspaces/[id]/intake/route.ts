import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import OpenAI from 'openai'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { loadCorpus } from '@/lib/workspace/intake/corpus'
import { parseModelRequest } from '@/lib/workspace/intake/parseRequest'
import { findSources } from '@/lib/workspace/intake/findSources'
import {
  buildSelectionPrompt,
  parseSelection,
  orderBySelection,
  SELECTION_CANDIDATE_CAP,
} from '@/lib/workspace/intake/selectSources'

export const dynamic = 'force-dynamic'

const MODEL = 'gemini-3.5-flash'

const FILTER_SYSTEM = `You turn an investor-research request into a search filter.
Reply with ONLY a JSON object, no prose, with these optional keys:
  company   string  the company name as the user wrote it, Hebrew or English
  fromYear  number  earliest calendar year wanted
  toYear    number  latest calendar year wanted
  kinds     array   any of "transcript" (an investor call) and "document" (a report or filing)
Omit a key entirely when the user did not indicate it. Today is {TODAY}.
Example: "הדוחות והשיחות של תיגבור משנתיים אחרונות"
      -> {"company":"תיגבור","fromYear":{Y1},"toYear":{Y0},"kinds":["transcript","document"]}`

/**
 * Interpret a request, then answer it from the corpus.
 *
 * TWO STAGES, and the second one is the point (founder, 2026-08-04: asked for two
 * specific quarterly reports plus the most recent call, got six files — "that
 * doesn't even make sense"):
 *
 *   1. NARROW, only when the corpus is too big to show a model at once. A
 *      structured filter (company / years / kinds) cuts it down. Today's corpus
 *      is a dozen rows, so this stage is skipped entirely.
 *   2. SELECT. The model is handed the actual candidate files and picks the ones
 *      asked for, then answers in its own words. A filter cannot express "the
 *      first and second quarter" or "the last one"; a selection can.
 *
 * THE MODEL STILL NEVER PRODUCES A FILE. It picks ids from a list we gave it, and
 * `parseSelection` drops anything that was not on that list, so no sentence it
 * writes can put a file on a shelf that does not exist.
 *
 * When the selection is unusable the response carries `reply: null` and a
 * deterministic `fallback`, and the panel says the request was not understood —
 * a degraded search is never dressed up as comprehension.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase(cookies())
  const user = await resolveUser(supabase)
  if (!user) return unauthorized()

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })

  try {
    // The workspace must be the caller's own. RLS answers this: one that is not
    // theirs is simply NOT THERE, so 404 is the correct and complete answer to
    // both "never existed" and "belongs to someone else".
    const { data: ws, error: wErr } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (wErr) throw new Error(wErr.message)
    if (!ws) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

    const corpus = await loadCorpus(supabase)
    if (corpus.length === 0) {
      const request = parseModelRequest('', text)
      return json({ reply: null, selected: [], others: [], fallback: findSources(request, corpus) })
    }

    // ── stage 1: narrow, only if we must ────────────────────────────────────
    let candidates = corpus
    if (corpus.length > SELECTION_CANDIDATE_CAP) {
      const filterRaw = await askGemini(withDates(FILTER_SYSTEM) + `\n\nRequest: ${text}`, 400)
      const found = findSources(parseModelRequest(filterRaw, text), corpus)
      const pool = found.matched.length > 0 ? found.matched : found.otherForCompany
      candidates = (pool.length > 0 ? pool : corpus).slice(0, SELECTION_CANDIDATE_CAP)
    }

    // ── stage 2: select, and answer in words ────────────────────────────────
    const selectionRaw = await askGemini(buildSelectionPrompt(candidates, text), 1200)
    const selection = parseSelection(selectionRaw, candidates)

    if (selection) {
      if (selection.dropped.length > 0) {
        // Should be impossible — the model was given the ids. Logged rather than
        // swallowed, because a model beginning to invent ids must not be silent.
        console.warn(`[intake] model returned unknown ids: ${selection.dropped.join(', ')}`)
      }
      const { selected, others } = orderBySelection(candidates, selection.selectedIds)
      return json({ reply: selection.reply, selected, others, fallback: null })
    }

    // ── the selection failed: deterministic, and SAID to be deterministic ────
    // Deliberately no second model call. `parseModelRequest('')` yields
    // interpreted:false, which is what makes the panel state that these are
    // keyword matches rather than an understood request.
    const request = parseModelRequest('', text)
    return json({ reply: null, selected: [], others: [], fallback: findSources(request, corpus) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

function json(result: unknown) {
  return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store' } })
}

function withDates(template: string): string {
  const now = new Date()
  return template
    .replace('{TODAY}', now.toISOString().slice(0, 10))
    .replace('{Y1}', String(now.getFullYear() - 1))
    .replace('{Y0}', String(now.getFullYear()))
}

/**
 * The model's raw text, or ''. NEVER throws: an unusable answer is a DEGRADED
 * request, not a failed one — the user's own words still search, and the panel
 * says that is what happened. Failing here would turn a missing API key into
 * "the workspace is broken".
 */
async function askGemini(prompt: string, maxOutputTokens: number): Promise<string> {
  // OBSERVED 2026-08-04: a plain 503 "This model is currently experiencing high
  // demand" dropped the whole request to a keyword search. On an interactive
  // path that is a bad trade for two seconds — the finish pipeline already
  // retries this model (lib/transcription.ts), just on a slower schedule.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { text, status } = await askGeminiOnce(prompt, maxOutputTokens)
    if (text) return text
    // Only transient classes are worth waiting for. A 400 will be a 400 again.
    const transient = status === 429 || (typeof status === 'number' && status >= 500)
    if (!transient || attempt === 3) break
    await new Promise((r) => setTimeout(r, attempt === 1 ? 700 : 1800))
  }

  // Gemini is out. GPT-4.1 backs up the chat the same way (api/chat/route.ts),
  // so the founder is already paying for the key and the workspace should use it
  // rather than degrade while a working model sits unused.
  return askOpenAi(prompt, maxOutputTokens)
}

async function askOpenAi(prompt: string, maxTokens: number): Promise<string> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return ''
  try {
    const openai = new OpenAI({ apiKey: key })
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4.1',
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    })
    return res.choices[0]?.message?.content ?? ''
  } catch (e) {
    console.warn(`[intake] OpenAI fallback failed: ${(e as Error).message}`)
    return ''
  }
}

/** `status` is returned rather than logged so the caller can tell a transient
 *  failure (retry) from a permanent one (do not). */
async function askGeminiOnce(
  prompt: string,
  maxOutputTokens: number
): Promise<{ text: string; status: number | null }> {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    console.warn('[intake] GEMINI_API_KEY is not set — falling back to keyword search')
    return { text: '', status: null }
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
            // temperature 0: this is a parse and a selection, not a composition.
            // Two identical requests must produce the same shelf.
            temperature: 0,
            maxOutputTokens,
            responseMimeType: 'application/json',
            // MANDATORY, and this cost a verification round: thinking tokens are
            // drawn from maxOutputTokens, so at 300 the answer came back
            // TRUNCATED at 29 characters — `{"company":"תיגבור","fromYear` —
            // which JSON.parse rejects, so every request silently degraded to a
            // keyword search. Same root cause as the filed live-captions rule
            // (.claude/rules/live.md: thinkingBudget 0 is mandatory).
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(20_000),
      }
    )
    if (!res.ok) {
      console.warn(`[intake] Gemini ${res.status}: ${(await res.text()).slice(0, 400)}`)
      return { text: '', status: res.status }
    }
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
    }
    const out = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
    if (!out) {
      console.warn(`[intake] Gemini returned no text (finishReason=${body.candidates?.[0]?.finishReason})`)
    }
    // 200 with no text is not retryable — the model answered, just emptily.
    return { text: out, status: res.status }
  } catch (e) {
    console.warn(`[intake] Gemini call failed: ${(e as Error).message}`)
    // A network error or a timeout IS worth one more try.
    return { text: '', status: 503 }
  }
}
