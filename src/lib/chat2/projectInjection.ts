// ─────────────────────────────────────────────────────────────────────────────
// PROJECT-CONTEXT INJECTION on `/api/chat/v2` (ticket 08c).
//
// A chat inside a project inherits that project's own written layer — standing
// instructions, accumulated memory, and the user's typed notes. DIRECT
// INJECTION, never retrieval: nothing here reads the shared corpus, and this
// module must not grow into something that does. The founder brief's reasoning
// still holds — the user-written layer is two text fields plus a handful of
// notes, which is small enough to stuff.
//
// WHAT IS AND IS NOT NEW HERE. The BUILDER is not new: `lib/chat/projectContext.ts`
// already assembles the block, already owns the 8,000-char budget, already reports
// truncation, and is already what the UI's capacity meter measures itself against.
// It stays the one function, shared with the old route, precisely so the meter and
// the server cannot drift — that file's own law. What this module adds is the two
// things v2 needs and the old route expressed as an HTTP header:
//
//   * WHERE the block goes — the VOLATILE tail of the system prompt, never the
//     static prefix. Standing instructions belong at system level (that is where
//     the old route put them, and a directive demoted into a user turn is obeyed
//     less), but the prefix is the cache-stable one (`systemPrompt.ts`), so a
//     per-project string in front of it would destroy the only property that
//     ordering exists to preserve.
//   * WHICH of three states this turn is in, as a value the loop can emit and the
//     surface can persist. `ok` is claimed ONLY when the block was built whole.
//
// THREE STATES, NOT TWO, AND `failed` DOES NOT END THE TURN — which is the one
// place this deliberately differs from `callInjection.ts`, so the difference is
// stated rather than left to look like an oversight. A call that will not load
// ends the turn in `error`, because the call IS the answer's source and the chip
// on screen names it. A project's context is a MODIFIER: the corpus, the tools and
// any company scope are all still there, so an answer is still worth having — it
// is just written without the user's standing instructions. Refusing to answer at
// all would be a worse trade than the old route's, which answers and says so. The
// law is that the degradation is VISIBLE, not that every degradation is fatal.
//
// FENCING, and the honest limit on it. The block is NOT fenced, matching the old
// route: fencing marks content as "quoted material, never an instruction", which
// is exactly wrong for standing instructions the user wrote to be obeyed. The
// unstated cost is that a project SOURCE body — which a user may have pasted out
// of a document — rides in at system level unfenced. That is the shipped
// behaviour, not a regression introduced here, and splitting the block so notes
// fence and instructions do not would change `buildProjectContext`, the old route
// and the capacity meter together. Filed in `docs/open-findings.md` instead of
// silently widened into this ticket.
// ─────────────────────────────────────────────────────────────────────────────

import { buildProjectContext, type ProjectContextInput } from '@/lib/chat/projectContext'
// The state triple is WIRE vocabulary and is declared once in `protocol.ts`,
// which both this module and every surface already import. Re-exported because
// a caller of this builder reasons in terms of it.
import type { ProjectContextState } from './protocol'
export type { ProjectContextState } from './protocol'

/**
 * The parts of a project this needs.
 *
 * An ALIAS, not a second declaration: it is `ProjectContextInput` under the name
 * this module's callers think in. Copying its four fields into a parallel
 * interface bought a second place to edit when a field is added — Shotgun
 * Surgery on a type whose whole job is to stay in step with the one budgeted
 * builder (`lib/chat/projectContext.ts`).
 */
export type ProjectForInjection = ProjectContextInput

export interface ProjectBlock {
  /**
   * What is appended to the system prompt's volatile tail. EMPTY is a real and
   * ordinary answer — a project with no instructions, no memory and no non-empty
   * notes has nothing to inject, and that is not a degradation.
   */
  text: string
  /** `ok` only when the block was built WHOLE. Never inferred from `text.length`. */
  state: ProjectContextState
}

/**
 * Build the injectable block for one project.
 *
 * PURE. The load — which is where the two failure modes live (the project is
 * gone; RLS says it is not the caller's) — happens in `projectSource.ts` and is
 * injectable into the loop, for the same reason `loadCall` is.
 */
export function buildProjectBlock(project: ProjectForInjection): ProjectBlock {
  const built = buildProjectContext(project)
  return { text: built.text, state: built.truncated ? 'truncated' : 'ok' }
}

/**
 * What the SYSTEM PROMPT is told when the project could not be loaded at all.
 *
 * The model is told, not just the user. Without this the model answers a
 * question asked inside a project as though no project existed — confidently,
 * and with no idea it is missing the instructions it was supposed to follow. The
 * user gets the `failed` notice on screen either way; this is what stops the
 * ANSWER from contradicting that notice by sounding fully informed.
 */
export const PROJECT_UNAVAILABLE_SUMMARY =
  'The user is working inside a project, but its saved instructions and notes could not be loaded ' +
  'for this turn. Answer the question on its own terms and say plainly that you are answering ' +
  'without the project context.'
