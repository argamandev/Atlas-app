// ─────────────────────────────────────────────────────────────────────────────
// THE ONE DOOR to the agent tables. Two properties this module exists to hold:
//
// 1. OWNERSHIP IS FILTERED IN APPLICATION CODE, not only by RLS. Migration 032
//    puts an owner policy on every table, which protects anything querying
//    through the USER's client. The run driver (spec §4) cannot carry a user
//    session and uses the service role — and the service role BYPASSES RLS
//    ENTIRELY. On that path this filter is the only guard, so it is not
//    belt-and-braces, it is the belt.
// 2. ERRORS ARE READ. Supabase NEVER THROWS; it returns { data, error }. A
//    destructure that drops `error` turns a database outage into "you have no
//    agents" — the silent-degradation class rules/app.md forbids, and the exact
//    shape supabaseReadDiscipline.test.ts scans for.
//
// snake_case → camelCase happens HERE, once, so nothing downstream knows a
// column name.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

/** The injectable seam — same shape as ToolDeps in lib/chat2/tools.ts, so tests
 *  drive this with no network and no live database. */
export interface AgentsDb {
  client: SupabaseClient
}

export type AgentScopeKind = 'Call' | 'Workspace' | 'Company' | 'Sector' | 'Report'

export type AgentRow = {
  id: string
  userId: string
  name: string
  context: string | null
  mission: string
  scopeKind: AgentScopeKind | null
  scopeTargetId: string | null
  scopeTargetLabel: string | null
  anthropicAgentId: string | null
  anthropicMemoryStoreId: string | null
  anthropicDeploymentId: string | null
  scheduleCadence: string | null
  scheduleTimezone: string
  schedulePaused: boolean
  status: string
  createdAt: string
}

export type NewAgent = {
  userId: string
  name: string
  context?: string | null
  mission: string
  scopeKind?: AgentScopeKind | null
  scopeTargetId?: string | null
  scopeTargetLabel?: string | null
}

const COLUMNS = '*'

function toRow(r: any): AgentRow {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    context: r.context ?? null,
    mission: r.mission,
    scopeKind: r.scope_kind ?? null,
    scopeTargetId: r.scope_target_id ?? null,
    scopeTargetLabel: r.scope_target_label ?? null,
    anthropicAgentId: r.anthropic_agent_id ?? null,
    anthropicMemoryStoreId: r.anthropic_memory_store_id ?? null,
    anthropicDeploymentId: r.anthropic_deployment_id ?? null,
    scheduleCadence: r.schedule_cadence ?? null,
    scheduleTimezone: r.schedule_timezone,
    schedulePaused: r.schedule_paused,
    status: r.status,
    createdAt: r.created_at,
  }
}

export async function listAgents(db: AgentsDb, userId: string): Promise<AgentRow[]> {
  const { data, error } = await db.client
    .from('agents')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`listAgents failed: ${error.message}`)
  return (data ?? []).map(toRow)
}

export async function getAgent(db: AgentsDb, userId: string, id: string): Promise<AgentRow | null> {
  // BOTH filters. An id alone would let another fund read this agent by guessing
  // a uuid on any path where RLS is not in force.
  const { data, error } = await db.client
    .from('agents')
    .select(COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`getAgent failed: ${error.message}`)
  return data ? toRow(data) : null
}

export async function createAgent(db: AgentsDb, input: NewAgent): Promise<AgentRow> {
  // The owner is taken from `input.userId` and written explicitly. Any `user_id`
  // riding along in the payload is IGNORED by construction — identity comes from
  // the caller, never from data (the same law lib/chat2/tools.ts states for tool
  // arguments). Listing the fields rather than spreading `input` is what makes
  // that true; a spread would let a hostile payload override the owner.
  const { data, error } = await db.client
    .from('agents')
    .insert({
      user_id: input.userId,
      name: input.name,
      context: input.context ?? null,
      mission: input.mission,
      scope_kind: input.scopeKind ?? null,
      scope_target_id: input.scopeTargetId ?? null,
      scope_target_label: input.scopeTargetLabel ?? null,
      status: 'creating',
    })
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`createAgent failed: ${error.message}`)
  return toRow(data)
}
