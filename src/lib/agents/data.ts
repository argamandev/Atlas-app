// ─────────────────────────────────────────────────────────────────────────────
// Agents data interface — FRONTEND-ONLY STUB (Milestone 1).
// The Agents page renders exclusively through this module; the real agent
// runtime plugs in here later. Stub content mirrors the design's demo agents
// (design-import/Atlas MVP.dc.html, Agents section).
// ─────────────────────────────────────────────────────────────────────────────

export type AgentCard = {
  id: string
  /** terminal-style name, e.g. "analyst" */
  name: string
  /** small caps domain line, e.g. "EARNINGS & GUIDANCE" */
  domain: string
  description: string
  status: 'idle' | 'running'
}

export type ScheduledAgent = {
  id: string
  name: string
  /** mono chip: a date ("Jun 19") or cadence ("weekly") */
  scheduleLabel: string
}

export type FinishedTask = {
  id: string
  title: string
  /** mono meta line, e.g. "3 findings · 2h ago" */
  meta: string
}

const DEMO: { agents: AgentCard[]; scheduled: ScheduledAgent[]; finished: FinishedTask[] } = {
  agents: [
    {
      id: 'agent-analyst',
      name: 'analyst',
      domain: 'EARNINGS & GUIDANCE',
      description: 'Digests live calls and flags changes in management guidance.',
      status: 'idle',
    },
    {
      id: 'agent-doc-reader',
      name: 'doc_reader',
      domain: 'FILINGS & REPORTS',
      description: 'Reads annual reports and pulls structured financials.',
      status: 'idle',
    },
  ],
  scheduled: [
    { id: 'sched-earnings-watch', name: 'Earnings watch', scheduleLabel: 'Jun 19' },
    { id: 'sched-sector-scan', name: 'Sector scan', scheduleLabel: 'weekly' },
  ],
  finished: [
    { id: 'task-q1-digest', title: 'Q1 transcript digest · @Tigbur', meta: '3 findings · 2h ago' },
    { id: 'task-peer-comparison', title: 'Peer comparison: 3 shipping cos', meta: '1 table · yesterday' },
  ],
}

export async function getAgentsPageData(): Promise<typeof DEMO> {
  return DEMO
}
