// ─────────────────────────────────────────────────────────────────────────────
// Projects — the shapes the UI renders and the rows the database stores.
//
// Backed by real tables since 2026-08-02 (migration 015). The demo seed that
// used to live here is gone: a project now persists, belongs to exactly one
// account, and is invisible to every other one.
//
// The display shape carries DERIVED fields — `meta`, `memWhen`, `capacity`,
// `overBudget` — computed by src/lib/projects/present.ts at render time. They
// are deliberately NOT columns: storing "2h ago" freezes it forever.
// ─────────────────────────────────────────────────────────────────────────────

export type ContextItem = {
  id: string
  name: string
  /** what the user actually typed — the thing that reaches the model */
  body: string
  /** derived from `body`, e.g. "6 lines" or the empty-source label */
  meta: string
  /**
   * Everything is a typed note this chapter (founder decision 2026-08-02).
   * Pinned corpus documents will get their own table referencing
   * company_documents — a real relationship, not a discriminator string that
   * would let a row claim to be a PDF while holding nothing.
   */
  kind: 'TEXT'
}

export type ProjectChat = {
  id: string
  title: string
  /** derived from the conversation's updated_at */
  when: string
}

export type Project = {
  id: string
  name: string
  pinned: boolean
  instructions: string
  memory: string
  /** derived from memory_updated_at — "Never updated" when it is null */
  memWhen: string
  /** derived: characters used vs PROJECT_CONTEXT_BUDGET, clamped to 0-100 */
  capacity: number
  /** true when the project exceeds the budget — the UI must SAY so, not just fill the bar */
  overBudget: boolean
  context: ContextItem[]
  chats: ProjectChat[]
}

// ── Row shapes, exactly as migration 015 defines them ────────────────────────

export type ProjectRow = {
  id: string
  user_id: string
  name: string
  pinned: boolean
  instructions: string
  memory: string
  memory_updated_at: string | null
  created_at: string
  updated_at: string
}

export type ProjectSourceRow = {
  id: string
  project_id: string
  user_id: string
  name: string
  body: string
  position: number
  created_at: string
  updated_at: string
}
