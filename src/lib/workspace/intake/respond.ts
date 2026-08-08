import type { IntakeResponse } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// `status: 'ready'` WITH AN EMPTY SELECTION IS A LIE, AND IT MUST BE
// UNREPRESENTABLE — not merely absent.
//
// The intake route emitted one for a day (cold review, 2026-08-08). It reached
// the analyst through three layers that were each individually reasonable:
//
//   1. `resolveSelection` emptied the set on a contradiction it had detected —
//      correct, and the fix the previous round was asked for.
//   2. The route left the status at `ready`, because the model had said `ready`.
//   3. `selectSources.ts` REQUIRES a `ready` reply to announce that the files
//      are being pulled in.
//
// So Atlas printed *"great, I'm pulling them in now"* over no file, no spinner
// (the panel needs a non-empty selection to render one) and no notice. And
// because an empty selection carries no `proposed`, the standing set was cleared
// too, so the analyst's next "כן" also did nothing.
//
// WHY THIS IS ITS OWN MODULE rather than a check beside the code that had the
// bug. The failing path was not the one anyone was thinking about: it fired on
// the intended narrowing AND on ordinary agreements like *"לא, את כולם"* ("no —
// ALL of them"), because `narrowsSelection` sees the `לא` that opens a WIDENING
// as often as a cut. A classifier over an open vocabulary will keep being wrong
// here, and no word list closes it — Hebrew and English both have unbounded ways
// to say "only those two". What this buys instead is that being wrong ASKS A
// QUESTION rather than announcing a pull, for every present and future gap in
// that vocabulary. `rules/app.md` carries it as standing law: degradation must be
// VISIBLE, never success UI for content the server dropped. This branch is its
// fourth occurrence.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The intake's one exit, and the only place its result envelope is built.
 *
 * Downgrades an empty `ready` to an honest question and says WHICH of the two
 * ways resolution failed. The model's sentence is dropped rather than shown,
 * because at `ready` the prompt has already made it a claim that files are on
 * their way; the panel writes the honest line itself, in the analyst's language,
 * keyed on `unresolved`.
 */
export function intakeResult(result: IntakeResponse): IntakeResponse {
  if (result.status === 'ready' && result.selected.length === 0) {
    return {
      ...result,
      status: 'clarifying',
      reply: null,
      // A conflict already carries the more specific cause; only fall back to
      // the generic one when nothing more precise was detected.
      unresolved: result.unresolved ?? 'nothing_selected',
    }
  }
  return result
}
