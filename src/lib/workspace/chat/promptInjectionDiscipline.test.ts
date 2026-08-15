import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// EVERY UNTRUSTED STRING THAT REACHES A PROMPT GOES THROUGH A SANITISER — and
// this scan is what makes that true of the NEXT field somebody adds.
//
// The defect this exists for happened THREE TIMES on one branch, each fix
// landing in the branch where the bug was noticed rather than at the boundary
// (M3.1):
//
//   1. the source BODY was defanged — and the fence LINE, which interpolates a
//      title, a kind and an id, was not;
//   2. the fence line was fixed — and the shelf listing, the partial list and
//      compose's whole instruction region, which sit OUTSIDE any fence, were not;
//   3. the fence marker was closed — and `"""`, the OTHER delimiter in the same
//      prompts, was not.
//
// Each fix was correct and none of them generalised, because a per-call-site fix
// cannot. The three per-site tests beside this one prove the sites that exist
// are covered; only a scan can fail for a site that does not exist yet, which is
// the whole difference between a fix and a mechanism (ADR-0002).
//
// ⚠ WHAT THIS CANNOT SEE, stated so nobody reads it as more than it is (M1): it
// is a TEXT scan over two named files. A prompt built by string concatenation
// instead of a template literal, a helper in a third file, or a value laundered
// through a local variable before interpolation all pass it. It closes the shape
// this repo actually writes, not the space of all shapes.
// ─────────────────────────────────────────────────────────────────────────────

/** The prompt builders. A new one belongs in this list on the day it is written. */
const BUILDERS = ['prompt.ts', 'compose.ts']

/** The sanitisers. `context.ts` is the one door all three live behind. */
const SANITISERS = ['fencePart', 'quoted', 'defang']

/**
 * Interpolations that carry no untrusted text, each with the reason it is safe.
 *
 * An entry here is a CLAIM that has to stay true, not a way to quiet the test:
 * `context` is the block `planContext` already fenced and defanged internally —
 * sanitising it twice would mangle the markers the prompt tells the model to
 * trust — and `snipCount` is a number this server counted itself.
 */
const ALLOWED = [
  {
    match: 'input.context',
    why: 'already fenced + defanged by planContext; re-sanitising would mangle its markers',
  },
  { match: 'input.snipCount', why: 'a number the server counted itself, never text from a request' },
  { match: "t.role === 'user'", why: 'picks between two literals; the role is narrowed to a union at parse' },
  { match: 'ALLOWED.join', why: "compose's own list of permitted HTML tag names, a module constant" },
]

/**
 * A BARE `${name}` is a composite this same file built a few lines up — `talk`,
 * `shelf`, `partial`, `marked`. Allowing it is not a hole, because the scan
 * reads the WHOLE file: whatever those composites interpolate is checked on its
 * own line. What it does mean is that a composite assembled in ANOTHER file and
 * imported would pass unseen, which is the limit stated in the header.
 */
const BARE_IDENTIFIER = /^\$\{[A-Za-z_$][\w$]*\}$/

for (const file of BUILDERS) {
  test(`every untrusted interpolation in ${file} goes through a sanitiser`, () => {
    const src = readFileSync(join(__dirname, file), 'utf8')
    // EVERY interpolation, not only the ones naming `input`. Scoping this to
    // `input.` is what let the conversation region ship unguarded: turns reach
    // the template as `${defang(t.content)}` through a `.map`, and `t` is not
    // `input` by the time it is interpolated. Nested braces are not chased — the
    // capture stops at the first `}`, which is enough to see what is wrapped.
    const interpolations = src.match(/\$\{[^}]*\}?/g) ?? []
    assert.ok(interpolations.length > 0, `no interpolations found in ${file} — did the scan break?`)

    const unguarded = interpolations.filter(
      (expr) =>
        // The NAME, not `name(` — a sanitiser is as often passed by reference
        // (`.map(fencePart)`) as called, and requiring the paren failed a line
        // that was already correct.
        !SANITISERS.some((s) => new RegExp(`\\b${s}\\b`).test(expr)) &&
        !ALLOWED.some((a) => expr.includes(a.match)) &&
        !BARE_IDENTIFIER.test(expr)
    )
    assert.deepEqual(
      unguarded,
      [],
      `these reach the model unsanitised — wrap them in fencePart (a one-line name), ` +
        `quoted (a """ block) or defang (fenced body text), or add an ALLOWED entry ` +
        `stating why the value cannot carry untrusted text:\n${unguarded.join('\n')}`
    )
  })
}

// The scan above is only worth anything if it can go red. This is the mutation:
// an interpolation of an input field with no sanitiser around it must be caught.
test('the scan fails for an unsanitised interpolation', () => {
  // Both shapes the real defect took: a plain `input.` field, and a loop variable
  // inside a `.map` — the one that scoping the scan to `input.` could not see.
  const fake =
    'const s = `hi ${input.workspaceName} ${fencePart(input.title)} ${turns.map((t) => `${t.content}`)} ${talk}`'
  const found = (fake.match(/\$\{[^}]*\}?/g) ?? []).filter(
    (expr) =>
      !SANITISERS.some((s) => new RegExp(`\\b${s}\\b`).test(expr)) &&
      !ALLOWED.some((a) => expr.includes(a.match)) &&
      !BARE_IDENTIFIER.test(expr)
  )
  // The nested case is reported as the OUTER expression, because the capture
  // stops at the first `}`. That is the honest shape of a text scan and it is
  // still red, which is the property that matters — the message points a reader
  // at the right line either way.
  assert.deepEqual(found, ['${input.workspaceName}', '${turns.map((t) => `${t.content}'])
})
