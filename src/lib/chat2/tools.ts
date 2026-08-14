// ─────────────────────────────────────────────────────────────────────────────
// THE TOOL REGISTRY — one door, two properties the spec (§2.2) makes law:
//
// 1. IDENTITY IS NEVER MODEL-SUPPLIED. `buildToolHandlers` closes over
//    `{userId, scope}` from the request; no tool schema below ever exposes a
//    userId/companyId parameter the model could set itself. `resolve_company`
//    is callable every turn precisely so a mid-conversation correction reaches
//    it WITHOUT the model needing to carry or restate identity.
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
import { listDisclosures } from '@/lib/maya/disclosures'
import { describeFailure } from '@/lib/maya/types'
import { getWorkspaceFull } from '@/lib/db/workspaces'
import { fenceSources, type SourceToFence } from './fence'
import { type ChatScope, type ToolHandler } from './toolDefs'

export type { ChatScope, ToolResult, ToolHandler } from './toolDefs'
export { TOOL_DEFS } from './toolDefs'

const asFenced = (sources: SourceToFence[]) => fenceSources(sources)

export function buildToolHandlers(scope: ChatScope): Record<string, ToolHandler> {
  return {
    async resolve_company(input) {
      const query = String(input.query ?? '')
      if (!query.trim()) return { content: 'a company name is required', isError: true }
      const { data, error } = await supabaseAdmin.from('company_aliases').select('company_id, alias, kind')
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
        result = await retrieveChunks(supabaseAdmin as never, { query, companyId })
      } catch (err) {
        return { content: `search failed: ${(err as Error).message}`, isError: true }
      }
      if (result.chunks.length === 0) {
        return { content: 'no matching corpus content was found for this scope — say so, do not guess' }
      }
      const sources: SourceToFence[] = result.chunks.map((c) => ({
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
      let q = supabaseAdmin
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
      const { data, error } = await supabaseAdmin
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
      const { data: company, error: companyErr } = await supabaseAdmin
        .from('companies')
        .select('tase_issuer_id')
        .eq('id', companyId)
        .maybeSingle()
      if (companyErr || !company?.tase_issuer_id) {
        return { content: 'this company has no MAYA issuer id on file', isError: true }
      }
      const result = await listDisclosures({ issuerId: Number(company.tase_issuer_id), fromYear, toYear })
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
      const found = await getWorkspaceFull(scope.userDb, scope.workspaceId).catch(() => null)
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
