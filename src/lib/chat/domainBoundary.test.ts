import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `src/lib/chat` is DOMAIN vocabulary. It may not import transport.
 *
 * THE DEFECT THIS EXISTS FOR (ticket 08a). `ChatSnip`, `ChatSource` and the
 * stored-message honesty helpers were declared inside `lib/api/chat.ts` — the
 * client that speaks HTTP to the OLD `/api/chat` route. Eleven modules imported
 * them from there, and most of them never call chat at all: the PDF viewer, the
 * workspace shelf, the live facet panes. So retiring a wire format — which is
 * ticket 08's job, and purely a transport change — could not be done without a
 * diff touching eleven unrelated files, and could not be reviewed as one thing.
 *
 * The seam belongs at the transport. `lib/api/*` is replaced whenever the wire
 * format changes; what a snip IS does not change with it. Prose saying so is the
 * weakest tier (ADR-0002), and prose is exactly what let the coupling grow the
 * first time — nothing failed when a domain type was declared in a fetch client.
 *
 * THE ALLOWLIST IS EMPTY, and stayed empty on purpose. It shipped with one entry
 * — `incompleteCopy.ts`, which took `ClientIncompleteCode` from `lib/api/chat2`
 * because the code vocabulary was declared server-side and re-declared
 * client-side. Slice 08a.2 collapsed that into `chat2/protocol.ts`, so the copy
 * map now learns the vocabulary from the protocol rather than from a fetch
 * client, and the exception was removed rather than left standing.
 *
 * Keep it empty. An entry is permitted only with a reason AND the work that
 * closes it, both written beside the name.
 *
 * STATED LIMIT — and the history of this paragraph IS the limit's justification.
 * It has been wrong twice, both times in the same direction: claiming coverage
 * the pattern did not have.
 *
 *   v1 matched `import … from` only, while claiming dynamic imports would fail.
 *   v2 added `export … from` and `import(…)`, and claimed completeness — missing
 *      the bare side-effect `import '@/lib/api/chat'`, caught at round-2 review.
 *
 * That is M1 twice inside one branch, so the prose is no longer where the claim
 * lives: the four forms are asserted by name in `the pattern catches every static
 * way to reach transport`, and this paragraph only records what is left.
 *
 * WHAT IS GENUINELY NOT COVERED, all three named rather than implied:
 *   1. A specifier assembled from a variable (`import(BASE + '/chat')`). No such
 *      construction exists in this directory.
 *   2. This file itself — see `SELF`. A transport import added HERE is invisible.
 *      The exclusion is deliberate (the file holds the fixtures) and the hole is
 *      real; it is bounded by the fact that a test file never reaches production.
 *   3. Comments and strings are NOT stripped, so an import-shaped line inside a
 *      comment fails the test. That is the safe direction, and it is the reason
 *      `SELF` has to exist at all.
 */

const DIR = 'src/lib/chat'

/**
 * Files still permitted to import transport, each with the reason and the work
 * that closes it. Adding a name here is allowed only with both.
 */
const ALLOWED = new Set<string>([])

const TRANSPORT_PATH = String.raw`(@\/lib\/api\/[^'"]+|\.\.\/api\/[^'"]+)`

/**
 * All FOUR static ways a module can reach transport:
 *   import … from '…'   ·   export … from '…'   ·   import('…')   ·   import '…'
 *
 * Version 1 matched only the first while claiming the third. Version 2 added the
 * second and third and claimed completeness — and missed the fourth, the bare
 * side-effect import, which cold review caught. Twice in a row the docstring
 * outran the pattern, which is why the fixtures below now assert each form by
 * name rather than the prose asserting it.
 */
const TRANSPORT_IMPORT = new RegExp(
  String.raw`(?:(?:^\s*(?:import|export)\s[^;]*?from\s*)|(?:^\s*import\s*)|(?:\bimport\s*\(\s*))['"]${TRANSPORT_PATH}['"]`,
  'gm'
)

/**
 * This file is the GUARD, not a subject. It necessarily contains transport
 * import strings — the fixtures the pattern is asserted against below — and
 * scanning itself makes it fail on its own evidence, which is noise rather than
 * a finding. Excluded here and NOT via `ALLOWED`, because the two mean different
 * things: `ALLOWED` is a debt with work that closes it, this is a category error.
 */
const SELF = 'domainBoundary.test.ts'

function sourceFiles(): string[] {
  return readdirSync(DIR).filter((f) => /\.tsx?$/.test(f))
}

/** The files this rule actually governs. */
function scannedFiles(): string[] {
  return sourceFiles().filter((f) => f !== SELF)
}

test('the chat domain directory imports no transport', () => {
  const offenders: string[] = []

  for (const file of scannedFiles()) {
    if (ALLOWED.has(file)) continue
    const src = readFileSync(join(DIR, file), 'utf8')
    for (const m of src.matchAll(TRANSPORT_IMPORT)) {
      offenders.push(`${file} → ${m[1]}`)
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `src/lib/chat is domain vocabulary and must not import from lib/api.\n` +
      `Offending imports:\n  ${offenders.join('\n  ')}\n` +
      `If the type is genuinely about the wire format it belongs in lib/api; ` +
      `if it is about what the user is looking at, it belongs here and the ` +
      `dependency points the wrong way.`
  )
})

test('the two modules this rule was written for are actually covered', () => {
  // Guards the guard: a rename that moved these out of the scan would leave the
  // test green while checking nothing — the failure mode M1 is about. Both are
  // asserted present AND absent from the allowlist.
  for (const required of ['grounding.ts', 'messageState.ts']) {
    assert.ok(sourceFiles().includes(required), `${required} is missing from ${DIR}`)
    assert.ok(!ALLOWED.has(required), `${required} must never be allowlisted`)
  }
})

test('the pattern catches every static way to reach transport', () => {
  // GUARDS THE GUARD (cold review, 08a). The scan is only as good as this
  // regex, and its first version silently missed two of these three while the
  // docstring claimed otherwise. Asserted directly, because a file scan that
  // finds nothing looks identical whether the rule holds or the pattern is wrong.
  const shouldMatch = [
    `import type { ChatSnip } from '@/lib/api/chat'`,
    `import { streamChat } from '@/lib/api/chat2'`,
    `export type { ClientChatEvent } from '@/lib/api/chat2'`,
    `export { parseChatEvent } from '@/lib/api/chat2'`,
    `const m = await import('@/lib/api/chat')`,
    `import x from '../api/chat'`,
    `import '@/lib/api/chat'`, // bare side-effect import — missed by versions 1 AND 2
    `import '../api/chat'`,
    `export * from '@/lib/api/chat2'`,
  ]
  for (const line of shouldMatch) {
    assert.match(line, new RegExp(TRANSPORT_IMPORT.source), `pattern missed: ${line}`)
  }

  const shouldNotMatch = [
    `import type { ChatMode } from '@/lib/chat2/mode'`,
    `import { detectDir } from '@/lib/utils'`,
    `import { apiOf } from '@/lib/apiary/thing'`, // 'api' as a path substring, not lib/api
  ]
  for (const line of shouldNotMatch) {
    assert.doesNotMatch(line, new RegExp(TRANSPORT_IMPORT.source), `pattern over-matched: ${line}`)
  }
})

test('every allowlisted file exists', () => {
  // An allowlist entry for a deleted file is a silent widening: it would let a
  // future file of the same name import transport with no review.
  const present = new Set(sourceFiles())
  for (const name of ALLOWED) {
    assert.ok(present.has(name), `allowlisted '${name}' no longer exists — remove it from ALLOWED`)
  }
})
