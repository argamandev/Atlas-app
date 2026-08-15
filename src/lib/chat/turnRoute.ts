// ─────────────────────────────────────────────────────────────────────────────
// WHICH BACKEND THIS TURN GOES TO — decided per TURN, not per surface (08c-2).
//
// The rule has not changed and is the one `useV2` was built around: *a surface
// goes to v2 only when v2 can honour every grounding that surface displays.*
// What changed is that on the live surface the answer is no longer the same for
// every turn, so a per-MOUNT boolean can no longer express it.
//
// The live panel is grounded in the on-screen captions, which v2 now honours
// (`liveInjection.ts`). But the very same panel, in multiview, also has a report
// pane and a pair of scissors: a user can attach a marked passage or a snipped
// image to one turn and nothing at all to the next. v2 has no image content
// blocks yet — that is 08c-3, and it is the ticket that finally kills
// `/api/chat`.
//
// So the choice is a function of THIS TURN'S ATTACHMENTS. The alternative was to
// keep the panel wholesale on the old route until 08c-3, which would leave the
// live surface's ordinary case — a typed question about what was just said —
// unmigrated for another mission for the sake of a case it usually does not have.
//
// WHY A FALLBACK IS HONEST HERE AND A DOWNGRADE NEVER IS. The old route honours
// every one of these groundings in full: captions, marked pages, snips, the
// company, the transcript. The user gets the whole grounding the screen is
// promising, from the route that can carry it. That is the exact opposite of the
// ticket-07 defect, which was answering WITHOUT a grounding the screen claimed.
// The difference is not "which route" — it is whether anything on screen is left
// unfulfilled, and here nothing is.
//
// A CHANGE THIS REPLACES: the panel used to THROW `groundingUnsupported` for
// this combination. That was correct while no v2-grounded host could produce an
// attachment (the company page has no document pane) and it becomes wrong the
// moment the live host — which has both — sends a grounding: it would refuse a
// turn the product has always been able to answer.
// ─────────────────────────────────────────────────────────────────────────────

import type { Grounding } from '@/lib/chat2/requestScope'

export type ChatRoute = 'v2' | 'legacy'

export interface TurnAttachments {
  /** The grounding this surface declares, if it is on the new backend at all. */
  grounding?: Grounding
  /** A marked passage from a report PDF rides this turn. */
  hasDocRef: boolean
  /** One or more snipped page images ride this turn. */
  hasSnips: boolean
}

/**
 * `v2` only when v2 can carry everything this turn is asking it to carry.
 *
 * Note which way the default falls: NO grounding means `legacy`. A surface that
 * has not said what it is grounded in has not earned the new backend, and
 * silently sending it to v2 as a blank market-wide chat is precisely the
 * downgrade the union exists to make impossible.
 */
export function chooseChatRoute(turn: TurnAttachments): ChatRoute {
  if (!turn.grounding) return 'legacy'
  // IMAGES AND DOCUMENT PAGES ARE 08c-3's WORK. Until the loop carries image
  // content blocks, a turn holding one is answered by the route that can read it.
  if (turn.hasDocRef || turn.hasSnips) return 'legacy'
  return 'v2'
}

/**
 * The caption text for a legacy fallback, taken from the GROUNDING rather than
 * from a second prop beside it.
 *
 * One fact, one place. When the panel carried both `grounding` and a separate
 * `liveContext` prop, "which backend can honour the live captions" was answered
 * by one field and "what the captions are" by another, and the two could
 * disagree — the first version of the panel's guard checked the grounding and
 * missed `liveContext`, which was itself a review finding.
 */
export function legacyLiveContext(grounding?: Grounding): string | undefined {
  return grounding?.kind === 'live' ? grounding.captions : undefined
}
