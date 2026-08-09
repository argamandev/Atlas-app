import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getAgentsPageData } from '@/lib/agents/data'
import { getWorkspaces } from '@/lib/workspace/data'
import { AppPage } from '@/components/app/AppPage'
import { AgentsPage as AgentsSurface } from '@/components/agents/AgentsPage'
import type { AgentScopeKind, AgentTarget } from '@/lib/agents/data'

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

  // The same report name lives in several workspaces ("2025 annual.pdf"), so the
  // Report list is DEDUPED by name — otherwise the picker offered the same
  // document twice. Every target also carries a stable `id`; the picker keys and
  // selects on that, never on the label.
  const reports = new Map<string, AgentTarget>()
  for (const f of workspaces.flatMap((w) => w.files)) {
    if (f.kind !== 'pdf' || reports.has(f.name)) continue
    reports.set(f.name, { id: `report:${f.name}`, label: f.name, meta: f.year ?? '' })
  }

  const targets: Record<AgentScopeKind, AgentTarget[]> = {
    Workspace: workspaces.map((w) => ({
      id: `workspace:${w.id}`,
      label: w.name,
      meta: `${w.fileCount} ${fileWord(w.fileCount)}`,
    })),
    Company: companies.map((c) => ({ id: `company:${c}`, label: c, meta: 'TASE' })),
    Sector: sectors.map((s) => ({ id: `sector:${s}`, label: s, meta: 'TASE' })),
    // The label carried a hardcoded "Q2 2026" until 2026-08-09 — a period nothing
    // here knows — and then briefly "<company> — Investor call", which names an
    // event type a WORKSPACE may not be. A workspace has neither a quarter nor an
    // event kind, so the target is named by its company and typed by the scope
    // heading it already sits under.
    Call: workspaces.map((w) => ({
      id: `call:${w.id}`,
      label: w.company,
      meta: w.updatedLabel,
    })),
    Report: Array.from(reports.values()),
  }

  return (
    <AppPage contentClassName="bg-shell">
      <AgentsSurface scheduled={scheduled} finished={finished} recent={recent} targets={targets} />
    </AppPage>
  )
}
