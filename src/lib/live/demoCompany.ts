/**
 * The issuer the LOCAL live engine broadcasts as.
 *
 * WHY THIS CONSTANT EXISTS RATHER THAN THREE STRING LITERALS. `'1097229'` (תמיס)
 * was hardcoded in three files — the company page, Home's live panel and the
 * `/app/live/live` route — each with its own comment. One of them was rewritten
 * on 2026-08-09 to "follow a real live row" instead, which silently disabled the
 * live banner because nothing in the repo writes `scheduled_calls.status='live'`.
 * A value that means "the engine's subject" should be named once and findable.
 *
 * WHAT IT IS AND IS NOT. It is a ROUTING decision — which page polls
 * `/api/live/state`. It is not displayed, and the banner's content comes from
 * the engine's own answer, so no claim is made to the user on the strength of it.
 *
 * ⚠ IT SHOULD STOP EXISTING. The honest design is for `/api/live/state` to report
 * which company it is broadcasting, so any issuer's page can light up when a real
 * call is running. That is live-engine work and belongs to the live chapter
 * (founder decision 2026-08-09: showing calls and hosting them are different
 * chapters). Until then, one named constant beats three literals.
 */
export const LIVE_DEMO_TICKER = '1097229'

/** Fallback display name for the demo issuer when the row cannot be loaded. */
export const LIVE_DEMO_FALLBACK_NAME = 'תמיס'
