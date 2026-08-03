// ─────────────────────────────────────────────────────────────────────────────
// Workspace data interface — FRONTEND-ONLY STUB.
// The Workspace surfaces render exclusively through this module, so wiring the
// real backend later is a swap here, not a page rebuild. Content is ported from
// the design source (design-import/Atlas MVP.dc.html): workspaces seed 2493-2512,
// sorts 3490, threads 3505-3511, agent profiles 3585-3592, sessions 3600-3615,
// legal areas 3643, steps 3647, findings 3653-3660, system agents 3829.
//
// EVERYTHING BELOW IS FABRICATED demo content about real TASE issuers — invented
// financials and legal findings carrying `src` lines shaped like real citations.
// Every surface rendering it shows a visible demo marker in both locales, and
// finding rows carry an inline marker. See components/ds/DemoBanner.tsx and
// .claude/rules/app.md (degradation must be VISIBLE).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The first three are the REAL provenances a persisted item can have (migration
 * 016). The last three are legacy display kinds still used by the agent and
 * legal demo constants further down this file, which stay demo this chapter
 * because agent execution needs the deploy.
 */
export type WsFileKind = 'transcript' | 'document' | 'file' | 'pdf' | 'xlsx' | 'slide'

export type WsFile = {
  id: string
  name: string
  kind: WsFileKind
  year?: string
  /** open in the side-by-side view — persisted as workspace_items.is_open */
  live?: boolean
}

export type Workspace = {
  id: string
  name: string
  /** e.g. "Tigbur Group · Shipping · TASE" — kept for the picker card */
  subtitle: string
  fileCount: number
  /** relative time label, e.g. "2h ago" */
  updatedLabel: string
  /** avatar tile glyph (Hebrew initial or emoji) */
  initial: string
  /** e.g. "Tigbur Group" / "3 companies" */
  company: string
  /** e.g. "Shipping · TASE" / "Sector" */
  sub: string
  files: WsFile[]
  agents: string[]
  actions: string[]
  /** the working document's title, e.g. "Tigbur — what we know" */
  docTitle: string
}

export type WsThreadGroup = 'Today' | 'Yesterday' | 'Earlier'

export type WsThread = {
  id: string
  title: string
  snippet: string
  when: string
  group: WsThreadGroup
}

export type WsAgent = {
  name: string
  ini: string
  role: string
  /** what it read, e.g. "6 files · 412 pages" */
  read: string
  when: string
  findings: string[]
}

export type WsActionKind = 'open' | 'build' | 'agent' | 'doc'
export type WsAction = { text: string; when: string; kind: WsActionKind }
export type WsSession = { label: string; items: WsAction[] }

export type LegalSeverity = 'flag' | 'medium' | 'clear'
export type LegalFinding = {
  /** display label: "Flag" | "Medium" | "Clear" */
  sev: string
  k: LegalSeverity
  text: string
  src: string
}

function withCounts(w: Omit<Workspace, 'fileCount' | 'subtitle'>): Workspace {
  return { ...w, fileCount: w.files.length, subtitle: `${w.company} · ${w.sub}` }
}

const DEMO_WORKSPACES: Workspace[] = [
  withCounts({
    id: 'ws-tigbur-privatization',
    name: 'Tigbur — privatization review',
    updatedLabel: '2h ago',
    initial: 'ת',
    company: 'Tigbur Group',
    sub: 'Shipping · TASE',
    files: [
      { id: 'a22', name: '2022 annual.pdf', kind: 'pdf', year: '2022' },
      { id: 'a23', name: '2023 annual.pdf', kind: 'pdf', year: '2023' },
      { id: 'a24', name: '2024 annual.pdf', kind: 'pdf', year: '2024', live: true },
      { id: 'a25', name: '2025 annual.pdf', kind: 'pdf', year: '2025' },
      { id: 'fin', name: 'financials.xlsx', kind: 'xlsx' },
      { id: 'deck', name: 'Q2 2026 deck.pdf', kind: 'slide' },
    ],
    agents: ['Doc reader', 'Tabulator'],
    actions: ['Opened 4 reports', 'Built financials.xlsx'],
    docTitle: 'Tigbur — what we know',
  }),
  withCounts({
    id: 'ws-qualitau-q2',
    name: 'Qualitau — Q2 deep dive',
    updatedLabel: 'yesterday',
    initial: 'ק',
    company: 'Qualitau',
    sub: 'Semis · TASE',
    files: [
      { id: 'q24', name: '2024 annual.pdf', kind: 'pdf', year: '2024' },
      { id: 'q25', name: '2025 annual.pdf', kind: 'pdf', year: '2025' },
    ],
    agents: ['Doc reader'],
    actions: ['Opened 2 reports'],
    docTitle: 'Qualitau — what we know',
  }),
  withCounts({
    id: 'ws-shipping-scan',
    name: 'Shipping sector scan',
    updatedLabel: '4d ago',
    initial: '⚓',
    company: '3 companies',
    sub: 'Sector',
    files: [{ id: 's1', name: 'peer comparison.xlsx', kind: 'xlsx' }],
    agents: ['Tabulator'],
    actions: ['Built comparison.xlsx'],
    docTitle: 'Shipping sector — what we know',
  }),
]

export const WS_SORTS = {
  updated: 'Last updated',
  name: 'Name',
  files: 'File count',
} as const
export type WsSortKey = keyof typeof WS_SORTS

export const WS_THREADS: WsThread[] = [
  {
    id: 'c1',
    title: 'Compare FY24 vs FY25 revenue',
    snippet: 'Revenue rose every year — ₪1.21B → ₪1.56B, a +8.3% CAGR.',
    when: '2m ago',
    group: 'Today',
  },
  {
    id: 'c2',
    title: 'Who is actually bidding?',
    snippet: 'Three consortia filed; two carry sovereign-fund money.',
    when: '09:12',
    group: 'Today',
  },
  {
    id: 'c3',
    title: 'The 2023 restatement',
    snippet: 'Three line items were restated — freight, port fees, D&A.',
    when: '17:40',
    group: 'Yesterday',
  },
  {
    id: 'c4',
    title: 'Draft questions for the Q3 call',
    snippet: 'Six questions, ordered by what the CFO has dodged before.',
    when: '16:55',
    group: 'Yesterday',
  },
  {
    id: 'c5',
    title: 'Union agreement obligations',
    snippet: 'No-layoff undertaking runs to 2029 and survives a sale.',
    when: 'Jun 24',
    group: 'Earlier',
  },
]

export const WS_THREAD_GROUPS: readonly WsThreadGroup[] = ['Today', 'Yesterday', 'Earlier'] as const

export const WS_AGENT_PROFILES: Record<string, Omit<WsAgent, 'name'>> = {
  'Doc reader': {
    ini: 'DR',
    role: 'Reads & structures filings',
    read: '6 files · 412 pages',
    when: '2h ago',
    findings: ['Normalised 4 annual reports into one schema', 'Flagged 3 restated line items in FY2023'],
  },
  Tabulator: {
    ini: 'TB',
    role: 'Builds comparable tables',
    read: 'financials.xlsx · 4 years',
    when: '2h ago',
    findings: ['Revenue CAGR +8.3% (2022→2025)', 'Operating margin improved to 3.7%'],
  },
  'Legal analyst': {
    ini: 'LA',
    role: 'Regulatory & contract review',
    read: '6 files + 14 public filings',
    when: 'just now',
    findings: [
      'Two open proceedings before the Antitrust Authority',
      'Change-of-control clause in the Haifa port concession',
    ],
  },
}

export const SYSTEM_AGENTS = ['Doc reader', 'Tabulator', 'Risk scanner', 'Translator', 'Note-taker'] as const

export const WS_SESSIONS: WsSession[] = [
  {
    label: 'This session · today',
    items: [
      { text: 'Opened 2024 annual.pdf', when: '09:41', kind: 'open' },
      { text: 'Started the document “Tigbur — what we know”', when: '09:38', kind: 'doc' },
    ],
  },
  {
    label: 'Yesterday',
    items: [
      { text: 'Compared FY2024 and FY2025 side by side', when: '17:02', kind: 'open' },
      { text: 'Built financials.xlsx from 4 reports', when: '16:20', kind: 'build' },
      { text: 'Deployed the Tabulator agent', when: '16:14', kind: 'agent' },
    ],
  },
  {
    label: 'Jun 24',
    items: [
      { text: 'Opened דוח ועד העובדים.pdf', when: '11:47', kind: 'open' },
      { text: 'Cited the CEO guidance quote in the document', when: '11:30', kind: 'doc' },
      { text: 'Workspace created from the Q2 2026 call', when: '10:02', kind: 'build' },
    ],
  },
]

export const LEGAL_AREAS = ['Litigation', 'Regulatory', 'Contracts & liens', 'Ownership & control'] as const

export const LEGAL_STEPS = [
  'Reading 6 workspace files',
  'Pulling 14 public filings & court records',
  'Checking regulatory exposure',
  'Reviewing contracts, liens & concessions',
  'Drafting findings',
] as const

export const LEGAL_FINDINGS: LegalFinding[] = [
  {
    sev: 'Flag',
    k: 'flag',
    text: 'The Haifa port concession carries a change-of-control clause — the state may reopen terms on any transfer above 25%.',
    src: '2024 annual.pdf · note 14',
  },
  {
    sev: 'Flag',
    k: 'flag',
    text: 'Two open proceedings before the Israel Competition Authority relating to 2023 pricing on the Ashdod–Limassol lane.',
    src: 'Public register · filed 2025-11-03',
  },
  {
    sev: 'Medium',
    k: 'medium',
    text: 'Sovereign-fund holdings behind the leading bidder trigger a foreign-investment review under the 2022 advisory committee rules.',
    src: 'דוח ועד העובדים.pdf · p. 6',
  },
  {
    sev: 'Medium',
    k: 'medium',
    text: 'Fleet financing includes a maritime lien on four vessels; consent required before any share transfer.',
    src: 'financials.xlsx · Debt schedule',
  },
  {
    sev: 'Medium',
    k: 'medium',
    text: 'Collective agreement runs to 2029 with a no-layoff undertaking that survives a sale.',
    src: '2025 annual.pdf · note 9',
  },
  {
    sev: 'Clear',
    k: 'clear',
    text: 'No outstanding environmental enforcement actions; last inspection closed without findings.',
    src: 'Ministry register · 2026-02',
  },
]

/** Severity ink + wash, exactly as the design defines them (SEV, design line 3652). */
export const LEGAL_SEVERITY_STYLE: Record<LegalSeverity, { color: string; background: string }> = {
  flag: { color: '#B0533E', background: 'rgba(203,75,46,.10)' },
  medium: { color: '#8A6A2F', background: 'rgba(180,140,60,.13)' },
  clear: { color: '#4F7A52', background: 'rgba(79,122,82,.11)' },
}

/**
 * The action timeline the detail column shows. The workspace's OWN actions lead
 * the current session, then the shared history — this is what makes the design's
 * "Actions taken" count 10 for Tigbur rather than 8.
 */
export function workspaceSessions(w: Workspace): WsSession[] {
  const live: WsAction[] = [...w.actions].reverse().map((text, i) => ({
    text,
    when: i === 0 ? 'just now' : i === 1 ? '4m ago' : '12m ago',
    kind: /legal|agent|deploy/i.test(text) ? 'agent' : /built|index|fetch/i.test(text) ? 'build' : 'open',
  }))
  return [{ ...WS_SESSIONS[0], items: [...live, ...WS_SESSIONS[0].items] }, ...WS_SESSIONS.slice(1)]
}

export async function getWorkspaces(): Promise<Workspace[]> {
  return DEMO_WORKSPACES
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  return DEMO_WORKSPACES.find((w) => w.id === id) ?? null
}

/** A workspace the user just created: no files, so it lands in the intake flow. */
export function emptyWorkspace(id: string, name: string): Workspace {
  return {
    id,
    name,
    subtitle: 'Untitled · Draft',
    fileCount: 0,
    updatedLabel: 'just now',
    initial: '+',
    company: 'Untitled',
    sub: 'Draft',
    files: [],
    agents: [],
    actions: [],
    docTitle: 'Untitled document',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Row shapes, exactly as migration 016 defines them.
//
// These are FACTS. Everything the display shapes above add — updatedLabel,
// initial, subtitle, fileCount, company — is DERIVED at render by
// ./present.ts and is deliberately absent here. Storing "2h ago" freezes it
// forever, which is what the stub above did.
// ─────────────────────────────────────────────────────────────────────────────

/** The three real provenances an item can have. Not the legacy display kinds. */
export type WsItemKind = 'transcript' | 'document' | 'file'

export type WsBlockKind = 'heading' | 'text' | 'quote'

/**
 * Whether a citation is still telling the truth. `drifted` exists because a
 * re-processed transcript keeps its line ids while their sentences change, so a
 * citation can resolve to the WRONG words — which must never render as a
 * working link. See citationState() in ./present.
 */
export type CitationState = 'live' | 'drifted' | 'absent'

export type WorkspaceRow = {
  id: string
  user_id: string
  name: string
  doc_title: string
  created_at: string
  updated_at: string
}

export type WorkspaceItemRow = {
  id: string
  workspace_id: string
  user_id: string
  /** text, not uuid — transcripts.id is text */
  transcript_id: string | null
  document_id: string | null
  storage_path: string | null
  name: string
  kind: WsItemKind
  /** open in the side-by-side view; survives the browser closing */
  is_open: boolean
  /** orders ALL items, not only the open ones */
  position: number
  created_at: string
}

/**
 * A shared-corpus row a user may put on a shelf. Not a table — it is the union
 * of `transcripts` and `company_documents` as the source picker sees them.
 */
export type AttachableSource = {
  /** transcripts.id is TEXT; company_documents.id is a uuid. Both are strings here. */
  sourceId: string
  kind: 'transcript' | 'document'
  title: string
  /** null when the source has no company attached — never a fabricated one */
  company: string | null
  when: string | null
}

export type WorkspaceThreadRow = {
  id: string
  workspace_id: string
  user_id: string
  title: string
  messages: unknown[]
  created_at: string
  updated_at: string
}

export type WorkspaceBlockRow = {
  id: string
  workspace_id: string
  user_id: string
  kind: WsBlockKind
  body: string
  position: number
  /** null once the cited source left the shelf — the "visibly absent" state */
  source_item_id: string | null
  /** snapshot, so an absent source is informative rather than a dangling marker */
  source_label: string | null
  /** a document page */
  source_page: number | null
  /** a transcript line, e.g. 'L0001' */
  source_line_id: string | null
  /** snapshot of the quoted words — what makes drift detectable */
  source_quote: string | null
  created_at: string
  updated_at: string
}
