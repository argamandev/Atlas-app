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
      <>
        {template} — <bdi>{error}</bdi>
      </>
    )
  }
  return (
    <>
      {parts.map((part, i) => (
        // Fragment, not a wrapper element: an extra inline box here would be a
        // new bidi container, which is the exact thing <bdi> is placed to control.
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && <bdi>{error}</bdi>}
        </Fragment>
      ))}
    </>
  )
}
