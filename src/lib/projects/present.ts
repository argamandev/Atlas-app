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
  // Measured through the injector itself, so `capacity` is the real ratio of
  // what gets sent — name, framing header, section labels and source names all
  // included, exactly as the server counts them.
  const used = contextChars({
    name: row.name,
    instructions: row.instructions,
    memory: row.memory,
    sources: sources.map((s) => ({ name: s.name, body: s.body })),
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
