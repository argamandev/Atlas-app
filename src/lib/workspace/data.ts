// ─────────────────────────────────────────────────────────────────────────────
// Workspace data interface — FRONTEND-ONLY STUB (Milestone 1).
// The Workspace page renders exclusively through this module, so wiring the real
// backend later is a swap here, not a page rebuild. Stub content mirrors the
// design's demo workspaces (design-import/Atlas MVP.dc.html, workspace picker).
// ─────────────────────────────────────────────────────────────────────────────

export type Workspace = {
  id: string
  name: string
  /** e.g. "Tigbur Group · Shipping · TASE" */
  subtitle: string
  fileCount: number
  /** relative time label, e.g. "2h ago" */
  updatedLabel: string
  /** avatar tile glyph (Hebrew initial or emoji) */
  initial: string
}

const DEMO_WORKSPACES: Workspace[] = [
  {
    id: 'ws-tigbur-privatization',
    name: 'Tigbur — privatization review',
    subtitle: 'Tigbur Group · Shipping · TASE',
    fileCount: 6,
    updatedLabel: '2h ago',
    initial: 'ת',
  },
  {
    id: 'ws-qualitau-q2',
    name: 'Qualitau — Q2 deep dive',
    subtitle: 'Qualitau · Semis · TASE',
    fileCount: 2,
    updatedLabel: 'yesterday',
    initial: 'ק',
  },
  {
    id: 'ws-shipping-scan',
    name: 'Shipping sector scan',
    subtitle: '3 companies · Sector',
    fileCount: 1,
    updatedLabel: '4d ago',
    initial: '⚓',
  },
]

export async function getWorkspaces(): Promise<Workspace[]> {
  return DEMO_WORKSPACES
}
