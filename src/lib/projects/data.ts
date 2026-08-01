// ─────────────────────────────────────────────────────────────────────────────
// Projects data interface — FRONTEND-ONLY STUB (three-surfaces import, 2026-08-01).
// Projects is the chat sub-panel feature: a container for chats plus a context
// layer the user writes. The Projects UI renders exclusively through this module,
// so wiring the real backend later is a swap here, not a page rebuild.
//
// Content is ported verbatim from the design source
// (design-import/Atlas MVP.dc.html, projectList seed at lines 2465-2489).
// It is FABRICATED demo content about real TASE issuers and every surface that
// renders it carries a visible demo marker in both locales — see
// components/ds/DemoBanner.tsx and .claude/rules/app.md (degradation must be VISIBLE).
// ─────────────────────────────────────────────────────────────────────────────

export type ContextItem = {
  name: string
  /** small mono line under the name, e.g. "4 sheets" / "11 pages" */
  meta: string
  kind: 'XLSX' | 'PDF' | 'TEXT'
}

export type ProjectChat = {
  title: string
  /** relative time label, e.g. "2h ago" */
  when: string
}

export type Project = {
  id: string
  name: string
  pinned: boolean
  /** free-form standing instructions the user writes */
  instructions: string
  /** accumulated background the project remembers */
  memory: string
  /** e.g. "Last updated 2 days ago" / "Never updated" */
  memWhen: string
  /** 0-100, rendered as "N% of project capacity used" */
  capacity: number
  context: ContextItem[]
  chats: ProjectChat[]
}

const DEMO_PROJECTS: Project[] = [
  {
    id: 'p1',
    name: 'Shipping sector',
    pinned: true,
    instructions:
      'Answer in English, but quote Hebrew source lines verbatim with a translation underneath. Always name the filing and page.',
    memory:
      'Tracking the Tigbur privatization through the September tender. Three bidders; the German consortium carries 25% Gulf sovereign-fund money, which is the political fault line. The user cares about margin quality, not headline revenue.',
    memWhen: 'Last updated 2 days ago',
    capacity: 14,
    context: [
      { name: 'Tigbur — 4-year financials', meta: '4 sheets', kind: 'XLSX' },
      { name: 'דוח ועד העובדים', meta: '11 pages', kind: 'PDF' },
      { name: 'Bidder brief', meta: '6 lines', kind: 'TEXT' },
    ],
    chats: [
      { title: 'Who is actually behind the German bid?', when: '2h ago' },
      { title: 'השוואת שולי רווח מול צים ואוברסיז', when: 'yesterday' },
      { title: 'What breaks if the concession reopens?', when: '2 days ago' },
      { title: 'Draft the one-pager for the IC', when: '4 days ago' },
    ],
  },
  {
    id: 'p2',
    name: 'Q2 2026 earnings',
    pinned: false,
    instructions: '',
    memory:
      'Twelve TASE companies reporting between Jun 29 and Jul 10. Flag any guidance change of more than 5%.',
    memWhen: 'Last updated 5 days ago',
    capacity: 31,
    context: [
      { name: 'Reporting calendar', meta: '12 rows', kind: 'XLSX' },
      { name: 'Q1 guidance baseline', meta: '9 lines', kind: 'TEXT' },
    ],
    chats: [
      { title: 'Who reports before the holiday?', when: '3 days ago' },
      { title: 'Guidance deltas vs Q1', when: '5 days ago' },
    ],
  },
  {
    id: 'p3',
    name: 'Defense watch',
    pinned: false,
    instructions: 'Keep it short. Bullet points, no preamble.',
    memory: '',
    memWhen: 'Never updated',
    capacity: 4,
    context: [{ name: 'Elbit — 2025 annual', meta: '82 pages', kind: 'PDF' }],
    chats: [{ title: 'Export-licence exposure by country', when: '6 days ago' }],
  },
]

export async function getProjects(): Promise<Project[]> {
  return DEMO_PROJECTS
}

/** A project the user just created: visibly empty, so nothing looks pre-populated. */
export function emptyProject(id: string, name: string): Project {
  return {
    id,
    name,
    pinned: false,
    instructions: '',
    memory: '',
    memWhen: 'Never updated',
    capacity: 0,
    context: [],
    chats: [],
  }
}
