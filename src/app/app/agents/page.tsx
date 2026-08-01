import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getAgentsPageData } from '@/lib/agents/data'
import { getWorkspaces } from '@/lib/workspace/data'
import { AppPage } from '@/components/app/AppPage'
import { AgentsPage as AgentsSurface } from '@/components/agents/AgentsPage'
import type { AgentScopeKind } from '@/lib/agents/data'

// Agents — FRONTEND-ONLY. Full design anatomy lives in components/agents/*
// (deck 2085 · grid 2102 · finished 2175 · scheduled 2191 · create 2211 · dock 2263).
// Data flows through lib/agents/data.ts so the real agent runtime is a swap there.
export default async function AgentsRoute() {
  const dict = getDictionary(getLocale())
  const [{ scheduled, finished, recent }, workspaces] = await Promise.all([
    getAgentsPageData(),
    getWorkspaces(),
  ])

  // Assignment targets are DERIVED from the existing stub feeds rather than invented
  // fresh — a new agent can only be pointed at something the app already shows.
  // Scopes are Call / Workspace / Company / Sector / Report. A sector is the
  // leading segment of a workspace's subtitle ("Shipping · TASE" → Shipping);
  // that keeps the list to sectors the app can actually show, rather than a
  // hardcoded taxonomy nothing else in the product knows about. Company is the
  // issuer itself — the two are different jobs, so both are offered.
  const sectors = Array.from(new Set(workspaces.map((w) => w.sub.split('·')[0]!.trim()).filter(Boolean)))
  const companies = Array.from(new Set(workspaces.map((w) => w.company).filter(Boolean)))
  const fileWord = (n: number) => (n === 1 ? dict.workspace.fileOne : dict.workspace.files)
  const targets: Record<AgentScopeKind, { label: string; meta: string }[]> = {
    Workspace: workspaces.map((w) => ({
      label: w.name,
      meta: `${w.fileCount} ${fileWord(w.fileCount)}`,
    })),
    Company: companies.map((c) => ({ label: c, meta: 'TASE' })),
    Sector: sectors.map((s) => ({ label: s, meta: 'TASE' })),
    Call: workspaces.map((w) => ({ label: `${w.company} — Q2 2026 call`, meta: w.updatedLabel })),
    Report: workspaces
      .flatMap((w) => w.files)
      .filter((f) => f.kind === 'pdf')
      .map((f) => ({ label: f.name, meta: f.year ?? '' })),
  }

  return (
    <AppPage contentClassName="bg-shell">
      <AgentsSurface scheduled={scheduled} finished={finished} recent={recent} targets={targets} />
    </AppPage>
  )
}
