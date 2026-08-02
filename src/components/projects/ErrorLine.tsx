import { Fragment } from 'react'

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
export function ErrorLine({ template, error }: { template: string; error: string }) {
  // Interleave every segment rather than taking the first two: a template with
  // two placeholders used to lose its tail, and one with NONE used to have the
  // raw error jammed onto the end with no separator. Neither shape exists in the
  // dictionaries today, and this component's whole job is what is rendered when
  // something has already gone wrong — so it must not be the second failure.
  const parts = template.split('{error}')
  if (parts.length === 1) {
    return (
      <span className="block">
        {template} — <bdi>{error}</bdi>
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
          {i < parts.length - 1 && <bdi>{error}</bdi>}
        </Fragment>
      ))}
    </span>
  )
}
