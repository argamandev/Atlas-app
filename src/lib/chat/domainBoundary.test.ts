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
 * STATED LIMIT: this scans import statements textually, with comments and
 * strings left intact. A dynamic `await import('@/lib/api/…')` inside a function
 * body would read as an import here and fail the test, which is the safe
 * direction; an import assembled from a variable would be invisible, which is
 * not. No such construction exists in this directory today.
 */

const DIR = 'src/lib/chat'

/**
 * Files still permitted to import transport, each with the reason and the work
 * that closes it. Adding a name here is allowed only with both.
 */
const ALLOWED = new Set<string>([])

const TRANSPORT_IMPORT = /^\s*import\s[^;]*?from\s+['"](@\/lib\/api\/[^'"]+|\.\.\/api\/[^'"]+)['"]/gm

function sourceFiles(): string[] {
  return readdirSync(DIR).filter((f) => /\.tsx?$/.test(f))
}

test('the chat domain directory imports no transport', () => {
  const offenders: string[] = []

  for (const file of sourceFiles()) {
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

test('every allowlisted file exists', () => {
  // An allowlist entry for a deleted file is a silent widening: it would let a
  // future file of the same name import transport with no review.
  const present = new Set(sourceFiles())
  for (const name of ALLOWED) {
    assert.ok(present.has(name), `allowlisted '${name}' no longer exists — remove it from ALLOWED`)
  }
})
