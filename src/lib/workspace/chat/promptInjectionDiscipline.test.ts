import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// EVERY UNTRUSTED STRING THAT REACHES A PROMPT GOES THROUGH A SANITISER — and
// this scan is what makes that true of the NEXT field somebody adds.
//
// The defect this exists for happened SIX TIMES on one branch, each fix landing
// in the branch where the bug was noticed rather than at the boundary (M3.1):
//
//   1. the source BODY was defanged — and the fence LINE, which interpolates a
//      title, a kind and an id, was not;
//   2. the fence line was fixed — and the shelf listing, the partial list and
//      compose's whole instruction region, which sit OUTSIDE any fence, were not;
//   3. the fence marker was closed — and `"""`, the OTHER delimiter in the same
//      prompts, was not;
//   4. the delimiters were closed — and the CONVERSATION turns, which arrive in
//      the request body, were not;
//   5. the builders were closed — and the clip CAPTION, a second channel into the
//      same prompt, was not;
//   6. and THIS SCAN, written to end the sequence, named two builders while a
//      THIRD in the same feature (`intake/selectSources.ts` — the one that
//      decides which FILES get fetched) interpolated titles in the clear.
//
// Six is the argument. Each fix was correct and none generalised, because a
// per-call-site fix cannot; and note that #6 is the mechanism itself repeating
// the mistake it was built to stop, by being scoped narrower than the defect.
//
// ⚠ WHAT THIS CANNOT SEE, stated so nobody reads it as more than it is (M1): it
// is a TEXT scan over the files NAMED BELOW. A prompt built by string
// concatenation instead of a template literal, a helper in a third file, or a
// value laundered through a local before interpolation all pass it — as does any
// builder not in that list, which is exactly how #6 happened. It closes the shape
// this repo actually writes, not the space of all shapes. `chat/attachments.ts`
// and `chat2/` are held by their own per-site tests, not by this.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The prompt builders. A new one belongs in this list on the day it is written.
 *
 * `intake/selectSources.ts` is here because leaving it out is how the scan came
 * to certify "the prompt boundaries are closed" while a SIXTH builder in the
 * same feature interpolated document titles, company names and raw conversation
 * turns in the clear — and that one decides which FILES get fetched. A scan that
 * names two of three builders is a scoped law overstating its own closure, which
 * is the failure app.md's header calls out by name.
 */
const BUILDERS = ['prompt.ts', 'compose.ts', '../intake/selectSources.ts']

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
  // selectSources.ts. Each of these produces a value that cannot carry a
  // caller's text — a fixed label, a date, or a choice between two literals.
  { match: 'kindLabel(', why: 'maps a known kind to one of a fixed set of labels' },
  { match: "s.remote ? 'published'", why: 'picks between two literals' },
  { match: 's.when ? s.when.slice(0, 10)', why: "a date's first ten characters, or the literal 'unknown'" },
  { match: 'here.has(s.sourceId)', why: 'picks between a literal and the empty string' },
  { match: "s.remote ? ' | FROM MAYA", why: 'picks between three literals' },
  { match: 'lines.join', why: 'the composite of the source lines built above, each already sanitised' },
  { match: 'proposal\n', why: 'a composite whose own interpolations are scanned on their own lines' },
]

/**
 * A BARE `${name}` is a composite this same file built a few lines up — `talk`,
 * `shelf`, `partial`, `marked`. Allowing it is not a hole, because the scan
 * reads the WHOLE file: whatever those composites interpolate is checked on its
 * own line. What it does mean is that a composite assembled in ANOTHER file and
 * imported would pass unseen, which is the limit stated in the header.
 */
const BARE_IDENTIFIER = /^\$\{[A-Za-z_$][\w$]*\}$/

/**
 * THE predicate — one function, so the mutation case below exercises what the
 * two file scans actually run.
 *
 * It was written twice, and review was right to call that what it is: a
 * mutation test against a re-implementation proves a COPY can go red. Same
 * argument the gate harness makes for importing the production chunker.
 */
export function unsanitised(source: string): string[] {
  // EVERY interpolation, not only the ones naming `input`. Scoping this to
  // `input.` is what let the conversation region ship unguarded: turns reach the
  // template as `${defang(t.content)}` through a `.map`, and `t` is not `input`
  // by the time it is interpolated. Nested braces are not chased — the capture
  // stops at the first `}`, which is enough to see what is wrapped.
  return (source.match(/\$\{[^}]*\}?/g) ?? []).filter(
    (expr) =>
      // The NAME, not `name(` — a sanitiser is as often passed by reference
      // (`.map(fencePart)`) as called, and requiring the paren failed a line
      // that was already correct.
      !SANITISERS.some((s) => new RegExp(`\\b${s}\\b`).test(expr)) &&
      !ALLOWED.some((a) => expr.includes(a.match)) &&
      !BARE_IDENTIFIER.test(expr)
  )
}

for (const file of BUILDERS) {
  test(`every untrusted interpolation in ${file} goes through a sanitiser`, () => {
    const src = readFileSync(join(__dirname, file), 'utf8')
    assert.ok(src.includes('${'), `no interpolations found in ${file} — did the scan break?`)
    const unguarded = unsanitised(src)
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
  const found = unsanitised(fake)
  // The nested case is reported as the OUTER expression, because the capture
  // stops at the first `}`. That is the honest shape of a text scan and it is
  // still red, which is the property that matters — the message points a reader
  // at the right line either way.
  assert.deepEqual(found, ['${input.workspaceName}', '${turns.map((t) => `${t.content}'])
})
