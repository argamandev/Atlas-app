import type { Dictionary } from '@/lib/i18n/dictionaries/en'
import type { Project, ProjectRow, ProjectSourceRow, ProjectChat } from './data'
import {
  memoryLabel,
  lineMeta,
  contextChars,
  capacityPercent,
  isOverBudget,
  relativeLabel,
  type Locale,
} from './derive'

// Row -> display shape. Pure, so the label rules are unit-testable without a
// database. This is the seam where facts become labels; nothing upstream of it
// is allowed to store one.

export function presentProject(
  row: ProjectRow,
  sources: ProjectSourceRow[],
  chats: ProjectChat[],
  now: Date,
  locale: Locale,
  dict: Dictionary
): Project {
  const used = contextChars({
    instructions: row.instructions,
    memory: row.memory,
    bodies: sources.map((s) => s.body),
  })

  return {
    id: row.id,
    name: row.name,
    pinned: row.pinned,
    instructions: row.instructions,
    memory: row.memory,
    memWhen: memoryLabel(row.memory_updated_at, now, locale, dict),
    capacity: capacityPercent(used),
    overBudget: isOverBudget(used),
    context: sources.map((s) => ({
      id: s.id,
      name: s.name,
      body: s.body,
      meta: lineMeta(s.body, dict),
      kind: 'TEXT' as const,
    })),
    chats,
  }
}

/** Conversation rows -> the chat list, with `when` derived rather than stored. */
export function presentChats(
  rows: { id: string; title: string; updated_at: string }[],
  now: Date,
  locale: Locale
): ProjectChat[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    when: relativeLabel(r.updated_at, now, locale),
  }))
}
