import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { askModel as ask } from '@/lib/workspace/askModel'
import { resolveUser } from '@/lib/auth/verifyUser'
import { unauthorized } from '@/lib/auth'
import { loadCorpus } from '@/lib/workspace/intake/corpus'
import { defang } from '@/lib/workspace/chat/context'
import { parseModelRequest } from '@/lib/workspace/intake/parseRequest'
import { findSources } from '@/lib/workspace/intake/findSources'
import {
  buildSelectionPrompt,
  parseSelection,
  orderBySelection,
  SELECTION_CANDIDATE_CAP,
} from '@/lib/workspace/intake/selectSources'
import {
  isBareAgreement,
  resolveSelection,
  agreedToStandingSet,
  narrowsSelection,
} from '@/lib/workspace/intake/agreement'
import { intakeResult } from '@/lib/workspace/intake/respond'
import type { IntakeResponse, IntakeTurn, ProposedRemote } from '@/lib/workspace/intake/types'
import type { AttachableSource } from '@/lib/workspace/data'
import { resolveIntakeCompany, type PinnedCompany } from '@/lib/workspace/intake/companyPin'
import { listDisclosures } from '@/lib/maya/disclosures'
import { toRemoteSources } from '@/lib/maya/filings'
import { describeFailure } from '@/lib/maya/types'

export const dynamic = 'force-dynamic'

/**
 * How many calendar years one question may ask MAYA about.
 *
 * `yearWindows` issues one sequential request per year (plus the late-filing
 * year), so this is directly a latency and rate-limit bound: 3 becomes at most
 * 4 requests, about a second. The years arrive from a model and are otherwise
 * bounded only to 1990–2100.
 */
const MAX_QUERY_YEARS = 3

/** Shape-checked before it reaches a query, like every other id from a body. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  const body = (await req.json().catch(() => null)) as { messages?: unknown; companyId?: unknown } | null
  const messages = parseTurns(body?.messages)
  // THE COMPANY THE ANALYST POINTED AT, as an id — never as a spelling.
  //
  // A `@` mention resolves in the browser against `/api/companies` and sends
  // the row's id. Only the ID is trusted: the issuer number behind it is read
  // from the database below, so a request body cannot claim that "this company
  // is issuer 259" and pull the other refinery's filings under a name the
  // analyst never saw.
  const pinnedCompanyId =
    typeof body?.companyId === 'string' && UUID.test(body.companyId) ? body.companyId : null
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

    // WHAT THIS SHELF ALREADY HOLDS. Without it the selection step offers back
    // files the analyst is looking at (see buildSelectionPrompt), and agreeing
    // used to attach a second copy of one.
    const { data: onShelfRows, error: sErr } = await supabase
      .from('workspace_items')
      .select('transcript_id, document_id')
      .eq('workspace_id', params.id)
    if (sErr) throw new Error(sErr.message)
    const onShelf = (onShelfRows ?? [])
      .map((r) => (r.transcript_id ?? r.document_id) as string | null)
      .filter((v): v is string => !!v)

    const corpus = await loadCorpus(supabase)
    // NO EARLY RETURN ON AN EMPTY CORPUS ANY MORE. It used to short-circuit
    // here, which was right when Atlas's own library was the only thing that
    // existed: nothing held meant nothing to offer. MAYA breaks that — a
    // company's filings are reachable whether or not Atlas holds anything —
    // so emptiness is now decided after the candidates are assembled.

    // THE SET ALREADY AGREED, re-validated against the corpus. It arrives from
    // the client, so it is untrusted like any other body field — but it cannot
    // widen reach: an id that is not in the corpus this user's own client loaded
    // is simply not here, and is discarded.
    const known = new Set(corpus.map((s) => s.sourceId))
    const rawProposal = lastProposal(messages)
    const proposal = rawProposal.filter((id) => known.has(id))

    // THE REMOTE HALF OF THAT SET. A `maya:` id cannot be checked against the
    // corpus — it names a filing on TASE's servers — so it is carried by the
    // pointer the client echoed back. Only ids that appear in BOTH the proposed
    // list and the echoed pointers survive, so neither alone can smuggle a file
    // into the agreed set.
    const remoteByProposedId = new Map(lastProposalRemote(messages).map((p) => [`maya:${p.mayaReportId}`, p]))
    const agreedRemote = rawProposal
      .map((id) => remoteByProposedId.get(id))
      .filter((p): p is ProposedRemote => p !== undefined)

    // ── the shortcut: "yes" is not a question for a model ────────────────────
    // Founder, 2026-08-04: he agreed, and Atlas asked the same question again —
    // then pulled one of the two files they had settled on. Both were the same
    // hole: the agreed set was re-derived by a model on every turn. When the
    // latest message is nothing but agreement and a set is on the table, there
    // is nothing left to reason about, so nothing is asked. The loop and the
    // dropped file become impossible rather than discouraged, and the turn where
    // a human is least willing to wait now costs no network time at all.
    //
    // IT HAD TO LEARN ABOUT MAYA, and this is where the feature would otherwise
    // have failed at its most important moment. `proposal` is filtered against
    // the corpus, and a `maya:` id is never in the corpus — so a shelf agreed
    // entirely of MAYA filings produced an empty proposal, the shortcut did not
    // fire, and the user's "כן" pulled nothing at all.
    const latest = messages[messages.length - 1]
    const agreedSomething = proposal.length > 0 || agreedRemote.length > 0
    if (agreedSomething && latest?.role === 'user' && isBareAgreement(latest.content)) {
      const { selected } = orderBySelection(corpus, proposal)
      const remoteSelected: AttachableSource[] = agreedRemote.map((p) => ({
        sourceId: `maya:${p.mayaReportId}`,
        kind: 'document' as const,
        // Display only, and only until the attach route reads the real one
        // from MAYA. Never persisted from here.
        title: p.title || 'MAYA',
        company: null,
        when: p.publishedISO,
        remote: { mayaReportId: p.mayaReportId, issuerId: p.issuerId, publishedISO: p.publishedISO },
      }))
      // `reply: null` with `ready` means "no sentence needed" — the panel is
      // already showing that it is pulling. It deliberately does not invent a
      // Hebrew or English sentence server-side; the client owns its own wording.
      return respond({
        reply: null,
        status: 'ready',
        selected: [...remoteSelected, ...selected],
        fallback: null,
      })
    }

    // ── stage 1: INTERPRET, always ──────────────────────────────────────────
    //
    // This stage used to run only when the corpus exceeded the candidate cap,
    // which with ~58 rows meant it had never executed in production — dead code
    // guarding a case that had not arrived. It is now unconditional, because
    // the structured request it produces (company, years, kinds) is EXACTLY a
    // MAYA query. One model call, two jobs: narrowing a big local corpus, and
    // telling us whose filings to ask MAYA for.
    // `text` is the analyst's turn, straight from the request body, glued onto a
    // system prompt with no fence between them — door EIGHT, and the same value
    // `selectSources.ts` was fixed to defang a hundred lines below.
    const filterRaw = await askModel(withDates(FILTER_SYSTEM) + `\n\nRequest: ${defang(text)}`, 400)
    const request = parseModelRequest(filterRaw, text)

    // ── stage 1b: MAYA ──────────────────────────────────────────────────────
    //
    // Only when a company was actually named — by a `@` mention or by the
    // sentence. A question with no company has nothing to look up, and spending
    // three sequential API calls to discover that would slow down every
    // ordinary turn.
    let remote: AttachableSource[] = []
    let sourceError: IntakeResponse['sourceError'] = null
    let unknownCompany: string | null = null
    let unknownCompanyFrom: IntakeResponse['unknownCompanyFrom'] = null

    // THE PINNED ROW, READ FROM THE DATABASE. `companies` is shared corpus and
    // is read through the USER's client, so this adds no reach: an id that
    // names no company simply yields no pin, and the turn proceeds on the
    // sentence alone.
    let pin: PinnedCompany | null = null
    if (pinnedCompanyId) {
      const { data: row, error: cErr } = await supabase
        .from('companies')
        .select('name, display_name, tase_issuer_id')
        .eq('id', pinnedCompanyId)
        .maybeSingle()
      if (cErr) throw new Error(cErr.message)
      if (row) {
        pin = {
          taseIssuerId: (row.tase_issuer_id as string) ?? null,
          // The name the analyst is looking at on the chip, so a failure names
          // what they saw rather than a second spelling of it.
          name: ((row.display_name as string) || (row.name as string) || '').trim(),
        }
      }
    }

    // Loaded only for the NAME path — a pin needs no matching at all.
    const issuerRows = pin
      ? []
      : await (async () => {
          const { data, error: issErr } = await supabase
            .from('maya_issuers')
            .select('issuer_id, name_he, name_en')
          if (issErr) throw new Error(issErr.message)
          return (data ?? []).map((r) => ({
            issuerId: r.issuer_id as number,
            nameHe: (r.name_he as string) ?? null,
            nameEn: (r.name_en as string) ?? null,
          }))
        })()

    // ONE DECISION, MADE ONCE, from both facts — see `companyPin.ts`.
    const company = resolveIntakeCompany(pin, request.interpreted ? request.company : null, issuerRows)
    unknownCompany = company.unknownCompany
    unknownCompanyFrom = company.unknownCompanyFrom

    // A DEGRADED INTERPRET CALL TAKES MAYA OUT OF THE SEARCH SILENTLY.
    //
    // `askModel` returns '' rather than throwing, so an unparseable or timed-out
    // filter response yields `company: null` — and the MAYA branch below is
    // guarded on exactly that. Without this flag the selection step would then
    // answer fluently from the local corpus alone ("אין לי את הדוח השנתי של
    // תיגבור") with nothing on screen saying MAYA was never asked. That is the
    // same untrue sentence this feature was built to stop, reached through a
    // third door — and `parseModelRequest` already sets `interpreted: false`
    // for precisely this case; the route simply never read it.
    //
    // WHICH failure it is depends on whether the company survived (2026-08-15).
    //
    // That notice says "I couldn't work out which company you meant, so this
    // covers only what Atlas already holds" — and with a pin BOTH halves are
    // false: the company is known and MAYA was searched. Raising it there would
    // report a green search as a coverage failure (M2).
    //
    // BUT SILENCE IS THE OTHER LIE, and the first cut of this shipped it: the
    // interpret call also carries the PERIOD and the KINDS, so a pinned
    // "@בז\"א the 2019 annual report" whose filter timed out would search
    // 2025–2026, answer confidently, and say nothing about the years it
    // invented. A failure with a narrower scope gets a narrower sentence — it
    // does not get suppressed.
    if (!request.interpreted) {
      sourceError = company.settled ? 'request_partly_understood' : 'request_not_understood'
    }

    if (company.issuerId !== null) {
      // THE SPAN IS CLAMPED, because the years come from a model and every
      // year is a sequential request. `parseModelRequest` bounds them only to
      // 1990–2100, so "everything תיגבור ever filed" would fire 38 calls and a
      // model slip at the bounds would fire 112 — a minute inside one
      // interactive turn, spending a 10-req/2s budget that is shared by every
      // user and all four consumers of this layer.
      const thisYear = new Date().getFullYear()
      const toYear = Math.min(request.toYear ?? thisYear, thisYear + 1)
      const fromYear = Math.max(request.fromYear ?? thisYear - 1, toYear - (MAX_QUERY_YEARS - 1))

      const listed = await listDisclosures({ issuerId: company.issuerId, fromYear, toYear })

      if (!listed.ok) {
        // A COVERAGE FAILURE IS NOT AN EMPTY RESULT. Without this flag the
        // selection step would be handed local files only and would answer
        // "I don't have that" with total confidence — the exact untrue
        // sentence fixed on 2026-08-06, arriving through a new door.
        console.warn(`[intake] MAYA unavailable: ${describeFailure(listed.failure)}`)
        sourceError = 'maya_unreachable'
      } else {
        const sources = toRemoteSources(listed.data)

        // ALREADY INGESTED FILINGS ARE NOT "REMOTE". Offering to fetch
        // something Atlas already holds would make the analyst wait for a
        // download that is not needed, and would list one file twice.
        const ids = sources.map((s) => s.mayaReportId)
        const held = new Map<number, string>()
        if (ids.length > 0) {
          const { data: haveRows, error: haveErr } = await supabase
            .from('company_documents')
            .select('id, maya_report_id')
            .in('maya_report_id', ids)
          if (haveErr) throw new Error(haveErr.message)
          for (const r of haveRows ?? []) held.set(r.maya_report_id as number, r.id as string)
        }

        const localIds = new Set(corpus.map((s) => s.sourceId))
        remote = sources
          // one Atlas already holds is represented by its LOCAL row, if that
          // row is in the corpus; otherwise it is simply not offered twice
          .filter((s) => !held.has(s.mayaReportId) || !localIds.has(held.get(s.mayaReportId) as string))
          .map((s) => ({
            sourceId: s.sourceId,
            kind: 'document' as const,
            title: s.title,
            company: s.issuerName,
            when: s.publishedISO,
            // Only the pointer travels to the browser; the attach route reads
            // the title, issuer and file location from MAYA itself.
            remote: {
              mayaReportId: s.mayaReportId,
              issuerId: s.issuerId,
              publishedISO: s.publishedISO,
            },
          }))
      }
    }

    // ── stage 1c: narrow the LOCAL corpus, only if we must ───────────────────
    let candidates = corpus
    if (corpus.length > SELECTION_CANDIDATE_CAP) {
      const found = findSources(request, corpus)
      const pool = found.matched.length > 0 ? found.matched : found.otherForCompany
      candidates = (pool.length > 0 ? pool : corpus).slice(0, SELECTION_CANDIDATE_CAP)
      // Narrowing must never hide a file the conversation has already agreed to
      // — the model has to see it to carry it forward.
      const inPool = new Set(candidates.map((s) => s.sourceId))
      const missing = corpus.filter((s) => proposal.includes(s.sourceId) && !inPool.has(s.sourceId))
      candidates = [...candidates, ...missing]
    }

    // Remote first: the analyst asked for those by name, and the cap must not
    // spend itself on local rows before reaching what was actually requested.
    candidates = [...remote, ...candidates].slice(0, SELECTION_CANDIDATE_CAP + remote.length)

    // NOTHING TO CHOOSE FROM. This used to be decided before MAYA was consulted,
    // which was right when Atlas's own library was all that existed; now a
    // company's filings are reachable whether or not Atlas holds anything, so
    // the question is only answerable here.
    if (candidates.length === 0) {
      return respond({
        reply: null,
        status: 'clarifying',
        selected: [],
        fallback: findSources(request, corpus),
        sourceError,
        unknownCompany,
        unknownCompanyFrom,
      })
    }

    // ── stage 2: select, and answer in words ────────────────────────────────
    const selectionRaw = await askModel(buildSelectionPrompt(candidates, messages, proposal, onShelf), 1200)
    const selection = parseSelection(selectionRaw, candidates)

    if (selection) {
      if (selection.dropped.length > 0) {
        // Should be impossible — the model was given the ids. Logged rather than
        // swallowed, because a model beginning to invent ids must not be silent.
        console.warn(`[intake] model returned unknown ids: ${selection.dropped.join(', ')}`)
      }
      // AN EMPTY SELECTION IS AN OMISSION; A SHORTER ONE IS A DECISION.
      //
      // `resolveSelection` treats both statuses alike now: a set the model
      // returned is honoured as returned, and only an EMPTY one falls back to
      // the standing proposal (nobody re-shapes a set to nothing while still
      // discussing it). That replaced a union at `ready` which silently put back
      // files the analyst had just narrowed away — see that function's header
      // for the full case; it is the one finding that gated this merge.
      // THE ANALYST ALREADY SAID YES, AND THE MODEL ASKED AGAIN.
      //
      // `isBareAgreement` above catches a plain "כן" before a model is called at
      // all. It cannot catch "כן, תביא את שתיהן" — `שתיהן` is a quantity, and a
      // quantity is a NARROWING when the table holds three. So that turn reaches
      // the model, and on 2026-08-07 the model answered "אז אני מביא לך את שתי
      // השיחות…" — "so I'm bringing you both" — at status `clarifying`, which
      // pulls nothing. The founder's report was simply "adding a document
      // doesn't actually work", and from where he sat that is exactly what it
      // was: Atlas said the files were coming and no file ever came.
      //
      // Promoted here rather than argued with in the prompt, because the model's
      // SET was already right and only its status was wrong — and because the
      // prompt has told it not to re-confirm since 2026-08-04 and it does anyway.
      const promoted = agreedToStandingSet(
        latest?.role === 'user' ? latest.content : '',
        selection.status,
        proposal,
        selection.selectedIds
      )
      const status = promoted ? ('ready' as const) : selection.status

      const resolution = resolveSelection(
        proposal,
        selection.selectedIds,
        selection.removedIds,
        // A narrowing forbids the empty-selection fallback: restoring the set
        // the analyst just cut down is how "כן, רק את הראשון" ended up standing
        // for three filings again.
        latest?.role === 'user' ? narrowsSelection(latest.content) : false
      )
      const { selected } = orderBySelection(candidates, resolution.ids)
      return respond({
        // A PROMOTED TURN THROWS THE MODEL'S SENTENCE AWAY, and must.
        //
        // The reply belongs to the status the model CHOSE, and the prompt
        // requires a clarifying reply to be a question — "shall I pull both?".
        // Promoting the turn answers that question in code and starts the pull,
        // so shipping the sentence with it rendered Atlas asking permission
        // directly above the spinner for the attach it was already doing (cold
        // review, 2026-08-08). Asking for consent you have already acted on is
        // worse than not asking.
        //
        // `null` rather than a substitute sentence because the panel already
        // owns this case: `reply === null` + `ready` renders
        // `intakePullingNow` — "great, I'm pulling them in, it can take a
        // second" — which the founder asked for on 2026-08-04 and which is
        // localised where the wording belongs.
        reply: promoted ? null : selection.reply,
        status,
        selected,
        fallback: null,
        // Carried even alongside a good reply: the model answered from a
        // catalog it could not fully see, and the panel says so under the
        // sentence rather than leaving the gap invisible.
        sourceError,
        unknownCompany,
        unknownCompanyFrom,
        // THE MODEL'S WORDS AND ITS IDS DISAGREED — said out loud, not settled
        // internally. The analyst asked for less, the prose agreed with them and
        // the id list did not, and nothing here can know which half was meant.
        // Picking one silently is how a narrowing got reverted in the first
        // place; the disagreement is information they can act on in one sentence.
        unresolved: resolution.conflict ? ('narrowing_conflict' as const) : null,
      })
    }

    // ── the selection failed: deterministic, and SAID to be deterministic ────
    // Deliberately no second model call. `parseModelRequest('')` yields
    // interpreted:false, which is what makes the panel state that these are
    // keyword matches rather than an understood request.
    const degraded = parseModelRequest('', text)
    return respond({
      reply: null,
      status: 'clarifying',
      selected: [],
      fallback: findSources(degraded, corpus),
      sourceError,
      unknownCompany,
      unknownCompanyFrom,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/**
 * THE ONE EXIT FROM THIS ROUTE. Every result leaves through here, so the
 * ready/empty invariant holds without any call site remembering it — see
 * `intakeResult`, which owns that invariant and is unit-tested on it.
 */
function respond(result: IntakeResponse) {
  return NextResponse.json({ result: intakeResult(result) }, { headers: { 'Cache-Control': 'no-store' } })
}

/** The conversation, from an untrusted body. Caps the history so a long thread
 *  cannot grow the prompt without bound. */
function parseTurns(raw: unknown): IntakeTurn[] {
  if (!Array.isArray(raw)) return []
  const turns: IntakeTurn[] = []
  for (const t of raw) {
    const o = t as { role?: unknown; content?: unknown; proposed?: unknown; proposedRemote?: unknown }
    const role = o?.role === 'assistant' ? 'assistant' : o?.role === 'user' ? 'user' : null
    const content = typeof o?.content === 'string' ? o.content.trim() : ''
    if (!role || !content) continue
    // Bounded like the text is: a client cannot grow the prompt without limit.
    const proposed = Array.isArray(o?.proposed)
      ? o.proposed.filter((x): x is string => typeof x === 'string').slice(0, SELECTION_CANDIDATE_CAP)
      : undefined
    const proposedRemote = Array.isArray(o?.proposedRemote)
      ? (o.proposedRemote as unknown[])
          .map(readProposedRemote)
          .filter((x): x is ProposedRemote => x !== null)
          .slice(0, SELECTION_CANDIDATE_CAP)
      : undefined
    turns.push({
      role,
      content: content.slice(0, 4000),
      ...(proposed ? { proposed } : {}),
      ...(proposedRemote && proposedRemote.length > 0 ? { proposedRemote } : {}),
    })
  }
  return turns.slice(-20)
}

/**
 * One echoed MAYA pointer, or null.
 *
 * A POINTER IS ALL THAT IS TRUSTED. `title` is kept only so the panel can name
 * a file in a failure line; the attach route ignores it and asks MAYA for the
 * real one, so nothing here becomes a row anyone else sees.
 */
function readProposedRemote(raw: unknown): ProposedRemote | null {
  const o = (raw ?? {}) as Record<string, unknown>
  const mayaReportId = Number(o.mayaReportId)
  const issuerId = Number(o.issuerId)
  if (!Number.isInteger(mayaReportId) || mayaReportId <= 0) return null
  if (!Number.isInteger(issuerId) || issuerId < 1 || issuerId > 99_999) return null
  const publishedISO =
    typeof o.publishedISO === 'string' && !Number.isNaN(Date.parse(o.publishedISO)) ? o.publishedISO : null
  const title = typeof o.title === 'string' ? o.title.trim().slice(0, 300) : ''
  return { mayaReportId, issuerId, publishedISO, title }
}

/**
 * The MOST RECENT assistant turn, whatever it holds.
 *
 * ⚠ THIS USED TO SKIP TURNS THAT PROPOSED NOTHING, and that skip resurrected
 * sets the analyst had already thrown away (found 2026-08-08 while proving the
 * narrowing fix in the browser). The sequence:
 *
 *   Atlas: "these three?"        proposed:[A,B,C]
 *   analyst: "כן, רק את הראשון"  → the set is correctly cleared for this turn
 *   Atlas: "so just the 2021 one?"   (no `proposed` — nothing stands)
 *   analyst: "כן"                → lastProposal SCANNED PAST the empty turn,
 *                                  found [A,B,C] two turns back, and `ready`
 *                                  came out holding all three again.
 *
 * Clearing the set was pointless while a lookup could see around the clearing.
 * The standing proposal is what Atlas LAST PUT ON THE TABLE: a turn that offered
 * nothing offered nothing, and the answer is an empty list, not "keep looking".
 *
 * A turn that failed to interpret the request also lands here as empty, and that
 * is right for the same reason — Atlas has just said it did not understand, so
 * nothing is on the table. Costing the analyst one restatement is the safe half
 * of this trade; the other half fetches filings nobody asked for into a corpus
 * every member of the platform reads.
 */
function lastAssistantTurn(turns: IntakeTurn[]): IntakeTurn | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'assistant') return turns[i]
  }
  return null
}

/**
 * The set Atlas last put on the table, or [].
 *
 * ⚠ NOT "the most recent turn that HAD a set" — that scan-back is the bug
 * documented above. A turn that offered nothing offered nothing.
 *
 * The cost, worth stating plainly because it is reachable without the analyst
 * doing anything wrong: ONE FAILED SELECTION TURN NOW ERASES AN AGREED SET. If
 * `askModel` times out at 7s the response carries no `proposed`, that becomes
 * the last assistant turn, and a set agreed two turns earlier is gone — the old
 * scan-back would have preserved it. The panel is honest about it (it says the
 * request was not understood, and nothing claims files are coming), so the
 * analyst restates rather than being misled. Accepted deliberately: the
 * alternative is a lookup that can resurrect a set the analyst discarded, which
 * is the failure that gated this branch.
 */
function lastProposal(turns: IntakeTurn[]): string[] {
  return lastAssistantTurn(turns)?.proposed ?? []
}

/** The MAYA pointers from THAT SAME TURN — read off the one turn rather than
 *  scanned for independently, so the ids and the pointers can never come from
 *  different moments in the conversation. The id list stays the single record of
 *  WHAT was agreed; these only say where the remote ones can be found. */
function lastProposalRemote(turns: IntakeTurn[]): ProposedRemote[] {
  return lastAssistantTurn(turns)?.proposedRemote ?? []
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
