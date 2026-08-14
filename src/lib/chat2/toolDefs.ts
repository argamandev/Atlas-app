// ─────────────────────────────────────────────────────────────────────────────
// PURE tool schema + shared types — split out of `tools.ts` deliberately so
// the loop can import the SCHEMA (sent to the Messages API on every call)
// without pulling in `tools.ts`'s `@/lib/supabase` import, which throws at
// module load without live Supabase env vars. Handlers (`buildToolHandlers`,
// `tools.ts`) are wired in lazily by the loop instead — see loop.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ChatScope {
  userId: string
  /** Set once resolve_company (or the caller's own grounding) has picked a company. */
  companyId?: string | null
  transcriptId?: string | null
  workspaceId?: string | null
  /**
   * The CALLER'S OWN supabase client (RLS-bearing), required only for
   * `read_workspace` — workspaces are personal rows and must never be read
   * through the service role (db.md ownership law). Absent = read_workspace
   * degrades to a visible tool error rather than reaching for supabaseAdmin.
   */
  userDb?: SupabaseClient
}

export interface ToolResult {
  /** Anthropic tool_result content — plain text, already fenced where it quotes a source. */
  content: string
  isError?: boolean
}

export type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>

/** JSON-schema tool definitions, sent to the Messages API verbatim. */
export const TOOL_DEFS = [
  {
    name: 'resolve_company',
    description:
      'Resolve a company name, abbreviation or ticker the user typed to its Atlas company id. ' +
      'Call this EVERY time the user names or corrects a company — including mid-conversation — ' +
      'before searching or citing anything about it. Returns null honestly when the name is ' +
      'unknown or ambiguous between two companies.',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'the company name/ticker as the user wrote it' } },
      required: ['query'],
    },
  },
  {
    name: 'search_corpus',
    description:
      'Semantic search over calls and filings. Scope to a company when one is resolved — this is ' +
      'the single biggest accuracy multiplier. Returns short windows with citation anchors, never ' +
      'whole documents.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' },
        companyId: { type: 'string', description: 'optional — the id from resolve_company' },
      },
      required: ['query'],
    },
  },
  {
    name: 'lookup_facts',
    description:
      'Structured numeric facts (revenue, profit, etc.) parsed from a filing’s XBRL data. ' +
      'Use for a specific number instead of search_corpus. Returns "no structured facts" honestly ' +
      'for companies/periods without XBRL (never a fabricated zero).',
    input_schema: {
      type: 'object' as const,
      properties: {
        companyId: { type: 'string' },
        concept: { type: 'string', description: 'optional substring filter, e.g. "Revenue"' },
      },
      required: ['companyId'],
    },
  },
  {
    name: 'read_source',
    description: 'Open the full window around a citation anchor returned by search_corpus.',
    input_schema: {
      type: 'object' as const,
      properties: { chunkId: { type: 'string' } },
      required: ['chunkId'],
    },
  },
  {
    name: 'list_disclosures',
    description: 'Live MAYA disclosure feed for a company — what it has filed, by year.',
    input_schema: {
      type: 'object' as const,
      properties: {
        companyId: { type: 'string' },
        fromYear: { type: 'number' },
        toYear: { type: 'number' },
      },
      required: ['companyId', 'fromYear', 'toYear'],
    },
  },
  {
    name: 'read_workspace',
    description:
      'Read the items on the workspace this chat is scoped to. Only usable inside a workspace chat.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
]
