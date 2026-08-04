import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { loadCorpus } from '@/lib/workspace/intake/corpus'
import { parseModelRequest } from '@/lib/workspace/intake/parseRequest'
import { findSources } from '@/lib/workspace/intake/findSources'

export const dynamic = 'force-dynamic'

const MODEL = 'gemini-3.5-flash'

const SYSTEM = `You turn an investor-research request into a search filter.
Reply with ONLY a JSON object, no prose, with these optional keys:
  company   string  the company name as the user wrote it, Hebrew or English
  fromYear  number  earliest calendar year wanted
  toYear    number  latest calendar year wanted
  kinds     array   any of "transcript" (an investor call) and "document" (a report or filing)
Omit a key entirely when the user did not indicate it. Today is {TODAY}.
Example: "הדוחות והשיחות של תיגבור משנתיים אחרונות"
      -> {"company":"תיגבור","fromYear":{Y1},"toYear":{Y0},"kinds":["transcript","document"]}`

/**
 * Interpret a sentence, then search the corpus with it.
 *
 * THE MODEL NEVER PRODUCES A RESULT. It only structures the request; every row
 * that comes back is one `findSources` matched in the real corpus. That split is
 * the whole design: a model that could invent a filing would put a file on the
 * shelf that does not exist, and the user would open it to nothing.
 *
 * If the model is unavailable or answers unreadably, `result.request.interpreted`
 * is false and the panel says so — a keyword search must not be presented as
 * comprehension.
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

    const [corpus, raw] = await Promise.all([loadCorpus(supabase), interpret(text)])
    const request = parseModelRequest(raw, text)
    return NextResponse.json(
      { result: findSources(request, corpus) },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/**
 * The model's raw text, or ''. NEVER throws: an uninterpreted request is a
 * DEGRADED search, not a failed one — the user's own words still search, and the
 * panel tells them that is what happened. Failing the whole request here would
 * turn a missing API key into "the workspace is broken".
 */
async function interpret(text: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    console.warn('[intake] GEMINI_API_KEY is not set — falling back to keyword search')
    return ''
  }
  const now = new Date()
  const system = SYSTEM.replace('{TODAY}', now.toISOString().slice(0, 10))
    .replace('{Y1}', String(now.getFullYear() - 1))
    .replace('{Y0}', String(now.getFullYear()))
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${system}\n\nRequest: ${text}` }] }],
          generationConfig: {
            // temperature 0: this is a parse, not a composition. Two identical
            // requests must produce the same shelf.
            temperature: 0,
            maxOutputTokens: 400,
            // Forces syntactically valid JSON out of the model rather than hoping
            // the prompt holds — `unfence()` stays as belt and braces.
            responseMimeType: 'application/json',
            // MANDATORY, and this cost a verification round: thinking tokens are
            // drawn from maxOutputTokens, so with the budget at 300 the answer
            // came back TRUNCATED at 29 characters — `{"company":"תיגבור","fromYear`
            // — which JSON.parse rejects, so every request silently degraded to a
            // keyword search. Same root cause as the filed live-captions rule
            // (.claude/rules/live.md: thinkingBudget 0 is mandatory).
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!res.ok) {
      console.warn(`[intake] Gemini ${res.status}: ${(await res.text()).slice(0, 400)}`)
      return ''
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
    }
    const out = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
    // A silent empty answer is the failure mode worth naming in the log: the
    // request still searches, but by keywords, and the panel says so. Without
    // this line the difference is invisible from the server side.
    if (!out) {
      console.warn(
        `[intake] Gemini returned no text (finishReason=${json.candidates?.[0]?.finishReason}): ` +
          JSON.stringify(json).slice(0, 400)
      )
    }
    return out
  } catch (e) {
    console.warn(`[intake] Gemini call failed: ${(e as Error).message}`)
    return ''
  }
}
