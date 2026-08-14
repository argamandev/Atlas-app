// ─────────────────────────────────────────────────────────────────────────────
// THE TOOL REGISTRY — one door, two properties the spec (§2.2) makes law:
//
// 1. IDENTITY IS NEVER MODEL-SUPPLIED — and note exactly how far that reaches,
//    because round 1's cold review caught this comment overstating it. What no
//    schema exposes is `userId` and `workspaceId`: those come only from the
//    request, via the closure, and `read_workspace` reads them through the
//    caller's own RLS-bearing client (`scope.userDb`), never `supabaseAdmin`.
//    `companyId` IS model-settable on `search_corpus`, `lookup_facts` and
//    `list_disclosures`, and each prefers the model's value over the resolved
//    scope. That is deliberate and safe HERE for one reason and only one: those
//    three read the SHARED corpus, which every authenticated member may read in
//    full (`docs/DATA-MODEL.md`), so choosing a company selects a subset of what
//    the caller could already see — it is a scoping choice, not an access one.
//    The moment a tool reaches a PERSONAL table, that argument evaporates and
//    identity must come from the closure. `resolve_company` stays callable every
//    turn so a mid-conversation correction reaches it without the model carrying
//    identity in prose.
// 2. EVERY RESULT QUOTING A DOCUMENT IS FENCED, titles and labels defanged
//    (`fence.ts`) — corpus content, filing titles and web pages alike.
//
// This is the CHAT/ASK-ATLAS/WORKSPACE roster — the V1 registry minus the two
// agents-only tools (`report_finding`, `update_memory`, spec §2.2), which have
// no chat-surface caller yet.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase'
import { resolveCompany, type CompanyAliasRow } from '@/lib/company/resolve'
import { retrieveChunks, type RetrievalResult } from '@/lib/corpus/retrieve'
import { diversifyByCompany } from '@/lib/corpus/diversify'
import { type CorpusDb } from '@/lib/corpus/reindex'
import { listDisclosures } from '@/lib/maya/disclosures'
import { describeFailure } from '@/lib/maya/types'
// `db/workspaces` imports `server-only`, which resolves only inside Next's build —
// a STATIC import here makes this whole registry unloadable from a test process.
// Imported at call time instead, exactly as `loop.ts` lazily imports this file.
type GetWorkspaceFull = typeof import('@/lib/db/workspaces').getWorkspaceFull
const getWorkspaceFull: GetWorkspaceFull = async (...args) =>
  (await import('@/lib/db/workspaces')).getWorkspaceFull(...args)
import { fenceSources, type SourceToFence } from './fence'
import { type ChatScope, type ToolHandler } from './toolDefs'

export type { ChatScope, ToolResult, ToolHandler } from './toolDefs'
export { TOOL_DEFS } from './toolDefs'

const asFenced = (sources: SourceToFence[]) => fenceSources(sources)

/**
 * Search mode's shape (spec §2.5.5–6): top-20 market-wide, and no more than
 * three windows from any one company so the answer reads as LEADS across the
 * market rather than a profile of whichever issuer ranked best. Three is enough
 * for a company to earn a real paragraph and few enough that seven companies fit
 * the same budget. Changing either number is a retrieval change and re-runs the
 * class-G discovery cases of the eval gate.
 */
export const SEARCH_MODE_LIMIT = 20
export const SEARCH_MODE_PER_COMPANY = 3

/**
 * The outside world these handlers reach, injectable so the registry can be
 * driven without a network or a live Supabase client.
 *
 * This seam exists because round 1's cold review found the file had NO test at
 * all: `fence.ts` was proven in isolation, but the path corpus text actually
 * takes into the prompt — handler → `asFenced` → tool result — was never once
 * exercised, which is precisely where a fencing regression would land. Proving
 * the fence on a synthetic string while the real call site is untested is the
 * shape of green-signal M1 warns about.
 */
export interface ToolDeps {
  db: typeof supabaseAdmin
  retrieve: typeof retrieveChunks
  listDisclosures: typeof listDisclosures
  getWorkspaceFull: typeof getWorkspaceFull
}

export function buildToolHandlers(
  scope: ChatScope,
  deps: Partial<ToolDeps> = {}
): Record<string, ToolHandler> {
  const db = deps.db ?? supabaseAdmin
  const retrieve = deps.retrieve ?? retrieveChunks
  const disclosures = deps.listDisclosures ?? listDisclosures
  const workspaceFull = deps.getWorkspaceFull ?? getWorkspaceFull
  return {
    async resolve_company(input) {
      const query = String(input.query ?? '')
      if (!query.trim()) return { content: 'a company name is required', isError: true }
      const { data, error } = await db.from('company_aliases').select('company_id, alias, kind')
      if (error) return { content: `alias lookup failed: ${error.message}`, isError: true }
      const rows: CompanyAliasRow[] = (data ?? []).map((r) => ({
        companyId: r.company_id as string,
        alias: r.alias as string,
        kind: r.kind as CompanyAliasRow['kind'],
      }))
      const companyId = resolveCompany(query, rows)
      if (!companyId) return { content: `no single company resolves to "${query}" — ask the user to clarify` }
      scope.companyId = companyId
      return { content: `resolved companyId=${companyId}` }
    },

    async search_corpus(input) {
      const query = String(input.query ?? '')
      if (!query.trim()) return { content: 'a query is required', isError: true }
      const companyId = (input.companyId as string | undefined) ?? scope.companyId ?? undefined
      let result: RetrievalResult
      try {
        // `as unknown as` rather than `as never`: the repo's idiom for this same
        // coercion (db/transcripts.ts, api/transcripts/route.ts) still checks the
        // TARGET shape, so a change to what retrieveChunks wants fails here.
        result = await retrieve(db as unknown as CorpusDb, { query, companyId })
      } catch (err) {
        return { content: `search failed: ${(err as Error).message}`, isError: true }
      }
      if (result.chunks.length === 0) {
        return { content: 'no matching corpus content was found for this scope — say so, do not guess' }
      }
      // SEARCH MODE DIVERSIFIES; PINPOINT MODE MUST NOT (spec §2.5.6). Unscoped,
      // similarity clusters and one issuer takes the whole head of the list, so a
      // market-wide question gets answered about a single company — measured on
      // eval case 04. Scoped, every row IS the company the user asked about and
      // interleaving would be actively wrong. The branch is on the same fact the
      // mode is (`companyId`), so the two can never disagree.
      const chunks = companyId
        ? result.chunks
        : diversifyByCompany(result.chunks, { limit: SEARCH_MODE_LIMIT, perCompany: SEARCH_MODE_PER_COMPANY })
      const sources: SourceToFence[] = chunks.map((c) => ({
        kind: c.sourceType === 'transcript' ? 'transcript' : 'filing',
        label: `chunkId=${c.id} ${
          c.sourceType === 'transcript' ? `lines ${c.firstLineId}-${c.lastLineId}` : `page ${c.pageNo}`
        }`,
        content: c.content,
      }))
      const truncationNote = result.dense.truncated
        ? '\n\n(this search was truncated — more may exist in scope)'
        : ''
      return { content: asFenced(sources) + truncationNote }
    },

    async lookup_facts(input) {
      const companyId = String(input.companyId ?? scope.companyId ?? '')
      if (!companyId)
        return { content: 'a companyId is required — call resolve_company first', isError: true }
      let q = db
        .from('filing_facts')
        .select('concept, value, currency, period_start, period_end, metadata')
        .eq('company_id', companyId)
      const concept = input.concept as string | undefined
      if (concept) q = q.ilike('concept', `%${concept}%`)
      const { data, error } = await q.limit(50)
      if (error) return { content: `facts lookup failed: ${error.message}`, isError: true }
      if (!data || data.length === 0) {
        return {
          content: 'no structured facts for this company/concept — this is not zero, it is absent data',
        }
      }
      const lines = data.map(
        (f) =>
          `${f.concept}: ${f.value ?? '(no value)'} ${f.currency ?? ''} [${f.period_start ?? '?'}..${f.period_end ?? '?'}]`
      )
      return {
        content: asFenced([
          { kind: 'filing_fact', label: `${companyId} filing facts`, content: lines.join('\n') },
        ]),
      }
    },

    async read_source(input) {
      const chunkId = String(input.chunkId ?? '')
      if (!chunkId) return { content: 'a chunkId is required', isError: true }
      const { data, error } = await db
        .from('document_chunks')
        .select('id, content, source_type, first_line_id, last_line_id, page_no')
        .eq('id', chunkId)
        .maybeSingle()
      if (error) return { content: `read_source failed: ${error.message}`, isError: true }
      if (!data) return { content: 'no chunk found for that id — it may have been re-indexed', isError: true }
      const label =
        data.source_type === 'transcript'
          ? `lines ${data.first_line_id}-${data.last_line_id}`
          : `page ${data.page_no}`
      return {
        content: asFenced([
          {
            kind: data.source_type === 'transcript' ? 'transcript' : 'filing',
            label,
            content: data.content as string,
          },
        ]),
      }
    },

    async list_disclosures(input) {
      const companyId = String(input.companyId ?? scope.companyId ?? '')
      if (!companyId)
        return { content: 'a companyId is required — call resolve_company first', isError: true }
      const fromYear = Number(input.fromYear)
      const toYear = Number(input.toYear)
      const { data: company, error: companyErr } = await db
        .from('companies')
        .select('tase_issuer_id')
        .eq('id', companyId)
        .maybeSingle()
      if (companyErr || !company?.tase_issuer_id) {
        return { content: 'this company has no MAYA issuer id on file', isError: true }
      }
      const result = await disclosures({ issuerId: Number(company.tase_issuer_id), fromYear, toYear })
      if (!result.ok)
        return { content: `MAYA disclosure feed failed: ${describeFailure(result.failure)}`, isError: true }
      if (result.data.length === 0) return { content: 'no disclosures found in this window' }
      const lines = result.data.map((f) => `${f.title ?? '(untitled)'} — ${f.publicationDate ?? '?'}`)
      return {
        content: asFenced([
          { kind: 'disclosure', label: `MAYA feed ${fromYear}-${toYear}`, content: lines.join('\n') },
        ]),
      }
    },

    async read_workspace() {
      if (!scope.workspaceId) return { content: 'this chat is not scoped to a workspace', isError: true }
      if (!scope.userDb) return { content: 'workspace access is unavailable in this context', isError: true }
      const found = await workspaceFull(scope.userDb, scope.workspaceId).catch(() => null)
      if (!found) return { content: 'workspace not found', isError: true }
      const lines = found.items.map((i) => i.name)
      return {
        content: asFenced([
          {
            kind: 'workspace',
            label: found.workspace.doc_title ?? 'workspace',
            content: lines.join('\n') || '(empty)',
          },
        ]),
      }
    },
  }
}
