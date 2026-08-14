// ─────────────────────────────────────────────────────────────────────────────
// WHICH SENTENCE A DEGRADED ANSWER SHOWS — one exhaustive map, in one file.
//
// The backend went to real trouble to send a machine-readable `code` instead of
// English prose (`chat2/terminal.ts`), for one reason: this surface is
// Hebrew-first, and a Hebrew screen that decides what to say by string-matching
// English `reason` text is a classifier over prose — precisely what `app.md`
// says to buy visible failure instead of. That effort is only banked if the code
// reaches a sentence WITHOUT a lookup that can silently miss.
//
// So the map is typed `Record<ClientIncompleteCode, …>`. Adding a code to the
// union and shipping without copy for it is a TYPE ERROR, in both locales, at
// build time — the mechanism tier `CONTEXT.md` calls "impossible" rather than
// the prose one. That matters here because the four non-clean stop reasons were
// deliberately kept as SEPARATE codes (terminal.ts, round 4) exactly so this
// surface could say four different true things; a lookup that fell back to a
// generic string on a miss would have quietly undone that decision.
// ─────────────────────────────────────────────────────────────────────────────

import type { ClientIncompleteCode } from '@/lib/api/chat2'

/** The `dict.chat.incomplete` block, structurally — both locales satisfy this. */
export interface IncompleteCopy {
  roundTripCap: string
  allSourcesFailed: string
  unverifiedQuote: string
  lengthLimit: string
  modelRefused: string
  modelPaused: string
  stoppedUnknown: string
  noAnswerText: string
  streamEnded: string
}

/**
 * Wire code → copy key. Exhaustive by type: a new `ClientIncompleteCode` cannot
 * be added without a key here, and the key must exist in `IncompleteCopy`, which
 * both dictionaries must satisfy.
 */
export const INCOMPLETE_COPY_KEY: Record<ClientIncompleteCode, keyof IncompleteCopy> = {
  round_trip_cap: 'roundTripCap',
  all_sources_failed: 'allSourcesFailed',
  unverified_quote: 'unverifiedQuote',
  length_limit: 'lengthLimit',
  model_refused: 'modelRefused',
  model_paused: 'modelPaused',
  stopped_unknown: 'stoppedUnknown',
  no_answer_text: 'noAnswerText',
  stream_ended: 'streamEnded',
}

/**
 * The sentence to show beside an answer that is not whole.
 *
 * Never returns empty: an `incomplete` answer that renders NO notice is
 * indistinguishable on screen from a complete one, which is the exact lie the
 * whole terminal-event design exists to prevent. The parser upstream already
 * normalises an unrecognised wire code to `stopped_unknown`, so the fallback
 * here is for a corrupted dictionary, not for an unknown code.
 */
export function incompleteMessage(copy: IncompleteCopy, code: ClientIncompleteCode): string {
  return copy[INCOMPLETE_COPY_KEY[code]] || copy.stoppedUnknown
}
