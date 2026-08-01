import { PROJECT_CONTEXT_BUDGET } from '@/lib/projects/derive'

// Direct injection of the user's OWN written context — NOT retrieval. Nothing
// here reads the shared corpus; cross-archive search is a separate chapter and
// this module must not grow into it.
//
// The founder brief says the user-written layer is small enough for direct
// injection, and it is: two text fields plus a handful of typed notes.

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
}

export function buildProjectContext(input: ProjectContextInput): ProjectContextResult {
  const parts: string[] = []

  if (input.instructions.trim()) {
    parts.push(`Standing instructions for this project:\n${input.instructions.trim()}`)
  }
  if (input.memory.trim()) {
    parts.push(`What this project already knows:\n${input.memory.trim()}`)
  }
  for (const s of input.sources) {
    // A note with no body contributes nothing and must not be announced as a
    // source — that would tell the model a source exists where none does.
    if (s.body.trim()) parts.push(`Source — ${s.name}:\n${s.body.trim()}`)
  }

  if (parts.length === 0) return { text: '', truncated: false }

  const header = `The user is working inside the project "${input.name}".`
  const full = [header, ...parts].join('\n\n')

  if (full.length <= PROJECT_CONTEXT_BUDGET) return { text: full, truncated: false }
  return { text: full.slice(0, PROJECT_CONTEXT_BUDGET), truncated: true }
}
