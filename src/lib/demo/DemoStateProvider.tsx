'use client'

import { createContext, useCallback, useContext, useMemo, useReducer } from 'react'
import { demoReducer, nextId, type DemoState } from './reducer'
import type { AgentCard } from '@/lib/agents/data'

// ─────────────────────────────────────────────────────────────────────────────
// Session-only demo state for the workspace and agent surfaces.
//
// Mounted in the /app shell layout (beside PlayerProvider / LiveAudioProvider)
// so that creating an agent or typing the working document SURVIVES navigation
// between /app/* routes — otherwise a created agent would vanish the moment you
// opened it, because the list and the detail are different URLs.
//
// PROJECTS ARE NO LONGER HERE (2026-08-02). They are real rows behind RLS and go
// through /api/projects, so they survive a reload and belong to one account.
//
// What is left deliberately does NOT survive a reload: workspaces and agents
// have no backend yet, and imitating persistence is the repo's filed fake-data
// defect class. The visible demo marker (components/ds/DemoBanner.tsx) is what
// tells the user.
// ─────────────────────────────────────────────────────────────────────────────

type DemoContextValue = DemoState & {
  addAgent: (agent: Omit<AgentCard, 'id'>) => string
  addWorkspace: (name: string) => string
  setDocHtml: (workspaceId: string, html: string) => void
}

const DemoContext = createContext<DemoContextValue | null>(null)

export function DemoStateProvider({ seed, children }: { seed: DemoState; children: React.ReactNode }) {
  const [state, dispatch] = useReducer(demoReducer, seed)

  // The reducer owns id generation; nextId is imported from it (not reimplemented)
  // so the id returned here is by construction the id the reducer just assigned.
  const addAgent = useCallback(
    (agent: Omit<AgentCard, 'id'>) => {
      const id = nextId('new-agent-', state.agents)
      dispatch({ type: 'addAgent', agent })
      return id
    },
    [state.agents]
  )

  const addWorkspace = useCallback(
    (name: string) => {
      const id = nextId('new-workspace-', state.workspaces)
      dispatch({ type: 'addWorkspace', name })
      return id
    },
    [state.workspaces]
  )

  const setDocHtml = useCallback(
    (workspaceId: string, html: string) => dispatch({ type: 'setDocHtml', workspaceId, html }),
    []
  )

  const value = useMemo<DemoContextValue>(
    () => ({ ...state, addAgent, addWorkspace, setDocHtml }),
    [state, addAgent, addWorkspace, setDocHtml]
  )

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export function useDemoState(): DemoContextValue {
  const ctx = useContext(DemoContext)
  if (!ctx) {
    throw new Error('useDemoState must be used inside <DemoStateProvider> (mounted in /app layout)')
  }
  return ctx
}
