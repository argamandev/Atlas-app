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
import { isBareAgreement, reconcileSelection } from '@/lib/workspace/intake/agreement'
import type { IntakeTurn } from '@/lib/workspace/intake/types'

export const dynamic = 'force-dynamic'

const MODEL = 'gemini-3.5-flash'

// Budget for a request someone is waiting on: worst case is roughly
// 7s + 0.6s + 7s before the fallback model gets its turn.
const GEMINI_TIMEOUT_MS = 7_000
/** How long Gemini gets alone before a second model is started alongside it. */
const HEDGE_MS = 1_200

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

  const body = (await req.json().catch(() => null)) as { messages?: unknown } | null
  const messages = parseTurns(body?.messages)
  if (messages.length === 0) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 })
  }
  // The narrowing stage and the deterministic fallback both work off what the
  // user actually asked for, which is their first turn — the later ones are
  // corrections to it, not new searches.
  const text = messages.find((m) => m.role === 'user')?.content ?? ''

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
      return json({
        reply: null,
        status: 'clarifying',
        selected: [],
        fallback: findSources(request, corpus),
      })
    }

    // THE SET ALREADY AGREED, re-validated against the corpus. It arrives from
    // the client, so it is untrusted like any other body field — but it cannot
    // widen reach: an id that is not in the corpus this user's own client loaded
    // is simply not here, and is discarded.
    const known = new Set(corpus.map((s) => s.sourceId))
    const proposal = lastProposal(messages).filter((id) => known.has(id))

    // ── the shortcut: "yes" is not a question for a model ────────────────────
    // Founder, 2026-08-04: he agreed, and Atlas asked the same question again —
    // then pulled one of the two files they had settled on. Both were the same
    // hole: the agreed set was re-derived by a model on every turn. When the
    // latest message is nothing but agreement and a set is on the table, there
    // is nothing left to reason about, so nothing is asked. The loop and the
    // dropped file become impossible rather than discouraged, and the turn where
    // a human is least willing to wait now costs no network time at all.
    const latest = messages[messages.length - 1]
    if (proposal.length > 0 && latest?.role === 'user' && isBareAgreement(latest.content)) {
      const { selected } = orderBySelection(corpus, proposal)
      // `reply: null` with `ready` means "no sentence needed" — the panel is
      // already showing that it is pulling. It deliberately does not invent a
      // Hebrew or English sentence server-side; the client owns its own wording.
      return json({ reply: null, status: 'ready', selected, fallback: null })
    }

    // ── stage 1: narrow, only if we must ────────────────────────────────────
    let candidates = corpus
    if (corpus.length > SELECTION_CANDIDATE_CAP) {
      const filterRaw = await askModel(withDates(FILTER_SYSTEM) + `\n\nRequest: ${text}`, 400)
      const found = findSources(parseModelRequest(filterRaw, text), corpus)
      const pool = found.matched.length > 0 ? found.matched : found.otherForCompany
      candidates = (pool.length > 0 ? pool : corpus).slice(0, SELECTION_CANDIDATE_CAP)
      // Narrowing must never hide a file the conversation has already agreed to
      // — the model has to see it to carry it forward.
      const inPool = new Set(candidates.map((s) => s.sourceId))
      const missing = corpus.filter((s) => proposal.includes(s.sourceId) && !inPool.has(s.sourceId))
      candidates = [...candidates, ...missing]
    }

    // ── stage 2: select, and answer in words ────────────────────────────────
    const selectionRaw = await askModel(buildSelectionPrompt(candidates, messages, proposal), 1200)
    const selection = parseSelection(selectionRaw, candidates)

    if (selection) {
      if (selection.dropped.length > 0) {
        // Should be impossible — the model was given the ids. Logged rather than
        // swallowed, because a model beginning to invent ids must not be silent.
        console.warn(`[intake] model returned unknown ids: ${selection.dropped.join(', ')}`)
      }
      // OMISSION IS NOT REMOVAL. At `ready` the agreed proposal is restored
      // under whatever the model re-typed, so a file that was named, agreed to
      // and then simply left out of the payload still arrives. Only an explicit
      // `removed` takes one out. While still clarifying the model is free to
      // re-shape the set — that is what the conversation is for.
      const ids =
        selection.status === 'ready'
          ? reconcileSelection(proposal, selection.selectedIds, selection.removedIds)
          : selection.selectedIds
      const { selected } = orderBySelection(candidates, ids)
      return json({ reply: selection.reply, status: selection.status, selected, fallback: null })
    }

    // ── the selection failed: deterministic, and SAID to be deterministic ────
    // Deliberately no second model call. `parseModelRequest('')` yields
    // interpreted:false, which is what makes the panel state that these are
    // keyword matches rather than an understood request.
    const request = parseModelRequest('', text)
    return json({
      reply: null,
      status: 'clarifying',
      selected: [],
      fallback: findSources(request, corpus),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

function json(result: unknown) {
  return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store' } })
}

/** The conversation, from an untrusted body. Caps the history so a long thread
 *  cannot grow the prompt without bound. */
function parseTurns(raw: unknown): IntakeTurn[] {
  if (!Array.isArray(raw)) return []
  const turns: IntakeTurn[] = []
  for (const t of raw) {
    const o = t as { role?: unknown; content?: unknown; proposed?: unknown }
    const role = o?.role === 'assistant' ? 'assistant' : o?.role === 'user' ? 'user' : null
    const content = typeof o?.content === 'string' ? o.content.trim() : ''
    if (!role || !content) continue
    // Bounded like the text is: a client cannot grow the prompt without limit.
    const proposed = Array.isArray(o?.proposed)
      ? o.proposed.filter((x): x is string => typeof x === 'string').slice(0, SELECTION_CANDIDATE_CAP)
      : undefined
    turns.push({ role, content: content.slice(0, 4000), ...(proposed ? { proposed } : {}) })
  }
  return turns.slice(-20)
}

/** The most recent set Atlas put on the table, or []. Later turns win — an
 *  earlier proposal has already been superseded by the one after it. */
function lastProposal(turns: IntakeTurn[]): string[] {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]
    if (t.role === 'assistant' && t.proposed && t.proposed.length > 0) return t.proposed
  }
  return []
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
/**
 * An answer from whichever model answers first.
 *
 * WHY THIS IS A HEDGE AND NOT A CHAIN. Founder, 2026-08-04: *"it responds very
 * slow, it needs to be a lot faster."* The dev log said why — Gemini was
 * returning 503 "high demand" and timing out, and the fallback only started once
 * Gemini had exhausted itself: 12s, 17s, 19s, 27s, 32s, one turn at 68s. Every
 * one of those seconds was spent waiting for a model that was never going to
 * answer, while a working model sat idle.
 *
 * So OpenAI no longer waits its turn. Gemini starts; if it has not answered
 * within HEDGE_MS — or has already failed — OpenAI starts alongside it, and the
 * first usable answer wins. Latency stops being the SUM of a bad provider's
 * retries and becomes the MINIMUM of two independent attempts. The extra call is
 * only made when the first one is late, and these prompts are a few hundred
 * tokens over a dozen files.
 */
async function askModel(prompt: string, maxOutputTokens: number): Promise<string> {
  const gemini = askGemini(prompt, maxOutputTokens)

  const hedged = (async () => {
    // Whichever comes first: Gemini finishing, or the patience running out.
    const early = await Promise.race([gemini, sleep(HEDGE_MS).then(() => null)])
    // Gemini already answered — nothing to hedge against, and no second bill.
    if (typeof early === 'string' && early) return ''
    return askOpenAi(prompt, maxOutputTokens)
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

async function askGemini(prompt: string, maxOutputTokens: number): Promise<string> {
  // OBSERVED 2026-08-04: a plain 503 "This model is currently experiencing high
  // demand" dropped the whole request to a keyword search. On an interactive
  // path that is a bad trade for two seconds — the finish pipeline already
  // retries this model (lib/transcription.ts), just on a slower schedule.
  // A HUMAN IS WATCHING THIS. The first policy here was copied from the finish
  // pipeline — 3 attempts at a 20s timeout — which on a bad Gemini day meant the
  // founder sat in front of a "Thinking…" indicator for a full minute before the
  // fallback ran (observed 2026-08-04: three consecutive timeouts, 27s+ per
  // request). A background job can afford that; an interactive one cannot.
  //
  // ONE ATTEMPT, and no retry — because the hedge in `askModel` IS the retry,
  // and a different provider is a better second attempt than asking a model
  // that is shedding load to shed it again. Removing the retry also makes the
  // hedge react faster: a 503 comes back in a few hundred milliseconds, this
  // resolves empty immediately, and OpenAI starts then instead of after a
  // backoff and a second 7-second timeout. Measured on this branch, the founder's
  // first turn went 12.5s → 5.4s.
  const { text } = await askGeminiOnce(prompt, maxOutputTokens)
  return text
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

/** `status` is kept in the shape because the failure classes read very
 *  differently in the log (503 high-demand vs a 400 on the prompt); nothing
 *  branches on it any more, since the hedge answers every class the same way. */
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
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
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
