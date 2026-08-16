// ─────────────────────────────────────────────────────────────────────────────
// Agents data interface — FRONTEND-ONLY STUB.
// The Agents page renders exclusively through this module; the real agent
// runtime plugs in here later. Stub content mirrors the design's demo agents
// (design-import/Atlas MVP.dc.html: page body 2098-2210, agents seed 2573-2594).
//
// The findings below are FABRICATED and carry `src` lines that look like real
// citations into real calls and filings. Every surface that renders them shows a
// visible demo marker, and each finding row additionally carries an inline
// marker — see components/ds/DemoBanner.tsx and .claude/rules/app.md.
//
// The real, owner-scoped data layer for the four live agent tables lives in
// `agents/db.ts` (`.superpowers/sdd/plan-1-foundations/task-5-brief.md`, spec
// §2). This stub is untouched — wiring the page to `db.ts` is a later plan.
// ─────────────────────────────────────────────────────────────────────────────

// Order follows the design's 2026-08-01 round (Call / Workspace / Sector /
// Report); Company is kept alongside Sector by founder call the same day — an
// agent can be pointed at ONE issuer or at a whole sector, and those are
// different jobs. Five kinds, so the picker lays them out 3-up rather than
// squeezing five labels into one row.
export const AGENT_SCOPE_KINDS = ['Call', 'Workspace', 'Company', 'Sector', 'Report'] as const
export type AgentScopeKind = (typeof AGENT_SCOPE_KINDS)[number]

/**
 * One selectable assignment target. `id` is what the UI keys and selects on —
 * `label` is NOT unique (the same report name exists in several workspaces), and
 * keying on it made one click select two rows and React log a duplicate key.
 */
export type AgentTarget = { id: string; label: string; meta: string }

/** One row of "Recent agent chats" — a question already put to an agent. */
export type RecentAgentChat = {
  id: string
  question: string
  agentId: string
  agentName: string
  when: string
}

/** One thing an agent claims it found, with the source it claims to have found it in. */
export type AgentFinding = { text: string; src: string }

export type AgentCard = {
  id: string
  /** terminal-style name, e.g. "analyst" */
  name: string
  /** two-letter tile, e.g. "AN" */
  ini: string
  /** small caps domain line, e.g. "EARNINGS & GUIDANCE" */
  domain: string
  /** sentence-case role line used in the dock profile, e.g. "Earnings & guidance" */
  role: string
  description: string
  status: 'idle' | 'running'
  /** what this agent is bound to */
  scopeKind: AgentScopeKind
  scopeTarget: string
  done: boolean
  /** last task headline, e.g. "Q1 transcript digest · @Tigbur" */
  task: string
  /** what the task produced, e.g. "3 findings" */
  out: string
  when: string
  /** the agent's opening line when its chat is opened */
  lead: string
  findings: AgentFinding[]
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
  /** which agent produced it — opens that agent's dock */
  agentId: string
}

const DEMO: {
  agents: AgentCard[]
  scheduled: ScheduledAgent[]
  finished: FinishedTask[]
  recent: RecentAgentChat[]
} = {
  agents: [
    {
      id: 'agent-analyst',
      name: 'analyst',
      ini: 'AN',
      domain: 'EARNINGS & GUIDANCE',
      role: 'Earnings & guidance',
      description: 'Digests live calls and flags changes in management guidance.',
      status: 'idle',
      scopeKind: 'Call',
      scopeTarget: 'Tigbur — Q2 2026 investor call',
      done: true,
      task: 'Q1 transcript digest · @Tigbur',
      out: '3 findings',
      when: '2h ago',
      lead: 'Here is what I pulled out of the Q1 transcript. Ask me about any of it.',
      findings: [
        {
          text: 'Management lifted the FY revenue band to ₪1.5B–1.6B, up from ₪1.4B.',
          src: 'Q1 call · 14:02 · CEO',
        },
        {
          text: 'Operating-margin target narrowed to 3.7%, a tenth of a point better than last year.',
          src: 'Q1 call · 22:40 · CFO',
        },
        {
          text: 'Foreign-ownership question flagged as the standing watch item into the tender.',
          src: 'Q1 call · 31:15 · Chair',
        },
      ],
    },
    {
      id: 'agent-doc-reader',
      name: 'doc_reader',
      ini: 'DR',
      domain: 'FILINGS & REPORTS',
      role: 'Filings & reports',
      description: 'Reads annual reports and pulls structured financials.',
      status: 'idle',
      scopeKind: 'Report',
      scopeTarget: '2025 annual.pdf',
      done: true,
      task: 'Peer comparison: 3 shipping cos',
      out: '1 table',
      when: 'yesterday',
      lead: 'I built the peer table across three shipping companies. Three things stand out.',
      findings: [
        {
          text: 'Tigbur carries the thinnest operating margin of the three, at 3.7% vs 5.1% and 6.4%.',
          src: 'peer comparison.xlsx · row 12',
        },
        {
          text: 'It is the only one of the three still growing revenue every year since 2022.',
          src: 'financials.xlsx · 4 years',
        },
        {
          text: 'Fleet age is nine years above the peer median — capex is deferred, not avoided.',
          src: '2025 annual.pdf · note 6',
        },
      ],
    },
  ],
  scheduled: [
    { id: 'sched-earnings-watch', name: 'Earnings watch', scheduleLabel: 'Jun 19' },
    { id: 'sched-sector-scan', name: 'Sector scan', scheduleLabel: 'weekly' },
  ],
  finished: [
    {
      id: 'task-q1-digest',
      title: 'Q1 transcript digest · @Tigbur',
      meta: '3 findings · 2h ago · analyst',
      agentId: 'agent-analyst',
    },
    {
      id: 'task-peer-comparison',
      title: 'Peer comparison: 3 shipping cos',
      meta: '1 table · yesterday · doc_reader',
      agentId: 'agent-doc-reader',
    },
  ],
  recent: [
    {
      id: 'recent-analyst-mind',
      question: 'What would change your mind here?',
      agentId: 'agent-analyst',
      agentName: 'analyst',
      when: '2h ago',
    },
    {
      id: 'recent-analyst-source',
      question: 'Show me the source behind 3 findings',
      agentId: 'agent-analyst',
      agentName: 'analyst',
      when: 'yesterday',
    },
    {
      id: 'recent-doc-mind',
      question: 'What would change your mind here?',
      agentId: 'agent-doc-reader',
      agentName: 'doc_reader',
      when: 'Jun 14',
    },
    {
      id: 'recent-doc-table',
      question: 'Show me the source behind 1 table',
      agentId: 'agent-doc-reader',
      agentName: 'doc_reader',
      when: 'Jun 11',
    },
  ],
}

export async function getAgentsPageData(): Promise<typeof DEMO> {
  return DEMO
}

/** An agent the user just created: idle, unscoped work, nothing found yet. */
export function emptyAgent(id: string, name: string): AgentCard {
  return {
    id,
    name,
    ini: name.slice(0, 2).toUpperCase(),
    domain: '',
    role: '',
    description: '',
    status: 'idle',
    scopeKind: 'Workspace',
    scopeTarget: '',
    done: false,
    task: '',
    out: '',
    when: 'just now',
    lead: '',
    findings: [],
  }
}
