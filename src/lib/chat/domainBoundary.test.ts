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
 * It was wrong three times, always the same way: claiming coverage the pattern
 * did not have.
 *
 *   v1 matched `import … from` only, while claiming dynamic imports would fail.
 *   v2 added `export … from` + `import(…)`, claimed "all three" — missed bare
 *      `import '@/lib/api/chat'`.
 *   v3 added the bare form, claimed "all FOUR static ways" — missed the backtick
 *      specifier, `require`, and TS import-equals.
 *
 * Each round the pattern got better and the sentence stayed a liability, because
 * PROSE THAT ENUMERATES SYNTAX IS A CLAIM NO TEST CAN HOLD: a test cannot assert
 * about syntax nobody told it exists. So the enumeration was deleted, not
 * extended again. `TRANSPORT_FORMS` is now both the claim and the fixture list,
 * and it cannot disagree with itself.
 *
 * WHAT IS NOT COVERED, named rather than implied:
 *   1. A specifier assembled at runtime (`import(BASE + '/chat')`). No such
 *      construction exists in this directory.
 *   2. This file itself — see `SELF`. A transport import added HERE is invisible.
 *      Deliberate (the file holds the fixtures) and a real hole, bounded by the
 *      fact that a test file never reaches production.
 *   3. Comments and strings are NOT stripped, so commented-out code can trip
 *      this. Which shapes do and don't is deliberately NOT enumerated here: that
 *      sentence was rewritten four times and was wrong four times, most recently
 *      because `[^;]*?` spans newlines and this repo writes no semicolons, so a
 *      real import on the line above satisfies the `^\s*` anchor for the comment
 *      below it. The error direction is a false positive, which is the safe one,
 *      and it is why `SELF` has to exist. That is the whole claim.
 *   4. Anything outside `TRANSPORT_FORMS`. This is a text scan: it defends
 *      against the coupling being re-added in ordinary code, not against someone
 *      determined to hide it. Stated plainly because three rounds were spent
 *      pretending otherwise.
 */

const DIR = 'src/lib/chat'

/**
 * Files still permitted to import transport, each with the reason and the work
 * that closes it. Adding a name here is allowed only with both.
 */
const ALLOWED = new Set<string>([])

// The specifier. Excludes all three delimiters, so a backtick cannot be run past
// when the delimiter class below accepts one.
const TRANSPORT_PATH = String.raw`(@\/lib\/api\/[^'"\`]+|\.\.\/api\/[^'"\`]+)`

/**
 * NO COMPLETENESS CLAIM IS MADE HERE, and that is the fix rather than a hedge.
 *
 * Three consecutive review rounds died on this docstring, each time the same way:
 *   v1 matched `import … from`, claimed dynamic imports too.
 *   v2 added `export … from` + `import(…)`, claimed "all three".
 *   v3 added bare `import '…'`, claimed "all FOUR static ways" — and missed the
 *      backtick form ``import(`@/lib/api/chat`)``, plus `require` and TS
 *      import-equals.
 *
 * The pattern was never the problem; the sentence was. Prose that enumerates
 * syntax is a claim no test can hold, because a test cannot assert about syntax
 * nobody told it exists — so the enumeration is gone. What this guard catches is
 * exactly `TRANSPORT_FORMS` below, which is both the fixture list and the
 * documentation, and cannot disagree with itself.
 *
 * This is deliberately the honest weaker statement (`CONTEXT.md`: a law with no
 * mechanism says so). The guard is a text scan; it defends against the coupling
 * being re-added in ordinary code, not against someone determined to hide it.
 */
const TRANSPORT_IMPORT = new RegExp(
  String.raw`(?:(?:^\s*(?:import|export)\s[^;]*?from\s*)|(?:^\s*import\s*)|(?:\b(?:import|require)\s*\(\s*))['"\`]${TRANSPORT_PATH}['"\`]`,
  'gm'
)

/**
 * THE CLAIM, as data. Every form here is asserted below; nothing outside it is
 * claimed. Three review rounds were spent on a prose enumeration that kept
 * outrunning the pattern, so the enumeration now lives where it is checked.
 */
const TRANSPORT_FORMS = [
  `import type { ChatSnip } from '@/lib/api/chat'`,
  `import { streamChat } from '@/lib/api/chat2'`,
  `import def, { named } from '@/lib/api/chat'`,
  `export type { ClientChatEvent } from '@/lib/api/chat2'`,
  `export { parseChatEvent as p } from '@/lib/api/chat2'`,
  `export * from '@/lib/api/chat2'`,
  `import x from '../api/chat'`,
  `import '@/lib/api/chat'`, // bare side-effect — missed by v1 and v2
  `import '../api/chat'`,
  `const m = await import('@/lib/api/chat')`,
  'const m = await import(`@/lib/api/chat`)', // backtick — missed by v3
  `const m = require('@/lib/api/chat')`,
  `import chat = require('@/lib/api/chat')`,
]

/** Near misses that must NOT trip it. */
const NOT_TRANSPORT = [
  `import type { ChatMode } from '@/lib/chat2/mode'`,
  `import { detectDir } from '@/lib/utils'`,
  `import { apiOf } from '@/lib/apiary/thing'`, // 'api' as a path substring
  `const path = '@/lib/api/chat'`, // a bare string is not an import
  `importantThing('@/lib/api/chat')`,
]

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

test('the pattern catches every form this guard claims', () => {
  // GUARDS THE GUARD. A file scan that finds nothing looks identical whether the
  // rule holds or the pattern is broken, so every claimed form is asserted. The
  // list above IS the claim — there is no prose enumeration to fall out of sync.
  for (const line of TRANSPORT_FORMS) {
    assert.match(line, new RegExp(TRANSPORT_IMPORT.source), `pattern missed: ${line}`)
  }
  for (const line of NOT_TRANSPORT) {
    assert.doesNotMatch(line, new RegExp(TRANSPORT_IMPORT.source), `pattern over-matched: ${line}`)
  }
  // Multi-line imports are ordinary in this repo. `[^;]*?` is a negated class, so
  // it spans newlines without the `s` flag — asserted rather than reasoned about.
  assert.match(
    `import {\n  streamChat,\n} from '@/lib/api/chat'`,
    new RegExp(TRANSPORT_IMPORT.source),
    'a multi-line import escaped the scan'
  )
})

test('every allowlisted file exists', () => {
  // An allowlist entry for a deleted file is a silent widening: it would let a
  // future file of the same name import transport with no review.
  const present = new Set(sourceFiles())
  for (const name of ALLOWED) {
    assert.ok(present.has(name), `allowlisted '${name}' no longer exists — remove it from ALLOWED`)
  }
})
