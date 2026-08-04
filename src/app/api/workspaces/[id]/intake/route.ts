import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { askModel as ask } from '@/lib/workspace/askModel'
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
import { isBareAgreement, resolveSelection } from '@/lib/workspace/intake/agreement'
import type { IntakeTurn } from '@/lib/workspace/intake/types'

export const dynamic = 'force-dynamic'

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
      // OMISSION IS NOT REMOVAL, at both statuses — see resolveSelection. At
      // `ready` the agreed proposal is restored under whatever the model
      // re-typed; while clarifying a NAMED-BUT-UNRETURNED set survives, which is
      // what stopped three agreed files arriving as one. Only an explicit
      // `removed`, or a deliberate re-shape mid-conversation, takes one out.
      const ids = resolveSelection(selection.status, proposal, selection.selectedIds, selection.removedIds)
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

/** The interactive budget. A human is watching this one, so it gets far less
 *  patience than a long grounded read — see lib/workspace/askModel. */
async function askModel(prompt: string, maxOutputTokens: number): Promise<string> {
  return ask(prompt, { maxOutputTokens, timeoutMs: 7_000 })
}
