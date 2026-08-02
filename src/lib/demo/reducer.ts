// ─────────────────────────────────────────────────────────────────────────────
// Session-only demo state — the pure reducer behind DemoStateProvider.
//
// PROJECTS MOVED OUT 2026-08-02: projects are real rows now (migration 015),
// owned and behind RLS, read and written through /api/projects.
//
// What remains here is WORKSPACES and AGENTS, which still ship NO backend.
// Creating one lives in React state for the session and RESETS ON RELOAD.
// Nothing here writes to storage, cookies or the server — imitating persistence
// is this repo's filed fake-data defect class, and the visible demo marker
// (components/ds/DemoBanner.tsx) is what tells the user.
//
// Kept pure and DOM-free so it is testable under node:test (the repo has no DOM
// test infra). Ids are derived, never Date.now()/Math.random(), so the reducer
// stays deterministic.
// ─────────────────────────────────────────────────────────────────────────────

import { emptyAgent, type AgentCard } from '@/lib/agents/data'
import { emptyWorkspace, type Workspace } from '@/lib/workspace/data'

export type DemoState = {
  agents: AgentCard[]
  workspaces: Workspace[]
  /** workspaceId -> working-document HTML */
  docHtml: Record<string, string>
}

export type DemoAction =
  | { type: 'addAgent'; agent: Omit<AgentCard, 'id'> }
  | { type: 'addWorkspace'; name: string }
  | { type: 'setDocHtml'; workspaceId: string; html: string }

/**
 * Deterministic, collision-free against the demo seeds (ag_*, slugs).
 * Exported because the provider must return the new id to its caller (so a
 * "New agent" click can route to it) — one source of truth, not two
 * implementations that can drift.
 */
export function nextId(prefix: string, taken: readonly { id: string }[]): string {
  let n = taken.length + 1
  const has = (id: string) => taken.some((t) => t.id === id)
  while (has(`${prefix}${n}`)) n += 1
  return `${prefix}${n}`
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'addAgent': {
      const id = nextId('new-agent-', state.agents)
      return {
        ...state,
        agents: [...state.agents, { ...emptyAgent(id, action.agent.name), ...action.agent, id }],
      }
    }
    case 'addWorkspace': {
      const id = nextId('new-workspace-', state.workspaces)
      return { ...state, workspaces: [...state.workspaces, emptyWorkspace(id, action.name)] }
    }
    case 'setDocHtml': {
      return { ...state, docHtml: { ...state.docHtml, [action.workspaceId]: action.html } }
    }
    default:
      return state
  }
}
