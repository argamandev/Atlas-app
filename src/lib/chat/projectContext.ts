// Direct injection of the user's OWN written context — NOT retrieval. Nothing
// here reads the shared corpus; cross-archive search is a separate chapter and
// this module must not grow into it.
//
// The founder brief says the user-written layer is small enough for direct
// injection, and it is: two text fields plus a handful of typed notes.

/**
 * The character ceiling actually injected into a chat inside a project.
 * It lives HERE, next to the code that enforces it, and the UI's capacity meter
 * imports it from here — a budget defined away from its enforcement is how the
 * meter and the truncation drifted apart in the first place.
 */
export const PROJECT_CONTEXT_BUDGET = 8_000

export type ProjectContextInput = {
  name: string
  instructions: string
  memory: string
  sources: { name: string; body: string }[]
}

export type ProjectContextResult = {
  text: string
  /**
   * True when the block was cut to fit. Exists so the caller can TELL THE USER.
   * A silently truncated context produces a confident answer built on half the
   * instructions — the silent-degradation class in .claude/rules/app.md.
   */
  truncated: boolean
  /**
   * Length BEFORE truncation. The capacity meter reads this, so what the user is
   * shown and what the server enforces cannot drift: they are one function.
   * They HAD drifted — the meter summed the raw fields and missed the framing
   * header, the per-section labels and every source NAME, so a project could
   * read 97% while the server was already cutting it.
   */
  fullLength: number
}

/**
 * The sources that actually reach the model. A note with no body contributes
 * nothing and must not be announced as a source — that would tell the model a
 * source exists where none does, and tell the USER their note is in context
 * when it is not. One rule, used by the injector and by the UI's count.
 */
export function injectedSources<T extends { body: string }>(sources: T[]): T[] {
  return sources.filter((s) => s.body.trim() !== '')
}

export function buildProjectContext(input: ProjectContextInput): ProjectContextResult {
  const parts: string[] = []

  if (input.instructions.trim()) {
    parts.push(`Standing instructions for this project:\n${input.instructions.trim()}`)
  }
  if (input.memory.trim()) {
    parts.push(`What this project already knows:\n${input.memory.trim()}`)
  }
  for (const s of injectedSources(input.sources)) {
    parts.push(`Source — ${s.name}:\n${s.body.trim()}`)
  }

  if (parts.length === 0) return { text: '', truncated: false, fullLength: 0 }

  const header = `The user is working inside the project "${input.name}".`
  const full = [header, ...parts].join('\n\n')

  if (full.length <= PROJECT_CONTEXT_BUDGET) {
    return { text: full, truncated: false, fullLength: full.length }
  }
  return { text: full.slice(0, PROJECT_CONTEXT_BUDGET), truncated: true, fullLength: full.length }
}
