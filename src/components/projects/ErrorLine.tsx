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
  const [before, after = ''] = template.split('{error}')
  return (
    <>
      {before}
      <bdi>{error}</bdi>
      {after}
    </>
  )
}
