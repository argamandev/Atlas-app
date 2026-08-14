import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * Every test file in the tree must be registered in `package.json`'s test
 * script, because that script is an EXPLICIT list and a file missing from it
 * never runs.
 *
 * Two real cases, one hour apart:
 *
 * - `src/lib/api/errorShape.test.ts` — written to guard the round-two BLOCKER,
 *   passing when invoked directly, and absent from the battery. It would have
 *   been cited as proof while guarding nothing.
 * - `src/lib/live/search.test.ts` and `src/lib/live/syncEngine.test.ts` — 10
 *   tests that had been in the tree, passing, and unregistered for far longer.
 *   Nobody noticed, because a battery that does not run a file cannot report it.
 *
 * The first was found by regenerating a count from a command; the other two were
 * found by a reviewer. Neither is a repeatable mechanism, so this is one.
 *
 * STATED LIMIT: the walk covers `src/` and `scripts/` only. A test file outside
 * both is invisible to a guard whose headline promise is "every test file in the
 * tree" — said here rather than left for someone to discover, which is the whole
 * habit this branch has been trying to build.
 */

const ROOT = resolve(process.cwd())

function findTests(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) findTests(p, out)
    else if (/\.test\.tsx?$/.test(entry)) out.push(p)
  }
  return out
}

test('every test file in the tree is registered in the npm test script', () => {
  const script: string = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts.test
  const registered = new Set((script.match(/[^\s]+\.test\.tsx?/g) ?? []).map((p) => p.replace(/\\/g, '/')))

  const onDisk = [...findTests(join(ROOT, 'src')), ...findTests(join(ROOT, 'scripts'))].map((p) =>
    relative(ROOT, p).replace(/\\/g, '/')
  )

  // Guard the guard: if the walk finds nothing, this test is vacuous.
  assert.ok(onDisk.length > 5, `only ${onDisk.length} test files found on disk — the walk is broken`)

  const missing = onDisk.filter((p) => !registered.has(p)).sort()
  assert.deepEqual(
    missing,
    [],
    'These test files exist but never run — add them to the "test" script in package.json:\n' +
      missing.join('\n')
  )

  // The reverse direction matters too: a registered file that no longer exists
  // makes `npm test` fail outright, but a stale entry left behind by a rename
  // is worth naming precisely rather than reading as a module-resolution error.
  const onDiskSet = new Set(onDisk)
  const ghosts = [...registered].filter((p) => !onDiskSet.has(p)).sort()
  assert.deepEqual(ghosts, [], `These files are registered but do not exist:\n${ghosts.join('\n')}`)
})

/**
 * ARCHITECTURE.md's test index must name every registered test file.
 *
 * ADDED 08a, paying an ADR-0002 recurrence. Cold review found that index still
 * naming `api/contextStatus.test.ts` and `api/messageFlags.test.ts` after this
 * branch moved both to `src/lib/chat/`, and missing both files the branch added
 * — while the surrounding prose claimed "regenerated from commands, never edited
 * by hand". That is M1's exact defect: a document asserting a property nothing
 * measured. The ship gate already re-measures the two COUNTS in that header; the
 * LIST beneath them was checked by nobody.
 *
 * This is the same guard one tier out: `npm test` fails, rather than a reviewer
 * happening to diff a 100-line list by eye.
 *
 * STATED LIMIT: this proves each registered path is MENTIONED in the index. It
 * does not prove the index is free of extra names, and deliberately so — the
 * file legitimately discusses `correction.test.ts` and others in prose around
 * the list, so an exact set comparison would fail on its own commentary.
 */
test("ARCHITECTURE.md's test index names every registered test file", () => {
  const script: string = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts.test
  const registered = (script.match(/[^\s]+\.test\.tsx?/g) ?? []).map((p) => p.replace(/\\/g, '/'))
  const doc = readFileSync(join(ROOT, 'ARCHITECTURE.md'), 'utf8')

  assert.ok(registered.length > 5, 'no registered tests parsed — this test would be vacuous')

  // The index lists paths relative to `src/lib/`, which is how the doc reads.
  const absent = registered
    .filter((p) => p.startsWith('src/lib/'))
    .map((p) => p.slice('src/lib/'.length))
    .filter((rel) => !doc.includes(rel))
    .sort()

  assert.deepEqual(
    absent,
    [],
    "ARCHITECTURE.md's test index does not name these registered test files:\n" +
      absent.join('\n') +
      "\nThe index is generated from `package.json`'s test script — regenerate it, do not patch by memory."
  )
})
