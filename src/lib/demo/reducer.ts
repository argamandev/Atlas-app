// ─────────────────────────────────────────────────────────────────────────────
// Session-only demo state — the pure reducer behind DemoStateProvider.
//
// SCOPE LOCK (spec 2026-08-01-three-surfaces-import-design §3.3): this chapter
// ships NO backend. Creating a project/agent/workspace and editing a project or
// the working document are real, but they live in React state for the session
// and RESET ON RELOAD. Nothing here writes to storage, cookies or the server —
// imitating persistence is this repo's filed fake-data defect class.
//
// Kept pure and DOM-free so it is testable under node:test (the repo has no DOM
// test infra). Ids are derived, never Date.now()/Math.random(), so the reducer
// stays deterministic.
// ─────────────────────────────────────────────────────────────────────────────

import { emptyProject, type Project } from '@/lib/projects/data'
import { emptyAgent, type AgentCard } from '@/lib/agents/data'
import { emptyWorkspace, type Workspace } from '@/lib/workspace/data'

export type DemoState = {
  projects: Project[]
  agents: AgentCard[]
  workspaces: Workspace[]
  /** workspaceId -> working-document HTML */
  docHtml: Record<string, string>
}

export type DemoAction =
  | { type: 'addProject'; name: string }
  | { type: 'patchProject'; id: string; patch: Partial<Project> }
  | { type: 'addAgent'; agent: Omit<AgentCard, 'id'> }
  | { type: 'addWorkspace'; name: string }
  | { type: 'setDocHtml'; workspaceId: string; html: string }

/** Deterministic, collision-free against the demo seeds (which use p1/p2/p3, ag_*, slugs). */
function nextId(prefix: string, taken: readonly { id: string }[]): string {
  let n = taken.length + 1
  const has = (id: string) => taken.some((t) => t.id === id)
  while (has(`${prefix}${n}`)) n += 1
  return `${prefix}${n}`
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'addProject': {
      const id = nextId('new-project-', state.projects)
      return { ...state, projects: [...state.projects, emptyProject(id, action.name)] }
    }
    case 'patchProject': {
      return {
        ...state,
        projects: state.projects.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)),
      }
    }
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
