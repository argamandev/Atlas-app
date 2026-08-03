'use client'

import { Fragment } from 'react'
import { isUnauthorized } from '@/lib/api/client'
import { loginRedirectTarget } from '@/lib/auth/gate'

/**
 * Renders "…{error}" copy with the raw error isolated in its own <bdi>.
 *
 * A Postgres message is a Latin run landing inside a Hebrew sentence — exactly
 * the mixed line rules/app.md forbids giving a single direction, because
 * `dir="auto"` resolves from the FIRST strong character (Hebrew) and throws the
 * English run's punctuation to the far side. <bdi> defaults to dir="auto", so
 * each run resolves independently and the container keeps the line's direction.
 *
 * Shared rather than local because the rule was applied to expected content and
 * missed on ERROR text three screens running — which is precisely where
 * foreign-language strings come from, and the surface nobody looks at until
 * something has already gone wrong.
 *
 * THE WRAPPER IS PART OF THE CONTRACT, not styling. This used to return a bare
 * fragment, so its <bdi> was whatever kind of box the CALLER's layout made it.
 * Dropped into a `flex flex-col` banner the <bdi> became a flex ITEM, and flex
 * items are blockified — measured on the live page: computed `display: block`,
 * template text at top 10 and the error at top 32, one message split across two
 * rows in a 60px box, where the non-flex sibling with identical children gave
 * `inline` with both runs at 86 in 37px. A block <span> here takes that hit
 * instead: it is the flex item, the <bdi> stays inline inside it, and the next
 * caller cannot reopen the bidi rule at occurrence six by choosing a layout.
 * <span>, not <div>, because one caller renders this inside a <p> and a <div>
 * there is invalid HTML that the parser would close the paragraph around.
 */
export function ErrorLine({
  template,
  error,
  auth,
}: {
  template: string
  /**
   * The thrown value, NOT its message — the status has to survive this far. Kept
   * as `unknown` so a caller cannot quietly narrow it back to a string and lose
   * the one thing that distinguishes an expired session from a broken query.
   */
  error: unknown
  /**
   * Copy for the expired-session case. Pass it wherever the failure can be a
   * 401; omit it only where it genuinely cannot.
   */
  auth?: { expired: string; signIn: string }
}) {
  const message = error instanceof Error ? error.message : String(error)

  // An expired session is not an error message, it is an ACTION. The server says
  // "unauthorized"; rendering that word told the user nothing and offered no way
  // out, while the template around it ("Could not load your chats — unauthorized")
  // actively implied the chats were the problem. rules/app.md: never invent a
  // cause, and send the user to sign in. Assignment rather than a <a href> so
  // nothing is computed from `window` during render.
  if (auth && isUnauthorized(error)) {
    return (
      <span className="block">
        {auth.expired}{' '}
        <button
          type="button"
          onClick={() => {
            window.location.href = loginRedirectTarget(window.location.pathname, window.location.search)
          }}
          className="underline underline-offset-2 hover:no-underline"
        >
          {auth.signIn}
        </button>
      </span>
    )
  }

  // Interleave every segment rather than taking the first two: a template with
  // two placeholders used to lose its tail, and one with NONE used to have the
  // raw error jammed onto the end with no separator. Neither shape exists in the
  // dictionaries today, and this component's whole job is what is rendered when
  // something has already gone wrong — so it must not be the second failure.
  const parts = template.split('{error}')
  if (parts.length === 1) {
    return (
      <span className="block">
        {template} — <bdi>{message}</bdi>
      </span>
    )
  }
  return (
    <span className="block">
      {parts.map((part, i) => (
        // Fragment INSIDE the wrapper, not another element: the segments of one
        // sentence must stay in a single bidi paragraph, so only the outer box
        // is real and every <bdi> isolates within it.
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && <bdi>{message}</bdi>}
        </Fragment>
      ))}
    </span>
  )
}
